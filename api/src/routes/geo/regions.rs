//! Regions - valley, district, state, mountain range and country.
//!
//! Two ways to ask: `line` derives the regions containing a line straight
//! from OSM, which is how the section wizard prefills its region and country
//! fields and how the region worker labels new sections. `q` searches the
//! imported region outlines instead, which is what the river filter offers
//! as selectable areas; those carry an id and a bounding box, and their
//! boundary is fetched per id.
//!
//! The sibling /region-outlines collection is the browse listing behind
//! region mode on the map: every region overlapping the viewport, drawn and
//! clickable. It fills itself from OSM for ground it has not covered yet, so
//! the catalogue is not limited to regions some section already names.

use aide::axum::{ApiRouter, routing::get_with};
use axum::{
    Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::Deserialize;

use super::params::{line_string, parse_bbox, parse_line};
use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    models::region::{Region, RegionKind, RegionOutline, RegionOutlineList},
    query,
    regions::{self, BROWSE_LIMIT, BrowseTier},
    state::AppState,
};

/// Most regions a search returns; an autocomplete needs no more.
const SEARCH_LIMIT: i64 = 30;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RegionQuery {
    /// Line to look up, as "lon,lat;lon,lat;..." (start, middle and end of a
    /// section are enough). Derives the containing regions from OSM.
    pub line: Option<String>,
    /// Name fragment to search the imported region outlines for. Diacritics
    /// and common misspellings match too.
    pub q: Option<String>,
    /// Restrict the search to one kind of region.
    pub kind: Option<RegionKind>,
    /// Restrict the search to one ISO 3166-1 alpha-2 country code.
    pub country: Option<String>,
}

pub async fn list_regions(
    State(state): State<AppState>,
    Query(query): Query<RegionQuery>,
) -> impl aide::axum::IntoApiResponse {
    if let Some(raw) = query.line.as_deref() {
        let line = match parse_line(raw) {
            Ok(line) => line,
            Err(err) => return err.into_response(),
        };
        let derived = regions::derive_for_location(&line_string(&line)).await;
        return Json(derived.with_country()).into_response();
    }

    let name = query.q.as_deref().map(str::trim).filter(|q| !q.is_empty());
    match query::regions::search(
        &state.pg_pool,
        name,
        query.kind,
        query.country.as_deref(),
        SEARCH_LIMIT,
    )
    .await
    {
        Ok(regions) => Json(regions).into_response(),
        Err(err) => ApiError::from_db("searching regions", err).into_response(),
    }
}

doc_fn!(list_regions_docs, op =>
    op.description("Regions, either containing a line or matching a name. With `line`, valley, district, state, mountain range and country are derived from OSM, most specific first - best effort, an empty list means nothing was found or the upstream OSM service was unreachable. Otherwise the imported region outlines are searched, and each result carries an id and a bounding box.")
        .response::<200, Json<Vec<Region>>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Bad line"))
        .tag("Geo")
);

#[derive(Debug, Deserialize, JsonSchema)]
pub struct BrowseQuery {
    /// Viewport to draw regions for, as "south,west,north,east".
    pub bbox: String,
}

pub async fn list_region_outlines(
    State(state): State<AppState>,
    Query(query): Query<BrowseQuery>,
) -> impl aide::axum::IntoApiResponse {
    let Some(bbox) = parse_bbox(&query.bbox) else {
        return ApiError::validation("bbox must be 'south,west,north,east'")
            .with_target("bbox")
            .into_response();
    };
    let (south, west, north, east) = bbox;

    // Country borders come back at every zoom, including one too wide to
    // draw regions at - they are what tells you where you are looking.
    let countries = match query::regions::country_borders(&state.pg_pool, bbox).await {
        Ok(countries) => countries,
        Err(err) => return ApiError::from_db("listing region outlines", err).into_response(),
    };

    // Zoomed out past every tier there is no region worth drawing, which is
    // an empty list rather than an error.
    let Some(tier) = BrowseTier::for_span((east - west).max(north - south)) else {
        return Json(RegionOutlineList {
            regions: vec![],
            countries,
            filling: false,
        })
        .into_response();
    };

    let filling = match regions::ensure_browse_fill(&state.pg_pool, tier, bbox).await {
        Ok(filling) => filling,
        Err(err) => return ApiError::from_db("listing region outlines", err).into_response(),
    };
    match query::regions::in_bbox(&state.pg_pool, bbox, tier.kinds(), BROWSE_LIMIT).await {
        Ok(regions) => Json(RegionOutlineList {
            regions,
            countries,
            filling,
        })
        .into_response(),
        Err(err) => ApiError::from_db("listing region outlines", err).into_response(),
    }
}

doc_fn!(list_region_outlines_docs, op =>
    op.description("Regions overlapping a viewport, with their boundaries, for drawing region mode on the map. Which kinds come back depends on how much ground the viewport covers: states at country zoom, districts and mountain ranges in between, valleys at river zoom. Ground the server has not seen before is fetched from OSM in the background, which takes seconds for a boundary the size of a district - `filling` says that is happening and the request should be repeated shortly for the rest. An empty region list with `filling` false means the map is zoomed too far out to draw regions; the country borders still come back, clipped to the viewport, so the map can always say which country you are looking at.")
        .response::<200, Json<RegionOutlineList>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Bad bbox"))
        .tag("Geo")
);

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RegionPath {
    region_id: i64,
}

pub async fn get_region(
    State(state): State<AppState>,
    Path(path): Path<RegionPath>,
) -> impl aide::axum::IntoApiResponse {
    match query::regions::fetch(&state.pg_pool, path.region_id).await {
        Ok(Some(region)) => Json(region).into_response(),
        Ok(None) => ApiError::not_found("Region not found").into_response(),
        Err(err) => ApiError::from_db("loading a region", err).into_response(),
    }
}

doc_fn!(get_region_docs, op =>
    op.description("One imported region with the area it covers. Administrative regions and mountain ranges give their boundary; a valley is a line in OSM, so it gives a corridor along that line. Simplified for drawing, not survey accurate - the region filter allows a wider tolerance around a valley than the drawn corridor shows, because OSM often traces one side of a valley rather than its axis.")
        .response::<200, Json<RegionOutline>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Unknown region"))
        .tag("Geo")
);

pub fn regions_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/", get_with(list_regions, list_regions_docs))
        .api_route("/{region_id}", get_with(get_region, get_region_docs))
        .with_state(state)
}

pub fn region_outlines_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_region_outlines, list_region_outlines_docs),
        )
        .with_state(state)
}
