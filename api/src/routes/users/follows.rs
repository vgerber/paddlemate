use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::Deserialize;

use super::{UserPath, resolve_self};
use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::user::User,
    query::follows,
    state::AppState,
};

#[derive(Deserialize, JsonSchema)]
pub struct FollowingPath {
    /// Whose following list is edited; only "me" (or the caller's own id).
    user_id: String,
    /// The user to follow or unfollow.
    target_id: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct FollowerPath {
    /// Whose followers are edited; only "me" (or the caller's own id).
    user_id: String,
    /// The user whose follow request is being answered.
    follower_id: String,
}

#[derive(Debug, PartialEq, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum FollowStatus {
    Accepted,
    Pending,
}

#[derive(Deserialize, JsonSchema)]
pub struct FollowersQuery {
    /// "pending" lists incoming follow requests instead of accepted followers.
    status: Option<FollowStatus>,
}

#[derive(Deserialize, JsonSchema)]
pub struct UpdateFollowerBody {
    /// Only "accepted" is supported. Reject a request by deleting the follow.
    status: FollowStatus,
}

pub async fn list_followers(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<UserPath>,
    Query(query): Query<FollowersQuery>,
) -> impl IntoApiResponse {
    let user_id = match resolve_self(&path.user_id, token.user_id()) {
        Ok(id) => id,
        Err(response) => return response,
    };

    let followers = if query.status == Some(FollowStatus::Pending) {
        follows::list_pending_requests(&app.pg_pool, user_id).await
    } else {
        follows::list_followers(&app.pg_pool, user_id).await
    };

    match followers {
        Ok(users) => Json(users as Vec<User>).into_response(),
        Err(err) => {
            tracing::error!("Error listing followers: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_followers_docs, op =>
    op.description(
        "List a user's followers (accepted follows). With status=pending, the incoming follow requests waiting on them. Only \"me\" is readable.",
    )
        .response::<200, Json<Vec<User>>>()
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Not permitted"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

pub async fn list_following(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<UserPath>,
) -> impl IntoApiResponse {
    let user_id = match resolve_self(&path.user_id, token.user_id()) {
        Ok(id) => id,
        Err(response) => return response,
    };

    match follows::list_following(&app.pg_pool, user_id).await {
        Ok(users) => Json(users as Vec<User>).into_response(),
        Err(err) => {
            tracing::error!("Error listing following: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_following_docs, op =>
    op.description("List the users someone follows (accepted follows only). Only \"me\" is readable.")
        .response::<200, Json<Vec<User>>>()
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Not permitted"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

pub async fn follow_user(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<FollowingPath>,
) -> impl IntoApiResponse {
    let user_id = match resolve_self(&path.user_id, token.user_id()) {
        Ok(id) => id,
        Err(response) => return response,
    };

    if user_id == path.target_id {
        return ApiError::validation("Cannot follow yourself").into_response();
    }

    match follows::follow_user(&app.pg_pool, user_id, &path.target_id).await {
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
    op.description("Follow a user, or resend a pending request. Repeating the call changes nothing. Only the caller's own list is writable.")
        .response_with::<204, (), _>(|res| res.description("Follow request sent"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Not permitted"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Cannot follow yourself"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("User not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

pub async fn delete_follow(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<FollowingPath>,
) -> impl IntoApiResponse {
    let user_id = match resolve_self(&path.user_id, token.user_id()) {
        Ok(id) => id,
        Err(response) => return response,
    };

    // The query clears the pair in either direction, so this also cancels
    // a request the caller sent and never got answered.
    match follows::delete_follow(&app.pg_pool, user_id, &path.target_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!("Error removing follow: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_follow_docs, op =>
    op.description("Unfollow a user, or withdraw a pending follow request. Only the caller's own list is writable.")
        .response_with::<204, (), _>(|res| res.description("Removed successfully"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Not permitted"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);

pub async fn update_follower(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<FollowerPath>,
    Json(body): Json<UpdateFollowerBody>,
) -> impl IntoApiResponse {
    let user_id = match resolve_self(&path.user_id, token.user_id()) {
        Ok(id) => id,
        Err(response) => return response,
    };

    if body.status != FollowStatus::Accepted {
        return ApiError::validation("Only \"accepted\" is supported").into_response();
    }

    match follows::accept_follow(&app.pg_pool, &path.follower_id, user_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error accepting follow request: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_follower_docs, op =>
    op.description("Answer a pending follow request by setting its status to \"accepted\". Only the caller's own requests are writable.")
        .response_with::<204, (), _>(|res| res.description("Request accepted"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Not permitted"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Unsupported status"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("No pending request found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Follows")
);
