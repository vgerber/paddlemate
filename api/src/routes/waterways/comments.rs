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
        comment::{
            Comment, CommentCategory, CommentId, CreateCommentRequest, ModerateCommentRequest,
            UpdateCommentRequest,
        },
        media_item::MediaEntityType,
        path_params::{
            FeatureCommentPath, FeaturePath, SectionCommentPath, SectionPath, WaterwayCommentPath,
            WaterwayPath,
        },
    },
    query::{comments, media},
    state::AppState,
};

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct CommentQuery {
    /// Include the notes on this river's sections, for an overview of
    /// everything reported on the water.
    pub include_sections: Option<bool>,
}

/// The note's point as GeoJSON for storage, or an error when the body
/// carries something that is not a Point.
fn location_geojson(
    location: &Option<crate::models::geometry::Geometry>,
) -> Result<Option<String>, ApiError> {
    match location {
        None => Ok(None),
        Some(geometry @ crate::models::geometry::Geometry::Point { .. }) => {
            Ok(Some(serde_json::to_string(geometry).map_err(|_| {
                ApiError::validation("Unreadable location").with_target("location")
            })?))
        }
        Some(_) => Err(ApiError::validation("location must be a Point").with_target("location")),
    }
}

pub async fn list_waterway_comments(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
    axum::extract::Query(query): axum::extract::Query<CommentQuery>,
) -> impl IntoApiResponse {
    let listed = if query.include_sections.unwrap_or(false) {
        comments::list_river_comments(&app.pg_pool, waterway_id).await
    } else {
        comments::list_comments(&app.pg_pool, "waterway", waterway_id).await
    };
    match listed {
        Ok(mut list) => {
            comments::resolve_author_names(&app, &mut list).await;
            Json(list).into_response()
        }
        Err(err) => {
            tracing::error!("Error listing comments for river {}: {}", waterway_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_waterway_comments_docs, op =>
    op.description("Notes on a river. include_sections=true adds the notes on its sections, for one overview of everything reported on the water.")
        .response::<200, Json<Vec<Comment>>>()
        .tag("Comments")
);

pub async fn create_waterway_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
    Json(body): Json<CreateCommentRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    let location = match location_geojson(&body.location) {
        Ok(location) => location,
        Err(err) => return err.into_response(),
    };

    match comments::insert_comment(
        &app.pg_pool,
        "waterway",
        waterway_id,
        &body.body,
        body.category.unwrap_or(CommentCategory::Info),
        token.user_id(),
        location.as_deref(),
    )
    .await
    {
        Ok(mut comment) => {
            comment.author_name = crate::query::users::get_username(&app, token.user_id())
                .await
                .ok();
            if let Err(err) = media::attach_media_to_comment(
                &app.pg_pool,
                comment.id,
                MediaEntityType::Waterway,
                waterway_id,
                &body.media_ids,
                token.user_id(),
            )
            .await
            {
                tracing::error!("Error attaching media to comment {}: {}", comment.id, err);
            }
            comment.media = media::list_media_for_comments(&app.pg_pool, &[comment.id])
                .await
                .unwrap_or_default();
            (StatusCode::CREATED, Json(comment)).into_response()
        }
        Err(err) => {
            tracing::error!("Error creating comment on river {}: {}", waterway_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(create_waterway_comment_docs, op =>
    op.description("Add a comment to a river")
        .response_with::<201, Json<Comment>, _>(|res| res.description("Comment created"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

pub async fn update_waterway_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(WaterwayCommentPath { comment_id, .. }): Path<WaterwayCommentPath>,
    Json(body): Json<UpdateCommentRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match comments::update_comment(
        &app.pg_pool,
        comment_id,
        &body.body,
        body.category,
        token.user_id(),
    )
    .await
    {
        Ok(Some(comment)) => Json(comment).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error updating comment {}: {}", comment_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_waterway_comment_docs, op =>
    op.description("Update a river comment (author only)")
        .response::<200, Json<Comment>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Comment not found or not your comment"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

pub async fn delete_waterway_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(WaterwayCommentPath { comment_id, .. }): Path<WaterwayCommentPath>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    // Read the keys before the rows cascade away with the note.
    let keys = media::storage_keys_for_comment(&app.pg_pool, comment_id)
        .await
        .unwrap_or_default();

    match comments::delete_comment(
        &app.pg_pool,
        comment_id,
        token.user_id(),
        token.is_server_admin(),
    )
    .await
    {
        Ok(true) => {
            for key in keys {
                crate::media::delete_image(&key).await;
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting comment {}: {}", comment_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_waterway_comment_docs, op =>
    op.description("Delete a river comment (author or admin)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Comment not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

pub async fn moderate_waterway_comment(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(WaterwayCommentPath { comment_id, .. }): Path<WaterwayCommentPath>,
    Json(body): Json<ModerateCommentRequest>,
) -> impl IntoApiResponse {
    let Some(Extension(token)) = auth else {
        return ApiError::unauthorized("Authentication required").into_response();
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Admin access required").into_response();
    }

    match comments::moderate_comment(&app.pg_pool, comment_id, body.status).await {
        Ok(Some(comment)) => Json(comment).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error moderating comment {}: {}", comment_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(moderate_waterway_comment_docs, op =>
    op.description("Set a river note's status (admin). 'merged' means the note was folded into curated data and can drop out of the thread; 'spam' hides it from everyone.")
        .response::<200, Json<Comment>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Comment not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Comments")
);

pub async fn list_section_comments(
    State(app): State<AppState>,
    Path((_waterway_id, section_id)): Path<(i64, i64)>,
) -> impl IntoApiResponse {
    match comments::list_comments(&app.pg_pool, "water_section", section_id).await {
        Ok(mut list) => {
            comments::resolve_author_names(&app, &mut list).await;
            Json(list).into_response()
        }
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
    let location = match location_geojson(&body.location) {
        Ok(location) => location,
        Err(err) => return err.into_response(),
    };

    match comments::insert_comment(
        &app.pg_pool,
        "water_section",
        section_id,
        &body.body,
        body.category.unwrap_or(CommentCategory::Info),
        token.user_id(),
        location.as_deref(),
    )
    .await
    {
        Ok(mut comment) => {
            comment.author_name = crate::query::users::get_username(&app, token.user_id())
                .await
                .ok();
            if let Err(err) = media::attach_media_to_comment(
                &app.pg_pool,
                comment.id,
                MediaEntityType::WaterSection,
                section_id,
                &body.media_ids,
                token.user_id(),
            )
            .await
            {
                tracing::error!("Error attaching media to comment {}: {}", comment.id, err);
            }
            comment.media = media::list_media_for_comments(&app.pg_pool, &[comment.id])
                .await
                .unwrap_or_default();
            (StatusCode::CREATED, Json(comment)).into_response()
        }
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

    match comments::update_comment(
        &app.pg_pool,
        comment_id,
        &body.body,
        body.category,
        token.user_id(),
    )
    .await
    {
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
        Ok(mut list) => {
            comments::resolve_author_names(&app, &mut list).await;
            Json(list).into_response()
        }
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
    let location = match location_geojson(&body.location) {
        Ok(location) => location,
        Err(err) => return err.into_response(),
    };

    match comments::insert_comment(
        &app.pg_pool,
        "feature",
        feature_id,
        &body.body,
        body.category.unwrap_or(CommentCategory::Info),
        token.user_id(),
        location.as_deref(),
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

    match comments::update_comment(
        &app.pg_pool,
        comment_id,
        &body.body,
        body.category,
        token.user_id(),
    )
    .await
    {
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
