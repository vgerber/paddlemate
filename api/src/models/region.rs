use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

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

/// One named region a section lies in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Region {
    pub name: String,
    pub kind: RegionKind,
}
