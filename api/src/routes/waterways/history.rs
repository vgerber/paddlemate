use aide::axum::IntoApiResponse;
use axum::{
    Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    models::{
        history::{HistoryPage, HistoryQuery, WaterwaySources},
        path_params::{FeaturePath, SectionPath, WaterwayPath},
        waterway::page_bounds,
    },
    query::{
        features,
        history::{self, Scope},
        sections, waterways,
    },
    state::AppState,
};

/// Steps per page unless the caller asks for another size.
const DEFAULT_PER_PAGE: i64 = 50;

async fn page_of(
    app: &AppState,
    scope: Scope,
    query: &HistoryQuery,
) -> Result<HistoryPage, ApiError> {
    let (page, per_page) = page_bounds(query.page, query.per_page, DEFAULT_PER_PAGE);
    let (items, total) = history::list_steps(&app.pg_pool, &scope, page, per_page)
        .await
        .map_err(|err| ApiError::from_db("Error listing history", &err))?;
    Ok(HistoryPage {
        items,
        total,
        page,
        per_page,
        total_pages: (total + per_page - 1) / per_page,
    })
}

pub async fn get_waterway_history(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
    Query(query): Query<HistoryQuery>,
) -> impl IntoApiResponse {
    match waterways::exists(&app.pg_pool, waterway_id).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => return ApiError::from_db("Error checking waterway", &err).into_response(),
    }
    match page_of(&app, Scope::waterway(waterway_id), &query).await {
        Ok(page) => Json(page).into_response(),
        Err(err) => err.into_response(),
    }
}

doc_fn!(get_waterway_history_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .input::<Query<HistoryQuery>>()
        .description("History of a river, oldest step first")
        .response::<200, Json<HistoryPage>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Waterway not found"))
        .tag("History")
);

pub async fn get_section_history(
    State(app): State<AppState>,
    Path(SectionPath {
        waterway_id,
        section_id,
    }): Path<SectionPath>,
    Query(query): Query<HistoryQuery>,
) -> impl IntoApiResponse {
    match sections::section_exists(&app.pg_pool, waterway_id, section_id).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => return ApiError::from_db("Error checking section", &err).into_response(),
    }
    match page_of(&app, Scope::section(waterway_id, section_id), &query).await {
        Ok(page) => Json(page).into_response(),
        Err(err) => err.into_response(),
    }
}

doc_fn!(get_section_history_docs, op =>
    op.input::<Path<SectionPath>>()
        .input::<Query<HistoryQuery>>()
        .description("History of a section, oldest step first")
        .response::<200, Json<HistoryPage>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Section not found in this waterway"))
        .tag("History")
);

/// A deleted feature's history stays readable through its old path while the
/// section it was in exists; the feature itself answers 404 elsewhere.
pub async fn get_feature_history(
    State(app): State<AppState>,
    Path(FeaturePath {
        waterway_id,
        section_id,
        feature_id,
    }): Path<FeaturePath>,
    Query(query): Query<HistoryQuery>,
) -> impl IntoApiResponse {
    match sections::section_exists(&app.pg_pool, waterway_id, section_id).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => return ApiError::from_db("Error checking section", &err).into_response(),
    }
    let scope = Scope::feature(waterway_id, section_id, feature_id);
    let page = match page_of(&app, scope, &query).await {
        Ok(page) => page,
        Err(err) => return err.into_response(),
    };
    // No step under this path: the id belongs to another section, or never
    // existed. A live feature without steps (made by a bulk import) is empty.
    if page.total == 0 {
        match features::feature_exists(&app.pg_pool, waterway_id, section_id, feature_id).await {
            Ok(true) => {}
            Ok(false) => return ApiError::not_found("Not found").into_response(),
            Err(err) => return ApiError::from_db("Error checking feature", &err).into_response(),
        }
    }
    Json(page).into_response()
}

doc_fn!(get_feature_history_docs, op =>
    op.input::<Path<FeaturePath>>()
        .input::<Query<HistoryQuery>>()
        .description("History of a feature, oldest step first; readable after the feature was deleted")
        .response::<200, Json<HistoryPage>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Feature never existed in this section"))
        .tag("History")
);

pub async fn get_waterway_sources(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
) -> impl IntoApiResponse {
    match waterways::exists(&app.pg_pool, waterway_id).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => return ApiError::from_db("Error checking waterway", &err).into_response(),
    }
    match history::list_waterway_sources(&app.pg_pool, waterway_id).await {
        Ok(sources) => Json::<WaterwaySources>(sources).into_response(),
        Err(err) => ApiError::from_db("Error listing sources", &err).into_response(),
    }
}

doc_fn!(get_waterway_sources_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description("Every source and contributor behind a river, its sections and its features")
        .response::<200, Json<WaterwaySources>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Waterway not found"))
        .tag("History")
);
