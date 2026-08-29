//! The regions a line lies in - valley, district, state, mountain range and
//! country, most specific first. Derived from OSM server-side; the section
//! wizard prefills its region and country fields from here, and the region
//! worker stores the same list on new sections.

use aide::axum::{ApiRouter, routing::get_with};
use axum::{Json, extract::Query, response::IntoResponse};
use schemars::JsonSchema;
use serde::Deserialize;

use super::params::{line_string, parse_line};
use crate::{doc_fn, error::ErrorResponse, models::region::Region, regions, state::AppState};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RegionQuery {
    /// The line to look up, as "lon,lat;lon,lat;..." (start, middle and end
    /// of a section are enough).
    pub line: String,
}

pub async fn list_regions(Query(query): Query<RegionQuery>) -> impl aide::axum::IntoApiResponse {
    let line = match parse_line(&query.line) {
        Ok(line) => line,
        Err(err) => return err.into_response(),
    };
    let derived = regions::derive_for_location(&line_string(&line)).await;
    Json(derived.with_country()).into_response()
}

doc_fn!(list_regions_docs, op =>
    op.description("Regions containing the given line - valley, district, state, mountain range and country, most specific first. Best effort: an empty list means nothing was found or the upstream OSM service was unreachable.")
        .response::<200, Json<Vec<Region>>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Bad line"))
        .tag("Geo")
);

pub fn regions_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/", get_with(list_regions, list_regions_docs))
        .with_state(state)
}
