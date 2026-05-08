use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::water_section::Section;

pub type WaterwayId = i64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "waterway_type", rename_all = "snake_case")]
pub enum WaterwayType {
    River,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Waterway {
    pub id: WaterwayId,
    pub waterway_type: WaterwayType,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WaterwayWithSections {
    pub id: WaterwayId,
    pub waterway_type: WaterwayType,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    pub sections: Vec<Section>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PaginatedResponse<T: JsonSchema> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
    pub total_pages: i64,
}
