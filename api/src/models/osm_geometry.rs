use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::geometry::Geometry;

/// What an OSM element represents for a waterway.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum OsmElementKind {
    /// waterway=river/stream way fragment (a line).
    Centerline,
    /// natural=water river area (a polygon), not fetched yet.
    Bank,
}

impl OsmElementKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            OsmElementKind::Centerline => "centerline",
            OsmElementKind::Bank => "bank",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "centerline" => Some(OsmElementKind::Centerline),
            "bank" => Some(OsmElementKind::Bank),
            _ => None,
        }
    }
}

/// One cached OSM element of a waterway.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct OsmElement {
    /// OSM element type: "way" or "relation".
    pub osm_type: String,
    pub osm_id: i64,
    pub kind: OsmElementKind,
    pub geometry: Geometry,
}

/// The cached OSM geometry document of a waterway.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct WaterwayOsmGeometry {
    pub waterway_id: i64,
    /// Newest fetch timestamp among the returned elements.
    pub fetched_at: DateTime<Utc>,
    pub elements: Vec<OsmElement>,
}
