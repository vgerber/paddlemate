mod favorites;
mod follows;
mod tokens;

use aide::axum::{
    ApiRouter, IntoApiResponse,
    routing::{delete_with, get_with, patch_with, put_with},
};
use axum::{
    Extension, Json,
    extract::State,
    response::{IntoResponse, Response},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    doc_fn, error::ApiError, layers::auth::AuthToken, query::follows as follows_query,
    state::AppState,
};

/// Everything owned by or about a user: the user list, the follow graph,
/// starred sections and API tokens.
///
/// A collection that could describe somebody else takes the user id in the
/// path, with "me" as the alias for the caller, so opening it up for
/// profile views is an authorization change rather than a new route.
/// Writes to those collections are still the caller's own. API tokens are
/// the exception: they are credentials that never describe another user, so
/// their path says "me" outright.
pub fn users_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/", get_with(list_users, list_users_docs))
        .api_route(
            "/{user_id}/followers",
            get_with(follows::list_followers, follows::list_followers_docs),
        )
        .api_route(
            "/{user_id}/followers/{follower_id}",
            patch_with(follows::update_follower, follows::update_follower_docs),
        )
        .api_route(
            "/{user_id}/following",
            get_with(follows::list_following, follows::list_following_docs),
        )
        .api_route(
            "/{user_id}/following/{target_id}",
            put_with(follows::follow_user, follows::follow_user_docs)
                .delete_with(follows::delete_follow, follows::delete_follow_docs),
        )
        .api_route(
            "/{user_id}/favorites/sections",
            get_with(favorites::list_favorites, favorites::list_favorites_docs),
        )
        .api_route(
            "/{user_id}/favorites/sections/{section_id}",
            put_with(favorites::add_favorite, favorites::add_favorite_docs)
                .delete_with(favorites::remove_favorite, favorites::remove_favorite_docs),
        )
        .api_route(
            "/me/tokens",
            get_with(tokens::list_tokens, tokens::list_tokens_docs)
                .post_with(tokens::create_token, tokens::create_token_docs),
        )
        .api_route(
            "/me/tokens/{token_id}",
            delete_with(tokens::revoke_token, tokens::revoke_token_docs),
        )
        .with_state(state)
}

/// Resolves the user id in a path, where "me" names the caller. Another
/// user's data stays closed for now; the id is in the path so opening it
/// up for profile views is a change here rather than a new route.
fn resolve_self<'a>(path_id: &str, viewer: &'a str) -> Result<&'a str, Response> {
    if path_id == "me" || path_id == viewer {
        Ok(viewer)
    } else {
        Err(ApiError::forbidden("Not permitted").into_response())
    }
}

/// Addresses a user's own sub-collection; "me" for the caller.
#[derive(Deserialize, JsonSchema)]
pub struct UserPath {
    user_id: String,
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

async fn list_users(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    let viewer_id = token.user_id();

    match follows_query::list_all_users_with_follow_status(&app.pg_pool, viewer_id).await {
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
    op.description("List all users with the caller's follow status for each.")
        .response::<200, Json<Vec<UserWithFollowStatusResponse>>>()
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Users")
);
