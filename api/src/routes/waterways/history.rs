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
        history::{HistoryQuery, HistoryStep, SourcesQuery, WaterwaySources},
        path_params::{FeaturePath, SectionPath, WaterwayPath},
        waterway::{PaginatedResponse, page_bounds, total_pages},
    },
    query::{
        history::{self, Scope},
        sections, waterways,
    },
    state::AppState,
};

/// Steps per page unless the caller asks for another size.
const DEFAULT_PER_PAGE: i64 = 50;

/// The one 404 gate of the history routes: the entity must be known inside
/// its parents, which includes one deleted since (its steps stay).
async fn require_known(app: &AppState, scope: &Scope) -> Result<(), ApiError> {
    match history::is_known(&app.pg_pool, scope).await {
        Ok(true) => Ok(()),
        Ok(false) => Err(ApiError::not_found("Not found")),
        Err(err) => Err(ApiError::from_db("Error checking history", &err)),
    }
}

fn require_live(found: Result<bool, sqlx::Error>) -> Result<(), ApiError> {
    match found {
        Ok(true) => Ok(()),
        Ok(false) => Err(ApiError::not_found("Not found")),
        Err(err) => Err(ApiError::from_db("Error checking existence", &err)),
    }
}

async fn page_of(
    app: &AppState,
    scope: Scope,
    query: &HistoryQuery,
) -> Result<Json<PaginatedResponse<HistoryStep>>, ApiError> {
    require_known(app, &scope).await?;
    let (page, per_page) = page_bounds(query.page, query.per_page, DEFAULT_PER_PAGE);
    let (items, total) = history::list_steps(&app.pg_pool, &scope, page, per_page)
        .await
        .map_err(|err| ApiError::from_db("Error listing history", &err))?;
    Ok(Json(PaginatedResponse {
        items,
        total,
        page,
        per_page,
        total_pages: total_pages(total, per_page),
    }))
}

pub async fn get_waterway_history(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
    Query(query): Query<HistoryQuery>,
) -> impl IntoApiResponse {
    page_of(&app, Scope::waterway(waterway_id), &query)
        .await
        .into_response()
}

doc_fn!(get_waterway_history_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .input::<Query<HistoryQuery>>()
        .description("History of a river, oldest step first; readable after the river was deleted")
        .response::<200, Json<PaginatedResponse<HistoryStep>>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Waterway never existed"))
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
    page_of(&app, Scope::section(waterway_id, section_id), &query)
        .await
        .into_response()
}

doc_fn!(get_section_history_docs, op =>
    op.input::<Path<SectionPath>>()
        .input::<Query<HistoryQuery>>()
        .description("History of a section, oldest step first; readable after the section was deleted")
        .response::<200, Json<PaginatedResponse<HistoryStep>>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Section never existed in this waterway"))
        .tag("History")
);

pub async fn get_feature_history(
    State(app): State<AppState>,
    Path(FeaturePath {
        waterway_id,
        section_id,
        feature_id,
    }): Path<FeaturePath>,
    Query(query): Query<HistoryQuery>,
) -> impl IntoApiResponse {
    page_of(
        &app,
        Scope::feature(waterway_id, section_id, feature_id),
        &query,
    )
    .await
    .into_response()
}

doc_fn!(get_feature_history_docs, op =>
    op.input::<Path<FeaturePath>>()
        .input::<Query<HistoryQuery>>()
        .description("History of a feature, oldest step first; readable after the feature, or its section or river, was deleted")
        .response::<200, Json<PaginatedResponse<HistoryStep>>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Feature never existed in this section"))
        .tag("History")
);

pub async fn get_waterway_sources(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
    Query(query): Query<SourcesQuery>,
) -> impl IntoApiResponse {
    if let Err(err) = require_live(waterways::exists(&app.pg_pool, waterway_id).await) {
        return err.into_response();
    }
    if let Some(section_id) = query.section_id {
        let found = sections::section_exists(&app.pg_pool, waterway_id, section_id).await;
        if let Err(err) = require_live(found) {
            return err.into_response();
        }
    }
    match history::list_waterway_sources(&app.pg_pool, waterway_id, query.section_id).await {
        Ok(sources) => Json::<WaterwaySources>(sources).into_response(),
        Err(err) => ApiError::from_db("Error listing sources", &err).into_response(),
    }
}

doc_fn!(get_waterway_sources_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .input::<Query<SourcesQuery>>()
        .description("Every source and contributor behind a river, its sections and its features; with `section_id`, only those behind that section and its features")
        .response::<200, Json<WaterwaySources>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Waterway not found, or the section is not in it"))
        .tag("History")
);
