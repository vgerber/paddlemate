mod members;

#[allow(unused_imports)]
use aide::axum::{
    ApiRouter,
    IntoApiResponse,
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
    layers::auth::AuthToken,
    models::group::{Group, GroupMemberRole, GroupWithMembers},
    query::groups,
    state::AppState,
};

pub fn group_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/", get_with(list_groups, list_groups_docs).post_with(create_group, create_group_docs))
        .api_route(
            "/{group_id}",
            get_with(get_group, get_group_docs)
                .put_with(update_group, update_group_docs)
                .delete_with(delete_group, delete_group_docs),
        )
        .nest_api_service("/{group_id}/members", members::member_routes(state.clone()))
        .with_state(state)
}

pub async fn list_groups(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    match groups::list_groups_for_user(&app.pg_pool, token.user_id()).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing groups: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_groups_docs, op =>
    op.description("List groups the authenticated user belongs to")
        .response::<200, Json<Vec<Group>>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Groups")
);

#[derive(Deserialize, JsonSchema)]
pub struct CreateGroupBody {
    pub name: String,
    pub description: Option<String>,
}

pub async fn create_group(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(body): Json<CreateGroupBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    let user_id = token.user_id().to_string();

    let group = match groups::insert_group(
        &app.pg_pool,
        &body.name,
        body.description.as_deref(),
        &user_id,
    )
    .await
    {
        Ok(g) => g,
        Err(err) => {
            tracing::error!("Error creating group: {}", err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // Add creator as owner
    if let Err(err) = groups::add_member(
        &app.pg_pool,
        group.id,
        &user_id,
        GroupMemberRole::Owner,
        &user_id,
    )
    .await
    {
        tracing::error!("Error adding owner to group {}: {}", group.id, err);
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    (StatusCode::CREATED, Json(group)).into_response()
}

doc_fn!(create_group_docs, op =>
    op.description("Create a new group; the caller becomes owner")
        .response_with::<201, Json<Group>, _>(|res| res.description("Group created"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Groups")
);

pub async fn get_group(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(group_id): Path<i64>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    match groups::get_group_for_member(&app.pg_pool, group_id, token.user_id()).await {
        Ok(Some(group)) => Json(group).into_response(),
        // Return 404 for non-members to avoid leaking group existence
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error fetching group {}: {}", group_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(get_group_docs, op =>
    op.description("Get a group with its members (members only)")
        .response::<200, Json<GroupWithMembers>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Groups")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpdateGroupBody {
    pub name: Option<String>,
    /// Pass null to clear the description, omit to leave it unchanged
    pub description: Option<Option<String>>,
}

pub async fn update_group(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(group_id): Path<i64>,
    Json(body): Json<UpdateGroupBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    // Map Option<Option<String>> to Option<Option<&str>> for the query layer
    let description = body.description.as_ref().map(|d| d.as_deref());

    match groups::update_group(
        &app.pg_pool,
        group_id,
        token.user_id(),
        body.name.as_deref(),
        description,
    )
    .await
    {
        Ok(Some(group)) => Json(group).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error updating group {}: {}", group_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(update_group_docs, op =>
    op.description("Update a group (owner or group admin only)")
        .response::<200, Json<Group>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Groups")
);

pub async fn delete_group(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(group_id): Path<i64>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    match groups::delete_group(
        &app.pg_pool,
        group_id,
        token.user_id(),
        token.is_server_admin(),
    )
    .await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error deleting group {}: {}", group_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(delete_group_docs, op =>
    op.description("Delete a group (owner or server admin only)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Groups")
);

// Aide doc structs
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct CreateGroupBodyDoc {
    name: String,
    description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct UpdateGroupBodyDoc {
    name: Option<String>,
    description: Option<Option<String>>,
}
