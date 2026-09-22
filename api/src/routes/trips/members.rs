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
        trip::{AddTripMemberRequest, PatchTripMemberRequest, TripMember},
    },
    query::trips,
    state::AppState,
};

use super::access::{caller, require_admin, require_member};
use super::respond::{failure, outcome};

// Handlers here call the authenticated user `caller_id`: the path already
// carries a `user_id`, and the two are not the same person.
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
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::list_members(&app.pg_pool, trip_id).await {
        Ok(members) => Json(members).into_response(),
        Err(err) => failure(&format!("listing trip {trip_id} members"), err),
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
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::get_member(&app.pg_pool, trip_id, &user_id).await {
        Ok(Some(member)) => Json(member).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(&format!("fetching trip {trip_id} member"), err),
    }
}

doc_fn!(get_trip_member_docs, op =>
    op.input::<Path<TripMemberPath>>()
        .description("Get one member of a trip")
        .response::<200, Json<TripMember>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not visible"))
        .tag("Trips")
);

/// Adding a member is an admin action: a trip is invite-only, so nobody
/// puts themselves in one.
pub async fn add_trip_member(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
    Json(body): Json<AddTripMemberRequest>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };

    if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::add_member(&app.pg_pool, trip_id, &body.user_id).await {
        Ok(Some(member)) => (StatusCode::CREATED, Json(member)).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(&format!("adding a member to trip {trip_id}"), err),
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
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    // Everything below needs the caller on the trip - editing even your own
    // row. Without this the composite FK on attendance was the only guard,
    // and a future per-member field outside that table would have none.
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    // Attendance is the member's own record; role is an admin decision.
    if caller_id != user_id || body.role.is_some() {
        if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
            return res;
        }
    }

    // The last-admin rule is checked inside the write, under the trip lock.
    match trips::patch_member(&app.pg_pool, trip_id, &user_id, &body).await {
        Ok(result) => outcome(result, |member| Json(member).into_response()),
        Err(err) => failure(&format!("patching trip {trip_id} member"), err),
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
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };

    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }
    // Leaving is always your own to do; removing somebody else is an admin act.
    if caller_id != user_id {
        if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
            return res;
        }
    }

    // The last-admin rule is checked inside the delete, under the trip lock.
    match trips::remove_member(&app.pg_pool, trip_id, &user_id).await {
        Ok(result) => outcome(result, |()| StatusCode::NO_CONTENT.into_response()),
        Err(err) => failure(&format!("removing trip {trip_id} member"), err),
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
