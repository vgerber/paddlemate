//! Takedown of mirrored photos. Admin only: a removal is not something the
//! next reader can undo.

use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    media,
    models::{material::MAX_QUERY_CHARS, path_params::MaterialImagePath},
    query::materials::images,
    state::AppState,
};

pub async fn remove_image(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(MaterialImagePath {
        material_id,
        image_id,
    }): Path<MaterialImagePath>,
) -> impl IntoApiResponse {
    let Some(Extension(token)) = auth else {
        return ApiError::unauthorized("Authentication required").into_response();
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }
    match images::remove_one(&app.pg_pool, material_id, image_id).await {
        Ok(Some(file)) => {
            if let Some(file) = file {
                media::delete_image(&file).await;
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => ApiError::from_db("Error removing material image", err).into_response(),
    }
}

doc_fn!(remove_image_docs, op =>
    op.input::<Path<MaterialImagePath>>()
        .description("Take down one photo of an entry (admin only). The file is deleted and the photo is never fetched again.")
        .response_with::<204, (), _>(|res| res.description("Removed"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Photo not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Materials")
);

#[derive(Debug, Deserialize, JsonSchema)]
pub struct BrandTakedown {
    /// The brand whose photos go, case-insensitive. Required.
    pub brand: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Removed {
    pub removed: i64,
}

pub async fn remove_brand_images(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Query(query): Query<BrandTakedown>,
) -> impl IntoApiResponse {
    let Some(Extension(token)) = auth else {
        return ApiError::unauthorized("Authentication required").into_response();
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }
    let brand = query.brand.as_deref().map(str::trim).unwrap_or_default();
    if brand.is_empty() || brand.chars().count() > MAX_QUERY_CHARS {
        return ApiError::validation("brand is required")
            .with_target("brand")
            .into_response();
    }
    match images::remove_brand(&app.pg_pool, brand).await {
        Ok((removed, files)) => {
            for file in files {
                media::delete_image(&file).await;
            }
            Json(Removed { removed }).into_response()
        }
        Err(err) => ApiError::from_db("Error removing brand images", err).into_response(),
    }
}

doc_fn!(remove_brand_images_docs, op =>
    op.description("Take down every photo of a brand (admin only)")
        .response::<200, Json<Removed>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Brand missing"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Materials")
);
