//! River line segments around a corridor, for routing a section across a
//! confluence. Backed by a live OSM query the server runs on the client's
//! behalf - a browser has no mirror fallbacks and dies on the first rate
//! limit. Not cached: the corridor is different for every request.

use aide::axum::{ApiRouter, routing::get_with};
use axum::{Json, extract::Query, response::IntoResponse};
use schemars::JsonSchema;
use serde::Deserialize;

use super::params::parse_line;
use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    models::geometry::Geometry,
    overpass,
    state::AppState,
};

const DEFAULT_RADIUS_M: f64 = 5_000.0;
const MIN_RADIUS_M: f64 = 100.0;
const MAX_RADIUS_M: f64 = 20_000.0;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RiverSegmentQuery {
    /// Corridor polyline as "lon,lat;lon,lat;...".
    pub line: String,
    /// Corridor radius in meters (100 - 20000, default 5000).
    pub radius_m: Option<f64>,
}

pub async fn list_river_segments(
    Query(query): Query<RiverSegmentQuery>,
) -> impl aide::axum::IntoApiResponse {
    let line = match parse_line(&query.line) {
        Ok(line) => line,
        Err(err) => return err.into_response(),
    };
    let radius_m = query
        .radius_m
        .unwrap_or(DEFAULT_RADIUS_M)
        .clamp(MIN_RADIUS_M, MAX_RADIUS_M);
    match overpass::fetch_network_around_line(&line, radius_m).await {
        Ok(segments) => Json(segments).into_response(),
        Err(err) => {
            tracing::warn!("River segment lookup failed: {err}");
            ApiError::not_found("River segments unavailable").into_response()
        }
    }
}

doc_fn!(list_river_segments_docs, op =>
    op.description("River line segments within a radius of the given corridor line, for routing a section across confluences. 404 when the upstream OSM service is unreachable.")
        .response::<200, Json<Vec<Geometry>>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Bad line or radius"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Lookup unavailable"))
        .tag("Geo")
);

pub fn river_segments_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/", get_with(list_river_segments, list_river_segments_docs))
        .with_state(state)
}
