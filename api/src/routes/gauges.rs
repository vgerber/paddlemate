use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        gauge::{
            BackfillRequest, CreateGaugeRequest, CreateSeriesRequest, Gauge, GaugeReading,
            GaugeWithSeries, UpdateGaugeRequest, UpdateSeriesRequest,
        },
        path_params::{GaugePath, GaugeSeriesPath},
    },
    query::gauges,
    readers,
    state::AppState,
};

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct ReadingsQuery {
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    /// Maximum number of readings to return (capped at 1000, default 1000).
    pub limit: Option<i64>,
}

pub async fn list_gauges(State(app): State<AppState>) -> impl IntoApiResponse {
    match gauges::list_gauges(&app.pg_pool, false).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing gauges: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_gauges_docs, op =>
    op.description("List all gauges")
        .response::<200, Json<Vec<Gauge>>>()
        .tag("Gauges")
);

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct GaugeSearchQuery {
    /// Case-insensitive name filter
    pub q: Option<String>,
    /// Together with `lon`: sort results nearest to this point first
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    /// Maximum number of results (default 20, capped at 50)
    pub limit: Option<i64>,
}

pub async fn search_gauges(
    State(app): State<AppState>,
    Query(query): Query<GaugeSearchQuery>,
) -> impl IntoApiResponse {
    let limit = query.limit.unwrap_or(20).clamp(1, 50);
    let q = query.q.as_deref().map(str::trim).filter(|s| !s.is_empty());
    match gauges::search_gauges(&app.pg_pool, q, query.lat, query.lon, limit).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error searching gauges: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(search_gauges_docs, op =>
    op.description("Search active gauges by name and/or proximity, with their series")
        .response::<200, Json<Vec<GaugeWithSeries>>>()
        .tag("Gauges")
);

pub async fn get_gauge(
    State(app): State<AppState>,
    Path(GaugePath { gauge_id }): Path<GaugePath>,
) -> impl IntoApiResponse {
    match gauges::fetch_gauge_with_series(&app.pg_pool, gauge_id).await {
        Ok(Some(g)) => Json(g).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error fetching gauge {}: {}", gauge_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_gauge_docs, op =>
    op.input::<Path<GaugePath>>()
        .description("Get a gauge with all its series")
        .response::<200, Json<GaugeWithSeries>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Gauge not found"))
        .tag("Gauges")
);

pub async fn list_readings(
    State(app): State<AppState>,
    Path(GaugeSeriesPath { series_id, .. }): Path<GaugeSeriesPath>,
    Query(q): Query<ReadingsQuery>,
) -> impl IntoApiResponse {
    let limit = q.limit.unwrap_or(1000).clamp(1, 1000);
    match gauges::fetch_readings(&app.pg_pool, series_id, q.from, q.to, limit).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error fetching readings for series {}: {}", series_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_readings_docs, op =>
    op.input::<Path<GaugeSeriesPath>>()
        .input::<Query<ReadingsQuery>>()
        .description("List readings for a gauge series (newest first, max 1000)")
        .response::<200, Json<Vec<GaugeReading>>>()
        .tag("Gauges")
);

pub async fn get_latest_reading(
    State(app): State<AppState>,
    Path(GaugeSeriesPath { series_id, .. }): Path<GaugeSeriesPath>,
) -> impl IntoApiResponse {
    match gauges::fetch_latest_reading(&app.pg_pool, series_id).await {
        Ok(Some(r)) => Json(r).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!(
                "Error fetching latest reading for series {}: {}",
                series_id,
                err
            );
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_latest_reading_docs, op =>
    op.input::<Path<GaugeSeriesPath>>()
        .description("Get the most recent reading for a gauge series")
        .response::<200, Json<GaugeReading>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("No readings found"))
        .tag("Gauges")
);

pub async fn create_gauge(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(body): Json<CreateGaugeRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }

    let active = body.active.unwrap_or(true);
    let interval = body.fetch_interval_secs.unwrap_or(600);

    match gauges::create_gauge(
        &app.pg_pool,
        &body.name,
        &body.provider,
        &body.source_id,
        body.data_source_id.as_deref(),
        body.lat,
        body.lon,
        active,
        interval,
    )
    .await
    {
        Ok(g) => (StatusCode::CREATED, Json(g)).into_response(),
        Err(err) => {
            tracing::error!("Error creating gauge: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(create_gauge_docs, op =>
    op.description("Create a new gauge (admin only)")
        .response_with::<201, Json<Gauge>, _>(|res| res.description("Gauge created"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Gauges")
);

pub async fn update_gauge(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(GaugePath { gauge_id }): Path<GaugePath>,
    Json(body): Json<UpdateGaugeRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }

    match gauges::update_gauge(
        &app.pg_pool,
        gauge_id,
        &body.name,
        &body.provider,
        &body.source_id,
        body.data_source_id.as_deref(),
        body.lat,
        body.lon,
        body.active,
        body.fetch_interval_secs,
    )
    .await
    {
        Ok(Some(g)) => Json(g).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error updating gauge {}: {}", gauge_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_gauge_docs, op =>
    op.input::<Path<GaugePath>>()
        .description("Update a gauge (admin only)")
        .response::<200, Json<Gauge>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Gauge not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Gauges")
);

pub async fn delete_gauge(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(GaugePath { gauge_id }): Path<GaugePath>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }

    match gauges::delete_gauge(&app.pg_pool, gauge_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting gauge {}: {}", gauge_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_gauge_docs, op =>
    op.input::<Path<GaugePath>>()
        .description("Delete a gauge (admin only)")
        .response_with::<204, (), _>(|res| res.description("Gauge deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Gauge not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Gauges")
);

pub async fn create_series(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(GaugePath { gauge_id }): Path<GaugePath>,
    Json(body): Json<CreateSeriesRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }

    let mt = serde_json::to_string(&body.measurement_type)
        .unwrap_or_default()
        .trim_matches('"')
        .to_string();

    match gauges::create_series(
        &app.pg_pool,
        gauge_id,
        &mt,
        &body.unit,
        body.label.as_deref(),
    )
    .await
    {
        Ok(s) => (StatusCode::CREATED, Json(s)).into_response(),
        Err(err) => {
            tracing::error!("Error creating series for gauge {}: {}", gauge_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(create_series_docs, op =>
    op.input::<Path<GaugePath>>()
        .description("Add a measurement series to a gauge (admin only)")
        .response_with::<201, Json<crate::models::gauge::GaugeSeries>, _>(|res| res.description("Series created"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Gauges")
);

pub async fn update_series(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(GaugeSeriesPath { series_id, .. }): Path<GaugeSeriesPath>,
    Json(body): Json<UpdateSeriesRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }

    let mt = serde_json::to_string(&body.measurement_type)
        .unwrap_or_default()
        .trim_matches('"')
        .to_string();

    match gauges::update_series(
        &app.pg_pool,
        series_id,
        &mt,
        &body.unit,
        body.label.as_deref(),
    )
    .await
    {
        Ok(Some(s)) => Json(s).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error updating series {}: {}", series_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_series_docs, op =>
    op.input::<Path<GaugeSeriesPath>>()
        .description("Update a gauge series (admin only)")
        .response::<200, Json<crate::models::gauge::GaugeSeries>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Series not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Gauges")
);

pub async fn delete_series(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(GaugeSeriesPath { series_id, .. }): Path<GaugeSeriesPath>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }

    match gauges::delete_series(&app.pg_pool, series_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting series {}: {}", series_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_series_docs, op =>
    op.input::<Path<GaugeSeriesPath>>()
        .description("Delete a gauge series (admin only)")
        .response_with::<204, (), _>(|res| res.description("Series deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Series not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Gauges")
);

pub async fn backfill(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(GaugePath { gauge_id }): Path<GaugePath>,
    Json(body): Json<BackfillRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }

    let pool = app.pg_pool.clone();
    tokio::spawn(async move {
        if let Err(err) = readers::backfill(pool, gauge_id, body.from, body.to).await {
            tracing::error!("Backfill error for gauge {}: {}", gauge_id, err);
        }
    });

    StatusCode::ACCEPTED.into_response()
}

doc_fn!(backfill_docs, op =>
    op.input::<Path<GaugePath>>()
        .description("Trigger a historical backfill for a gauge (admin only). Returns immediately.")
        .response_with::<202, (), _>(|res| res.description("Backfill started"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Gauges")
);

pub fn gauges_routes(state: AppState) -> aide::axum::ApiRouter {
    use aide::axum::routing::{get_with, post_with, put_with};

    aide::axum::ApiRouter::new()
        .api_route(
            "/",
            get_with(list_gauges, list_gauges_docs).post_with(create_gauge, create_gauge_docs),
        )
        .api_route("/search", get_with(search_gauges, search_gauges_docs))
        .api_route(
            "/{gauge_id}",
            get_with(get_gauge, get_gauge_docs)
                .put_with(update_gauge, update_gauge_docs)
                .delete_with(delete_gauge, delete_gauge_docs),
        )
        .api_route(
            "/{gauge_id}/series",
            post_with(create_series, create_series_docs),
        )
        .api_route(
            "/{gauge_id}/series/{series_id}",
            put_with(update_series, update_series_docs)
                .delete_with(delete_series, delete_series_docs),
        )
        .api_route(
            "/{gauge_id}/series/{series_id}/readings",
            get_with(list_readings, list_readings_docs),
        )
        .api_route(
            "/{gauge_id}/series/{series_id}/readings/latest",
            get_with(get_latest_reading, get_latest_reading_docs),
        )
        .api_route("/{gauge_id}/backfill", post_with(backfill, backfill_docs))
        .with_state(state)
}
