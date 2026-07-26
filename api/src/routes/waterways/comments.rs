use aide::axum::IntoApiResponse;
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
    models::{
        comment::{Comment, CommentId, CreateCommentRequest, UpdateCommentRequest},
        path_params::{FeatureCommentPath, FeaturePath, SectionCommentPath, SectionPath},
    },
    query::comments,
    state::AppState,
};

pub async fn list_section_comments(
    State(app): State<AppState>,
    Path((_waterway_id, section_id)): Path<(i64, i64)>,
) -> impl IntoApiResponse {
    match comments::list_comments(&app.pg_pool, "water_section", section_id).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing comments for section {}: {}", section_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_section_comments_docs, op =>
    op.input::<Path<SectionPath>>()
        .description("List comments on a section")
        .response::<200, Json<Vec<Comment>>>()
        .tag("Comments")
);

pub async fn create_section_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((_waterway_id, section_id)): Path<(i64, i64)>,
    Json(body): Json<CreateCommentRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match comments::insert_comment(
        &app.pg_pool,
        "water_section",
        section_id,
        &body.body,
        token.user_id(),
    )
    .await
    {
        Ok(comment) => (StatusCode::CREATED, Json(comment)).into_response(),
        Err(err) => {
            tracing::error!("Error creating comment on section {}: {}", section_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(create_section_comment_docs, op =>
    op.input::<Path<SectionPath>>()
        .description("Add a comment to a section")
        .response_with::<201, Json<Comment>, _>(|res| res.description("Comment created"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

pub async fn update_section_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((_waterway_id, _section_id, comment_id)): Path<(i64, i64, CommentId)>,
    Json(body): Json<UpdateCommentRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match comments::update_comment(&app.pg_pool, comment_id, &body.body, token.user_id()).await {
        Ok(Some(comment)) => Json(comment).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error updating comment {}: {}", comment_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_section_comment_docs, op =>
    op.input::<Path<SectionCommentPath>>()
        .description("Update a section comment (author only)")
        .response::<200, Json<Comment>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Comment not found or not your comment"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

pub async fn delete_section_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((_waterway_id, _section_id, comment_id)): Path<(i64, i64, CommentId)>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match comments::delete_comment(
        &app.pg_pool,
        comment_id,
        token.user_id(),
        token.is_server_admin(),
    )
    .await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting comment {}: {}", comment_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_section_comment_docs, op =>
    op.input::<Path<SectionCommentPath>>()
        .description("Delete a section comment (author or admin)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Comment not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

pub async fn list_feature_comments(
    State(app): State<AppState>,
    Path((_waterway_id, _section_id, feature_id)): Path<(i64, i64, i64)>,
) -> impl IntoApiResponse {
    match comments::list_comments(&app.pg_pool, "feature", feature_id).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing comments for feature {}: {}", feature_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_feature_comments_docs, op =>
    op.input::<Path<FeaturePath>>()
        .description("List comments on a feature")
        .response::<200, Json<Vec<Comment>>>()
        .tag("Comments")
);

pub async fn create_feature_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((_waterway_id, _section_id, feature_id)): Path<(i64, i64, i64)>,
    Json(body): Json<CreateCommentRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match comments::insert_comment(
        &app.pg_pool,
        "feature",
        feature_id,
        &body.body,
        token.user_id(),
    )
    .await
    {
        Ok(comment) => (StatusCode::CREATED, Json(comment)).into_response(),
        Err(err) => {
            tracing::error!("Error creating comment on feature {}: {}", feature_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(create_feature_comment_docs, op =>
    op.input::<Path<FeaturePath>>()
        .description("Add a comment to a feature")
        .response_with::<201, Json<Comment>, _>(|res| res.description("Comment created"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

pub async fn update_feature_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((_waterway_id, _section_id, _feature_id, comment_id)): Path<(i64, i64, i64, CommentId)>,
    Json(body): Json<UpdateCommentRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match comments::update_comment(&app.pg_pool, comment_id, &body.body, token.user_id()).await {
        Ok(Some(comment)) => Json(comment).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error updating comment {}: {}", comment_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_feature_comment_docs, op =>
    op.input::<Path<FeatureCommentPath>>()
        .description("Update a feature comment (author only)")
        .response::<200, Json<Comment>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Comment not found or not your comment"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

pub async fn delete_feature_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((_waterway_id, _section_id, _feature_id, comment_id)): Path<(i64, i64, i64, CommentId)>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match comments::delete_comment(
        &app.pg_pool,
        comment_id,
        token.user_id(),
        token.is_server_admin(),
    )
    .await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting comment {}: {}", comment_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_feature_comment_docs, op =>
    op.input::<Path<FeatureCommentPath>>()
        .description("Delete a feature comment (author or admin)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Comment not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

// Aide requires serializable types to generate request body schemas.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct CreateCommentRequestDoc {
    body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct UpdateCommentRequestDoc {
    body: String,
}
