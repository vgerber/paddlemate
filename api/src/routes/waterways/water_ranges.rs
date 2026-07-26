use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        gauge::{CreateWaterRangeRequest, FeatureWaterRange, UpdateWaterRangeRequest},
        path_params::{FeaturePath, FeatureWaterRangePath},
    },
    query::{features, gauges},
    state::AppState,
};

pub async fn list_water_ranges(
    State(app): State<AppState>,
    Path(path): Path<FeaturePath>,
) -> impl IntoApiResponse {
    match gauges::list_feature_water_ranges(&app.pg_pool, path.feature_id).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!(
                "Error listing water ranges for feature {}: {}",
                path.feature_id,
                err
            );
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_water_ranges_docs, op =>
    op.input::<Path<FeaturePath>>()
        .description("List water-level threshold ranges for a feature")
        .response::<200, Json<Vec<FeatureWaterRange>>>()
        .tag("Water Ranges")
);

pub async fn create_water_range(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<FeaturePath>,
    Json(body): Json<CreateWaterRangeRequest>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    let belongs = features::feature_belongs_to_section(
        &app.pg_pool,
        path.waterway_id,
        path.section_id,
        path.feature_id,
    )
    .await;
    match belongs {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error validating feature ownership: {}", err);
            return ApiError::internal().into_response();
        }
    }

    match gauges::upsert_feature_water_range(
        &app.pg_pool,
        path.feature_id,
        body.series_id,
        body.range_low,
        body.range_medium,
        body.range_high,
    )
    .await
    {
        Ok(range) => (StatusCode::CREATED, Json(range)).into_response(),
        Err(err) => {
            tracing::error!(
                "Error creating water range for feature {}: {}",
                path.feature_id,
                err
            );
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(create_water_range_docs, op =>
    op.input::<Path<FeaturePath>>()
        .description("Create or update a water-level threshold range for a feature")
        .response_with::<201, Json<FeatureWaterRange>, _>(|res| res.description("Range created or updated"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Feature not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Water Ranges")
);

pub async fn update_water_range(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<FeatureWaterRangePath>,
    Json(body): Json<UpdateWaterRangeRequest>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match gauges::update_feature_water_range(
        &app.pg_pool,
        path.range_id,
        path.feature_id,
        body.range_low,
        body.range_medium,
        body.range_high,
    )
    .await
    {
        Ok(Some(range)) => Json(range).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error updating water range {}: {}", path.range_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_water_range_docs, op =>
    op.input::<Path<FeatureWaterRangePath>>()
        .description("Update a water-level threshold range")
        .response::<200, Json<FeatureWaterRange>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Range not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Water Ranges")
);

pub async fn delete_water_range(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<FeatureWaterRangePath>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match gauges::delete_feature_water_range(&app.pg_pool, path.range_id, path.feature_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting water range {}: {}", path.range_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_water_range_docs, op =>
    op.input::<Path<FeatureWaterRangePath>>()
        .description("Delete a water-level threshold range")
        .response_with::<204, (), _>(|res| res.description("Range deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Range not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Water Ranges")
);
