//! The permission questions every feature asks, in one place.
//!
//! Is there a caller, is the caller a server admin, are they in this group.
//! Trip rules build on these in `routes/trips/access.rs`. The status codes are
//! part of the contract: a group non-member gets 404 (the group is private),
//! a member without the needed role gets 403.

use axum::Extension;

use crate::{
    error::ApiError, layers::auth::AuthToken, models::group::GroupMemberRole, query::groups,
    state::AppState,
};

/// The 401 every route answers when it needs a caller and has none.
pub fn unauthenticated() -> ApiError {
    ApiError::unauthorized("Authentication required")
}

/// The caller's token, or the 401 to answer instead.
pub fn signed_in(auth: Option<Extension<AuthToken>>) -> Result<AuthToken, ApiError> {
    match auth {
        Some(Extension(token)) => Ok(token),
        None => Err(unauthenticated()),
    }
}

/// Server admins only. `message` is the 403 text, which differs per route.
pub fn require_server_admin(token: &AuthToken, message: &str) -> Result<(), ApiError> {
    if token.is_server_admin() {
        Ok(())
    } else {
        Err(ApiError::forbidden(message))
    }
}

/// Whether the request is from a signed-in server admin.
pub fn viewer_is_admin(auth: &Option<Extension<AuthToken>>) -> bool {
    auth.as_ref()
        .map(|Extension(t)| t.is_server_admin())
        .unwrap_or(false)
}

/// Group members only; anyone else gets 404.
pub async fn require_group_member(
    app: &AppState,
    group_id: i64,
    user_id: &str,
) -> Result<(), ApiError> {
    match groups::is_member(&app.pg_pool, group_id, &user_id.to_string()).await {
        Ok(true) => Ok(()),
        Ok(false) => Err(ApiError::not_found("Not found")),
        Err(err) => Err(ApiError::from_db(
            &format!("Error checking membership in group {group_id}"),
            err,
        )),
    }
}

/// Group owners and admins only; everyone else gets 403.
pub async fn require_group_admin(
    app: &AppState,
    group_id: i64,
    user_id: &str,
) -> Result<(), ApiError> {
    require_group_role(app, group_id, user_id, |role| {
        matches!(role, GroupMemberRole::Owner | GroupMemberRole::Admin)
    })
    .await
}

/// Group owners only; everyone else gets 403.
pub async fn require_group_owner(
    app: &AppState,
    group_id: i64,
    user_id: &str,
) -> Result<(), ApiError> {
    require_group_role(app, group_id, user_id, |role| {
        *role == GroupMemberRole::Owner
    })
    .await
}

async fn require_group_role(
    app: &AppState,
    group_id: i64,
    user_id: &str,
    allowed: fn(&GroupMemberRole) -> bool,
) -> Result<(), ApiError> {
    match groups::get_member_role(&app.pg_pool, group_id, user_id).await {
        Ok(Some(role)) if allowed(&role) => Ok(()),
        Ok(_) => Err(ApiError::forbidden("Not permitted")),
        Err(err) => Err(ApiError::from_db(
            &format!("Error checking role in group {group_id}"),
            err,
        )),
    }
}
