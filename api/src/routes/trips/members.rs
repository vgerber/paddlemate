use aide::axum::{ApiRouter, IntoApiResponse, routing::get_with};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        path_params::{TripMemberPath, TripPath},
        trip::{AddTripMemberRequest, PatchTripMemberRequest, TripMember, TripMemberRole},
    },
    query::trips,
    state::AppState,
};

use super::access::{caller, require_admin, require_member};
use super::constraint_message;

pub fn member_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_trip_members, list_trip_members_docs)
                .post_with(add_trip_member, add_trip_member_docs),
        )
        .api_route(
            "/{user_id}",
            get_with(get_trip_member, get_trip_member_docs)
                .patch_with(patch_trip_member, patch_trip_member_docs)
                .delete_with(remove_trip_member, remove_trip_member_docs),
        )
        .with_state(state)
}

pub async fn list_trip_members(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::list_members(&app.pg_pool, trip_id).await {
        Ok(members) => Json(members).into_response(),
        Err(err) => {
            tracing::error!("Error listing trip {} members: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_trip_members_docs, op =>
    op.input::<Path<TripPath>>()
        .description("List the members of a trip, with the dates each can personally make.")
        .response::<200, Json<Vec<TripMember>>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not visible"))
        .tag("Trips")
);

pub async fn get_trip_member(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripMemberPath { trip_id, user_id }): Path<TripMemberPath>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::get_member(&app.pg_pool, trip_id, &user_id).await {
        Ok(Some(member)) => Json(member).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error fetching trip {} member: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_trip_member_docs, op =>
    op.input::<Path<TripMemberPath>>()
        .description("Get one member of a trip")
        .response::<200, Json<TripMember>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not visible"))
        .tag("Trips")
);

/// Open join: seeing the trip is the only requirement, so there is no body and
/// the member is taken from the token.
/// Adding a member is an admin action: a trip is invite-only, so nobody
/// puts themselves in one.
pub async fn add_trip_member(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
    Json(body): Json<AddTripMemberRequest>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };

    if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::add_member(&app.pg_pool, trip_id, &body.user_id).await {
        Ok(Some(member)) => (StatusCode::CREATED, Json(member)).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) if constraint_message(&err).is_some() => {
            ApiError::validation(constraint_message(&err).unwrap_or("Invalid member")).into_response()
        }
        Err(err) => {
            tracing::error!("Error adding member to trip {}: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(add_trip_member_docs, op =>
    op.input::<Path<TripPath>>()
        .input::<Json<AddTripMemberRequest>>()
        .description("Add somebody to a trip. Admins only - a trip is invite-only.")
        .response_with::<201, Json<TripMember>, _>(|res| res.description("Added"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Unknown user"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn patch_trip_member(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripMemberPath { trip_id, user_id }): Path<TripMemberPath>,
    Json(body): Json<PatchTripMemberRequest>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };
    let is_self = caller_id == user_id;

    // Attendance is the member's own record; role is an admin decision.
    if !is_self || body.role.is_some() {
        if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
            return res;
        }
    }

    // Demoting the last admin would leave the trip unmanageable.
    if body.role == Some(TripMemberRole::Member) {
        match (
            trips::member_role(&app.pg_pool, trip_id, &user_id).await,
            trips::admin_count(&app.pg_pool, trip_id).await,
        ) {
            (Ok(Some(TripMemberRole::Admin)), Ok(1)) => {
                return ApiError::validation("A trip must keep at least one admin").into_response();
            }
            (Err(err), _) | (_, Err(err)) => {
                tracing::error!("Error checking trip {} admins: {}", trip_id, err);
                return ApiError::internal().into_response();
            }
            _ => {}
        }
    }

    match trips::patch_member(&app.pg_pool, trip_id, &user_id, &body).await {
        Ok(Some(member)) => Json(member).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(ref err) if constraint_message(err).is_some() => {
            ApiError::validation(constraint_message(err).unwrap()).into_response()
        }
        Err(err) => {
            tracing::error!("Error patching trip {} member: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(patch_trip_member_docs, op =>
    op.input::<Path<TripMemberPath>>()
        .description("Update a member. Role is admin only; arrival and departure are the member's own record.")
        .response::<200, Json<TripMember>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn remove_trip_member(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripMemberPath { trip_id, user_id }): Path<TripMemberPath>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };

    // Leaving is always your own to do; removing somebody else is an admin act.
    if caller_id != user_id {
        if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
            return res;
        }
    }

    match (
        trips::member_role(&app.pg_pool, trip_id, &user_id).await,
        trips::admin_count(&app.pg_pool, trip_id).await,
    ) {
        (Ok(Some(TripMemberRole::Admin)), Ok(1)) => {
            return ApiError::validation("A trip must keep at least one admin").into_response();
        }
        (Err(err), _) | (_, Err(err)) => {
            tracing::error!("Error checking trip {} admins: {}", trip_id, err);
            return ApiError::internal().into_response();
        }
        _ => {}
    }

    match trips::remove_member(&app.pg_pool, trip_id, &user_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error removing trip {} member: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(remove_trip_member_docs, op =>
    op.input::<Path<TripMemberPath>>()
        .description("Remove a member, or leave the trip yourself. The last admin cannot be removed.")
        .response_with::<204, (), _>(|res| res.description("Removed"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Would leave the trip without an admin"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);
