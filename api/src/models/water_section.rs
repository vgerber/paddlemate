use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{feature::Feature, geometry::Geometry, waterway::WaterwayId};

pub type SectionId = i64;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SectionName {
    pub id: i64,
    pub section_id: SectionId,
    pub lang_code: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SectionDescription {
    pub id: i64,
    pub section_id: SectionId,
    pub lang_code: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Section {
    pub id: SectionId,
    pub waterway_id: WaterwayId,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    /// GeoJSON LineString geometry
    pub location: Geometry,
    pub features: Vec<Feature>,
    /// Localized names; the plain `name` column is the fallback
    #[serde(default)]
    pub names: Vec<SectionName>,
    /// Localized descriptions; the plain `description` column is the fallback
    #[serde(default)]
    pub descriptions: Vec<SectionDescription>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
