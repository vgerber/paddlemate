#[allow(unused_imports)]
use aide::axum::{
    ApiRouter, IntoApiResponse,
    routing::{get_with, post_with, put_with},
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
    models::group::{GroupMember, GroupMemberRole},
    query::groups,
    query::users,
    state::AppState,
};

pub fn member_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_members, list_members_docs).post_with(add_member, add_member_docs),
        )
        .api_route(
            "/{user_id}",
            put_with(set_member_role, set_member_role_docs)
                .delete_with(remove_member, remove_member_docs),
        )
        .with_state(state)
}

pub async fn list_members(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(group_id): Path<i64>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match groups::is_member(&app.pg_pool, group_id, &token.user_id().to_string()).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error checking membership in group {}: {}", group_id, err);
            return ApiError::internal().into_response();
        }
    }

    match groups::fetch_members(&app.pg_pool, group_id).await {
        Ok(members) => Json(members).into_response(),
        Err(err) => {
            tracing::error!("Error fetching members for group {}: {}", group_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_members_docs, op =>
    op.description("List members of a group (members only)")
        .response::<200, Json<Vec<GroupMember>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Groups")
);

#[derive(Deserialize, JsonSchema)]
pub struct AddMemberBody {
    pub user_id: String,
    #[serde(default = "default_role")]
    pub role: GroupMemberRole,
}

fn default_role() -> GroupMemberRole {
    GroupMemberRole::Member
}

pub async fn add_member(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(group_id): Path<i64>,
    Json(body): Json<AddMemberBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    // Only owners and admins may add members
    match groups::get_member_role(&app.pg_pool, group_id, token.user_id()).await {
        Ok(Some(GroupMemberRole::Owner | GroupMemberRole::Admin)) => {}
        Ok(_) => return ApiError::forbidden("Not permitted").into_response(),
        Err(err) => {
            tracing::error!("Error checking role in group {}: {}", group_id, err);
            return ApiError::internal().into_response();
        }
    }

    // Owners cannot be added via this endpoint; there is always exactly one owner
    if body.role == GroupMemberRole::Owner {
        return ApiError::validation("Cannot assign owner role via this endpoint").into_response();
    }

    // Verify target user exists in Keycloak before adding
    match users::user_exists_in_keycloak(&app, &body.user_id).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("User not found").into_response(),
        Err(_) => return ApiError::internal().into_response(),
    }

    // Ensure the user has a local row (upsert if needed)
    if let Ok(username) = users::get_username(&app, &body.user_id).await {
        let _ = users::upsert_user(&app.pg_pool, &body.user_id, &username).await;
    }

    match groups::add_member(
        &app.pg_pool,
        group_id,
        &body.user_id,
        body.role,
        token.user_id(),
    )
    .await
    {
        Ok(member) => (StatusCode::CREATED, Json(member)).into_response(),
        Err(err) => {
            tracing::error!("Error adding member to group {}: {}", group_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(add_member_docs, op =>
    op.description("Add a user to a group (owner or group admin only)")
        .response_with::<201, Json<GroupMember>, _>(|res| res.description("Member added"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Group or user not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Groups")
);

#[derive(Deserialize, JsonSchema)]
pub struct SetRoleBody {
    pub role: GroupMemberRole,
}

pub async fn set_member_role(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((group_id, target_user_id)): Path<(i64, String)>,
    Json(body): Json<SetRoleBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    // Only group owners may change roles
    match groups::get_member_role(&app.pg_pool, group_id, token.user_id()).await {
        Ok(Some(GroupMemberRole::Owner)) => {}
        Ok(_) => return ApiError::forbidden("Not permitted").into_response(),
        Err(err) => {
            tracing::error!("Error checking role in group {}: {}", group_id, err);
            return ApiError::internal().into_response();
        }
    }

    // Cannot promote another user to owner
    if body.role == GroupMemberRole::Owner {
        return ApiError::validation("Cannot assign owner role via this endpoint").into_response();
    }

    match groups::set_member_role(&app.pg_pool, group_id, &target_user_id, body.role).await {
        Ok(Some(member)) => Json(member).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error setting role in group {}: {}", group_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(set_member_role_docs, op =>
    op.description("Change a member's role (owner only; cannot assign owner role)")
        .response::<200, Json<GroupMember>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Member not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Groups")
);

pub async fn remove_member(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((group_id, target_user_id)): Path<(i64, String)>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    let caller_id = token.user_id();
    let is_self_leave = caller_id == target_user_id;

    if !is_self_leave {
        // Only owners and admins may remove others
        match groups::get_member_role(&app.pg_pool, group_id, caller_id).await {
            Ok(Some(GroupMemberRole::Owner | GroupMemberRole::Admin)) => {}
            Ok(_) => return ApiError::forbidden("Not permitted").into_response(),
            Err(err) => {
                tracing::error!("Error checking role in group {}: {}", group_id, err);
                return ApiError::internal().into_response();
            }
        }
    }

    // Owners cannot leave or be removed; they must delete the group
    match groups::get_member_role(&app.pg_pool, group_id, &target_user_id).await {
        Ok(Some(GroupMemberRole::Owner)) => {
            return ApiError::validation("Owner cannot be removed; delete the group instead")
                .into_response();
        }
        Ok(None) => return ApiError::not_found("Not found").into_response(),
        Ok(_) => {}
        Err(err) => {
            tracing::error!("Error checking target role in group {}: {}", group_id, err);
            return ApiError::internal().into_response();
        }
    }

    match groups::remove_member(&app.pg_pool, group_id, &target_user_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error removing member from group {}: {}", group_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(remove_member_docs, op =>
    op.description("Remove a member or leave a group (owner/admin for others; any member for self)")
        .response_with::<204, (), _>(|res| res.description("Removed"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Groups")
);

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct AddMemberBodyDoc {
    user_id: String,
    role: GroupMemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct SetRoleBodyDoc {
    role: GroupMemberRole,
}
