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
        path_params::{InviteTokenPath, TripInvitePath, TripPath},
        trip::{CreateTripInviteRequest, TripInvite, TripInviteCreated, TripInvitePreview},
    },
    query::trips,
    state::AppState,
};

use super::access::{caller, require_admin};
use super::respond::failure;

/// How long a link works when the admin does not say: long enough to reach
/// everyone in a group chat, short enough that an old link is not a key.
const DEFAULT_DAYS: i64 = 14;
const MAX_DAYS: i64 = 30;

pub fn invite_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_invites, list_invites_docs).post_with(create_invite, create_invite_docs),
        )
        .api_route(
            "/{invite_id}",
            aide::axum::routing::delete_with(delete_invite, delete_invite_docs),
        )
        .with_state(state)
}

/// The recipient's side: one route, reached by the token alone.
pub fn preview_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/{token}", get_with(preview_invite, preview_invite_docs))
        .with_state(state)
}

pub async fn list_invites(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::list_invites(&app.pg_pool, trip_id).await {
        Ok(invites) => Json(invites).into_response(),
        Err(err) => failure(&format!("listing trip {trip_id} invites"), err),
    }
}

doc_fn!(list_invites_docs, op =>
    op.input::<Path<TripPath>>()
        .description("The trip's invite links that still work. Admins only. Tokens are never listed - only their hash is kept.")
        .response::<200, Json<Vec<TripInvite>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn create_invite(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
    body: Option<Json<CreateTripInviteRequest>>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
        return res;
    }
    let days = body
        .and_then(|Json(b)| b.expires_in_days)
        .unwrap_or(DEFAULT_DAYS);
    if !(1..=MAX_DAYS).contains(&days) {
        return ApiError::validation(format!("expires_in_days must be 1 to {MAX_DAYS}"))
            .with_target("expires_in_days")
            .into_response();
    }

    match trips::create_invite(&app.pg_pool, trip_id, &caller_id, days).await {
        Ok(created) => (StatusCode::CREATED, Json(created)).into_response(),
        Err(err) => failure(&format!("creating a trip {trip_id} invite"), err),
    }
}

doc_fn!(create_invite_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Make an invite link. Admins only. The response carries the token - the only time it is shown; the link is `/invite/{token}` on the web app. It works for any number of people until it expires or is withdrawn.")
        .response_with::<201, Json<TripInviteCreated>, _>(|res| res.description("Created"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn delete_invite(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripInvitePath { trip_id, invite_id }): Path<TripInvitePath>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::delete_invite(&app.pg_pool, trip_id, invite_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(
            &format!("withdrawing trip {trip_id} invite {invite_id}"),
            err,
        ),
    }
}

doc_fn!(delete_invite_docs, op =>
    op.input::<Path<TripInvitePath>>()
        .description("Withdraw an invite link, so nobody else can join through it. Admins only. Nobody who already joined is removed.")
        .response_with::<204, (), _>(|res| res.description("Withdrawn"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

/// Open without signing in: the person holding the link usually has no
/// account yet, and the page has to tell them what they are joining before
/// asking them to make one.
pub async fn preview_invite(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(InviteTokenPath { token }): Path<InviteTokenPath>,
) -> impl IntoApiResponse {
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    match trips::preview_invite(&app.pg_pool, &token, viewer_id.as_deref()).await {
        Ok(Some(preview)) => Json(preview).into_response(),
        Ok(None) => {
            ApiError::not_found("This invite link has expired or was withdrawn").into_response()
        }
        Err(err) => failure("previewing an invite", err),
    }
}

doc_fn!(preview_invite_docs, op =>
    op.input::<Path<InviteTokenPath>>()
        .description("What an invite link leads to: the trip's name and dates and who sent it - nothing of its plan or people. Works signed out. An unknown, expired or withdrawn link is a 404, one answer for all three. Join with `POST /trips/{trip_id}/members` and `{\"invite\": token}`.")
        .response::<200, Json<TripInvitePreview>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Unknown, expired or withdrawn"))
        .tag("Trips")
);
