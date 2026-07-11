use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{
    feature::{CreateFeatureBody, Feature},
    geometry::Geometry,
    waterway::WaterwayId,
};

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

/// A localized name/description pair submitted with a new section. The plain
/// `name`/`description` fields stay the default (fallback) text.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SectionTranslationBody {
    /// BCP-47 language code, e.g. "de"
    pub lang_code: String,
    pub name: Option<String>,
    pub description: Option<String>,
}

/// Payload for creating a section together with its localized texts and
/// features — one reviewable unit for the proposal workflow.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateSectionBody {
    pub name: String,
    pub description: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    /// GeoJSON LineString geometry
    pub location: Geometry,
    /// Localized names/descriptions created together with the section
    #[serde(default)]
    pub translations: Vec<SectionTranslationBody>,
    /// Features created together with the section
    #[serde(default)]
    pub features: Vec<CreateFeatureBody>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateSectionBody {
    pub name: Option<String>,
    pub description: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    pub location: Option<Geometry>,
}
