use aide::axum::{
    ApiRouter, IntoApiResponse,
    routing::{get_with, patch_with, post_with},
};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::user::User,
    query::follows,
    state::AppState,
};

pub fn follows_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/users", get_with(list_users, list_users_docs))
        .api_route("/users/pending", get_with(list_pending, list_pending_docs))
        .api_route(
            "/users/following",
            get_with(list_following, list_following_docs),
        )
        .api_route(
            "/users/followers",
            get_with(list_followers, list_followers_docs),
        )
        .api_route(
            "/users/{user_id}",
            post_with(follow_user, follow_user_docs).delete_with(delete_follow, delete_follow_docs),
        )
        .api_route(
            "/users/{user_id}/accept",
            patch_with(accept_follow_request, accept_follow_request_docs),
        )
        .with_state(state)
}

/// A user with the viewer's outgoing follow status and whether they have a pending request to the viewer.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct UserWithFollowStatusResponse {
    pub id: String,
    pub username: String,
    /// The viewer's outgoing follow status toward this user: "pending", "accepted", or null.
    pub outgoing_status: Option<String>,
    /// Whether this user has a pending request to follow the viewer.
    pub incoming_pending: bool,
}

#[derive(Deserialize, JsonSchema)]
struct UserFollowPath {
    user_id: String,
}

async fn list_users(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    let viewer_id = token.user_id();

    match follows::list_all_users_with_follow_status(&app.pg_pool, viewer_id).await {
        Ok(users) => Json(
            users
                .into_iter()
                .map(|u| UserWithFollowStatusResponse {
                    id: u.id,
                    username: u.username,
                    outgoing_status: u.outgoing_status,
                    incoming_pending: u.incoming_pending,
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(err) => {
            tracing::error!("Error listing users: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_users_docs, op =>
    op.description("List all users with follow status for the authenticated user.")
        .response::<200, Json<Vec<UserWithFollowStatusResponse>>>()
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

async fn list_pending(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();

    match follows::list_pending_requests(&app.pg_pool, user_id).await {
        Ok(users) => Json(users as Vec<User>).into_response(),
        Err(err) => {
            tracing::error!("Error listing pending requests: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_pending_docs, op =>
    op.description("List users who have sent a pending follow request to the authenticated user.")
        .response::<200, Json<Vec<User>>>()
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

async fn list_following(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();

    match follows::list_following(&app.pg_pool, user_id).await {
        Ok(users) => Json(users as Vec<User>).into_response(),
        Err(err) => {
            tracing::error!("Error listing following: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_following_docs, op =>
    op.description("List users the authenticated user is following (accepted follows only).")
        .response::<200, Json<Vec<User>>>()
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

async fn list_followers(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();

    match follows::list_followers(&app.pg_pool, user_id).await {
        Ok(users) => Json(users as Vec<User>).into_response(),
        Err(err) => {
            tracing::error!("Error listing followers: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_followers_docs, op =>
    op.description("List users who follow the authenticated user (accepted follows only).")
        .response::<200, Json<Vec<User>>>()
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

async fn follow_user(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<UserFollowPath>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();

    if user_id == path.user_id {
        return ApiError::validation("Invalid request").into_response();
    }

    match follows::follow_user(&app.pg_pool, user_id, &path.user_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            let msg = err.to_string();
            if msg.contains("foreign key") {
                return ApiError::not_found("Not found").into_response();
            }
            tracing::error!("Error following user: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(follow_user_docs, op =>
    op.description("Send a follow request to a user.")
        .response_with::<204, (), _>(|res| res.description("Follow request sent"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Cannot follow yourself"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("User not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

async fn accept_follow_request(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<UserFollowPath>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();

    // path.user_id is the follower; auth user (following_id) accepts
    match follows::accept_follow(&app.pg_pool, &path.user_id, user_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error accepting follow request: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(accept_follow_request_docs, op =>
    op.description("Accept a pending follow request from a user.")
        .response_with::<204, (), _>(|res| res.description("Request accepted"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("No pending request found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

async fn delete_follow(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<UserFollowPath>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();

    match follows::delete_follow(&app.pg_pool, user_id, &path.user_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!("Error removing follow: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_follow_docs, op =>
    op.description("Remove a follow or reject/cancel a pending follow request.")
        .response_with::<204, (), _>(|res| res.description("Removed successfully"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);
