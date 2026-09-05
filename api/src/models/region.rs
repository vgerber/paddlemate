use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::geometry::Geometry;

/// How specific a region name is. Ordered most specific first, which is also
/// the order regions are returned and stored in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RegionKind {
    /// Named valley the section runs through (OSM natural=valley).
    Valley,
    /// Administrative district (OSM admin_level 6).
    District,
    /// State or province (OSM admin_level 4).
    State,
    /// Mountain range (OSM place=region + region:type=mountain_area).
    Range,
    /// Country; `name` is the ISO 3166-1 alpha-2 code.
    Country,
}

impl RegionKind {
    /// The value stored in `regions.kind`. A country is stored like any
    /// other region, but only so that the others can be told which one they
    /// are in - it is never offered as a region to search in.
    pub fn as_str(self) -> &'static str {
        match self {
            RegionKind::Valley => "valley",
            RegionKind::District => "district",
            RegionKind::State => "state",
            RegionKind::Range => "range",
            RegionKind::Country => "country",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "valley" => Some(RegionKind::Valley),
            "district" => Some(RegionKind::District),
            "state" => Some(RegionKind::State),
            "range" => Some(RegionKind::Range),
            "country" => Some(RegionKind::Country),
            _ => None,
        }
    }
}

/// One named region a section lies in. `id`, `country` and `bbox` are filled
/// for regions whose outline has been imported; regions derived live from OSM
/// for a line carry the name and kind only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Region {
    pub id: Option<i64>,
    pub name: String,
    pub kind: RegionKind,
    /// ISO 3166-1 alpha-2 code of the country the region lies in.
    pub country: Option<String>,
    /// Outline bounding box as [west, south, east, north].
    pub bbox: Option<[f64; 4]>,
}

impl Region {
    /// A region known by name and kind only, as derived for a line.
    pub fn named(name: String, kind: RegionKind) -> Self {
        Region {
            id: None,
            name,
            kind,
            country: None,
            bbox: None,
        }
    }
}

/// An imported region with its boundary, for drawing on the map.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RegionOutline {
    pub id: i64,
    pub name: String,
    pub kind: RegionKind,
    pub country: Option<String>,
    /// Outline bounding box as [west, south, east, north].
    pub bbox: [f64; 4],
    /// Simplified boundary: an area for administrative regions and mountain
    /// ranges, a line for valleys.
    pub geometry: Geometry,
    /// Index into whatever palette the client draws with, chosen so that no
    /// two regions overlapping each other get the same one. Zero when the
    /// region was fetched on its own, with nothing to be told apart from.
    pub palette_index: i32,
}

/// A country's border where it crosses the viewport, for keeping your
/// bearings while browsing regions.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CountryBorder {
    pub name: String,
    /// ISO 3166-1 alpha-2 code.
    pub country: String,
    /// The boundary line, clipped to the viewport and simplified for it.
    pub geometry: Geometry,
}

/// A viewport's worth of regions for the browse layer.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RegionOutlineList {
    pub regions: Vec<RegionOutline>,
    /// Country borders crossing the viewport, drawn over everything else.
    /// Present at every zoom, including one too wide to draw regions at.
    pub countries: Vec<CountryBorder>,
    /// True while ground in the viewport is still being fetched from OSM.
    /// Ask again shortly for the regions that are not in yet.
    pub filling: bool,
}
