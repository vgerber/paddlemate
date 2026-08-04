use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    gauge::FeatureWaterRangeBody,
    geometry::Geometry,
    lang::{DEFAULT_LANG_CODE, normalize_lang_code},
    water_section::SectionId,
};

pub type FeatureId = i64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "feature_type", rename_all = "snake_case")]
pub enum FeatureType {
    Whitewater,
    Rapid,
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

fn default_metadata() -> Value {
    Value::Object(serde_json::Map::new())
}

/// Payload for creating a feature - used by the feature endpoint, by bundled
/// section-create payloads, and inside proposals.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateFeatureBody {
    pub feature_type: FeatureType,
    #[serde(default = "default_metadata")]
    pub metadata: Value,
    /// GeoJSON geometry (Point, LineString, or Polygon)
    pub location: Geometry,
    pub name: Option<String>,
    pub description: Option<String>,
    /// Language tag for name/description, stored lowercase (default: "en")
    pub lang_code: Option<String>,
    /// Gauge thresholds created together with the feature
    #[serde(default)]
    pub water_ranges: Vec<FeatureWaterRangeBody>,
}

impl CreateFeatureBody {
    /// Put the language tag into its stored form and fill in the default, so
    /// that everything downstream - including a proposal payload serialized
    /// from this body - carries a code that is already canonical.
    pub fn normalize_lang_code(&mut self) -> Result<(), &'static str> {
        let code = self.lang_code.as_deref().unwrap_or(DEFAULT_LANG_CODE);
        self.lang_code = Some(normalize_lang_code(code)?);
        Ok(())
    }
}
