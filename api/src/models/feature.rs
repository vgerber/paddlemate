use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{geometry::Geometry, water_section::SectionId};

pub type FeatureId = i64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "feature_type", rename_all = "snake_case")]
pub enum FeatureType {
    Whitewater,
    FreestyleSpot,
    Hole,
    Siphon,
    Strainer,
    Weir,
    Dam,
    Obstacle,
    Bridge,
    Portage,
    PutIn,
    TakeOut,
    Waterfall,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FeatureName {
    pub id: i64,
    pub feature_id: FeatureId,
    pub lang_code: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FeatureDescription {
    pub id: i64,
    pub feature_id: FeatureId,
    pub lang_code: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Feature {
    pub id: FeatureId,
    pub section_id: SectionId,
    pub feature_type: FeatureType,
    pub metadata: Value,
    /// GeoJSON geometry (Point, LineString, or Polygon)
    pub location: Geometry,
    pub names: Vec<FeatureName>,
    pub descriptions: Vec<FeatureDescription>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
