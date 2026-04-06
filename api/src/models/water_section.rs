use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{feature::Feature, geometry::Geometry, waterway::WaterwayId};

pub type SectionId = i64;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Section {
    pub id: SectionId,
    pub waterway_id: WaterwayId,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// GeoJSON LineString geometry
    pub location: Geometry,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SectionWithFeatures {
    pub id: SectionId,
    pub waterway_id: WaterwayId,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// GeoJSON LineString geometry
    pub location: Geometry,
    pub features: Vec<Feature>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
