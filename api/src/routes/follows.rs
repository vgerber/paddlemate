use aide::axum::{
    ApiRouter, IntoApiResponse,
    routing::{get_with, post_with},
};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{doc_fn, layers::auth::AuthToken, models::user::User, query::follows, state::AppState};

pub fn follows_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/users", get_with(list_users, list_users_docs))
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
            post_with(follow_user, follow_user_docs).delete_with(unfollow_user, unfollow_user_docs),
        )
        .with_state(state)
}

/// A user with a flag indicating whether the viewer is following them.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct UserWithFollowStatusResponse {
    pub id: String,
    pub username: String,
    pub is_following: bool,
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

    match follows::list_all_users_with_follow_status(&app.pg_pool, &viewer_id).await {
        Ok(users) => Json(
            users
                .into_iter()
                .map(|u| UserWithFollowStatusResponse {
                    id: u.id,
                    username: u.username,
                    is_following: u.is_following,
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(err) => {
            tracing::error!("Error listing users: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_users_docs, op =>
    op.description("List all users with follow status for the authenticated user.")
        .response::<200, Json<Vec<UserWithFollowStatusResponse>>>()
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

async fn list_following(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();

    match follows::list_following(&app.pg_pool, &user_id).await {
        Ok(users) => Json(users as Vec<User>).into_response(),
        Err(err) => {
            tracing::error!("Error listing following: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_following_docs, op =>
    op.description("List users the authenticated user is following.")
        .response::<200, Json<Vec<User>>>()
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

async fn list_followers(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();

    match follows::list_followers(&app.pg_pool, &user_id).await {
        Ok(users) => Json(users as Vec<User>).into_response(),
        Err(err) => {
            tracing::error!("Error listing followers: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_followers_docs, op =>
    op.description("List users who follow the authenticated user.")
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
        return StatusCode::BAD_REQUEST.into_response();
    }

    match follows::follow_user(&app.pg_pool, &user_id, &path.user_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            let msg = err.to_string();
            if msg.contains("foreign key") {
                return StatusCode::NOT_FOUND.into_response();
            }
            tracing::error!("Error following user: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(follow_user_docs, op =>
    op.description("Follow a user.")
        .response_with::<204, (), _>(|res| res.description("Followed successfully"))
        .response_with::<400, (), _>(|res| res.description("Cannot follow yourself"))
        .response_with::<404, (), _>(|res| res.description("User not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

async fn unfollow_user(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<UserFollowPath>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();

    match follows::unfollow_user(&app.pg_pool, &user_id, &path.user_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!("Error unfollowing user: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(unfollow_user_docs, op =>
    op.description("Unfollow a user.")
        .response_with::<204, (), _>(|res| res.description("Unfollowed successfully"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);
