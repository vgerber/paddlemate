use aide::axum::IntoApiResponse;
use axum::{
    Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};
use chrono::{DateTime, Duration, Utc};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    models::{gauge::ReadingsSummary, path_params::GaugeSeriesPath},
    query::gauges,
    state::AppState,
};

const DEFAULT_POINTS: i64 = 300;
const MIN_POINTS: i64 = 10;
const MAX_POINTS: i64 = 1000;
const DEFAULT_SPAN_DAYS: i64 = 7;
const MAX_SPAN_DAYS: i64 = 5 * 365;

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct SummaryQuery {
    /// Range start, ISO 8601 UTC (default: `to` minus 7 days).
    pub from: Option<DateTime<Utc>>,
    /// Range end, ISO 8601 UTC (default: now).
    pub to: Option<DateTime<Utc>>,
    /// Target number of points (default 300, clamped to 10..1000).
    pub points: Option<i64>,
}

/// Resolve the range: defaults filled in, order and 5 year cap checked.
fn resolve_range(
    q: &SummaryQuery,
    now: DateTime<Utc>,
) -> Result<(DateTime<Utc>, DateTime<Utc>), ApiError> {
    let to = q.to.unwrap_or(now);
    let from = q.from.unwrap_or(to - Duration::days(DEFAULT_SPAN_DAYS));
    if from >= to {
        return Err(ApiError::validation("`from` must be before `to`"));
    }
    if to - from > Duration::days(MAX_SPAN_DAYS) {
        return Err(ApiError::validation("The range is at most 5 years"));
    }
    Ok((from, to))
}

pub async fn summarize_readings(
    State(app): State<AppState>,
    Path(GaugeSeriesPath {
        gauge_id,
        series_id,
    }): Path<GaugeSeriesPath>,
    Query(q): Query<SummaryQuery>,
) -> impl IntoApiResponse {
    let (from, to) = match resolve_range(&q, Utc::now()) {
        Ok(r) => r,
        Err(e) => return e.into_response(),
    };
    let points = q
        .points
        .unwrap_or(DEFAULT_POINTS)
        .clamp(MIN_POINTS, MAX_POINTS);
    let fail = |err| {
        ApiError::from_db(
            &format!("Error summarizing readings for series {series_id}"),
            err,
        )
        .into_response()
    };
    match gauges::series_on_gauge(&app.pg_pool, gauge_id, series_id).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => return fail(err),
    }
    match gauges::summarize_readings(&app.pg_pool, series_id, from, to, points).await {
        Ok(s) => Json(s).into_response(),
        Err(err) => fail(err),
    }
}

doc_fn!(summarize_readings_docs, op =>
    op.input::<Path<GaugeSeriesPath>>()
        .input::<Query<SummaryQuery>>()
        .description("Readings of a series in a range, about `points` of them. Raw when the range holds no more than `points` readings (bucket_seconds 0), otherwise bucketed with average, min, max and count; empty buckets are left out.")
        .response::<200, Json<ReadingsSummary>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| {
            res.description("`from` not before `to`, or a range over 5 years")
        })
        .response_with::<404, Json<ErrorResponse>, _>(|res| {
            res.description("Series not found on that gauge")
        })
        .tag("Gauges")
);
