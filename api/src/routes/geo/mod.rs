//! Geographic lookups: what lies at or around a line on the map. These are
//! derived answers about OSM data rather than paddlemate's own content, so
//! they group under /geo instead of standing beside the domain collections
//! (waterways, gauges, descents).

mod params;
mod regions;
mod river_segments;

use aide::axum::ApiRouter;

use crate::state::AppState;

pub fn geo_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .nest_api_service("/regions", regions::regions_routes(state.clone()))
        .nest_api_service(
            "/river-segments",
            river_segments::river_segments_routes(state),
        )
}
