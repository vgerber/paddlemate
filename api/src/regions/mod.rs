//! Region derivation for sections, from OpenStreetMap.
//!
//! A section's LineString is sampled at up to three points; one Overpass
//! request per point returns (a) containing administrative areas (district
//! admin_level 6, state admin_level 4) and mountain-range regions
//! (place=region + region:type=mountain_area), and (b) named natural=valley
//! ways/relations within 2 km - OSM valleys are lines, never polygons, so
//! proximity is the only way to get names like "Oetztal" or "Engadin".
//!
//! Regions are stored most specific first: valleys, districts, states,
//! ranges. Valleys keep only the names seen by the most sample points, which
//! filters out side valleys that happen to be near one endpoint.
//!
//! `outline_query` and `collect_outline` are the other direction: given a
//! region name and a point inside it, they fetch the OSM elements that draw
//! its boundary, for the import_region_outlines bin to store.
//!
//! `run_worker` is the live path: a background loop that fills any section
//! whose regions array is empty, woken right after a section is created (or
//! a section proposal approved) so new sections get their regions within
//! seconds without a manual backfill. The derive_section_regions bin reuses
//! the same pieces for bulk runs.

mod derive;
mod fill;
mod outline;
mod tiers;
mod worker;

use std::time::Duration;

pub use derive::{
    DerivedRegions, PointRegions, classify, derive_for_location, merge_country, merge_regions,
    region_query, sample_points,
};
pub use fill::{Browse, browse, ensure_browse_fill};
pub use outline::{OutlineSource, collect_outline, outline_query, store_outline};
pub use tiers::{
    BrowseTier, BrowsedRegion, CHOOSABLE_TIERS, browse_query, choosable_kinds, collect_browse,
    parse_kinds, span_limits, tiers_for_span, tiles_bbox, tiles_for_bbox,
};
pub use worker::run_worker;

/// How far from a section a named valley still counts as its valley.
const VALLEY_RADIUS_M: u32 = 2_000;
/// Pause between Overpass requests of one batch.
pub const REQUEST_GAP: Duration = Duration::from_secs(1);
