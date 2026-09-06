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
        trip::{PatchTripMemberRequest, TripMember, TripMemberRole},
    },
    query::trips,
    state::AppState,
};

use super::{constraint_message, require_admin};

pub fn member_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_trip_members, list_trip_members_docs).post_with(join_trip, join_trip_docs),
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
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    match trips::can_view(&app.pg_pool, trip_id, viewer_id.as_deref()).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error checking trip {} visibility: {}", trip_id, err);
            return ApiError::internal().into_response();
        }
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
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    match trips::can_view(&app.pg_pool, trip_id, viewer_id.as_deref()).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error checking trip {} visibility: {}", trip_id, err);
            return ApiError::internal().into_response();
        }
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
pub async fn join_trip(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match trips::can_view(&app.pg_pool, trip_id, Some(token.user_id())).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error checking trip {} visibility: {}", trip_id, err);
            return ApiError::internal().into_response();
        }
    }

    match trips::join_trip(&app.pg_pool, trip_id, token.user_id()).await {
        Ok(Some(member)) => (StatusCode::CREATED, Json(member)).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error joining trip {}: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(join_trip_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Join a trip. Open to anyone who may see it; the member is taken from the token.")
        .response_with::<201, Json<TripMember>, _>(|res| res.description("Joined"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not visible"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn patch_trip_member(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripMemberPath { trip_id, user_id }): Path<TripMemberPath>,
    Json(body): Json<PatchTripMemberRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    let is_self = token.user_id() == user_id;

    // Attendance is the member's own record; role is an admin decision.
    if !is_self || body.role.is_some() {
        if let Some(res) = require_admin(&app, trip_id, token.user_id()).await {
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
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    // Leaving is always your own to do; removing somebody else is an admin act.
    if token.user_id() != user_id {
        if let Some(res) = require_admin(&app, trip_id, token.user_id()).await {
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
