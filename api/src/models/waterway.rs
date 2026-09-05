use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::water_section::{SectionId, SectionWithFeatures};

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
    pub sections: Vec<SectionWithFeatures>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Which text a search hit came from, so a client can say why a river matched
/// when the matching text is not the name it displays.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MatchSource {
    Waterway,
    Section,
    SectionName,
    FeatureName,
}

impl MatchSource {
    /// Counterpart of the source labels produced by the `searchable_names` view.
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "waterway" => Some(Self::Waterway),
            "section" => Some(Self::Section),
            "section_name" => Some(Self::SectionName),
            "feature_name" => Some(Self::FeatureName),
            _ => None,
        }
    }
}

/// A waterway as returned by search, carrying what matched the query.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WaterwayListItem {
    pub id: WaterwayId,
    pub waterway_type: WaterwayType,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// The text that matched; unset when the request had no name filter.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_source: Option<MatchSource>,
    /// Language of the matched text, when it came from a translation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_lang: Option<String>,
    /// Section the matched text belongs to, for highlighting it in a list.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_section_id: Option<SectionId>,
    /// Name of that section, so a rapid match can say where the rapid is.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_section_name: Option<String>,
    /// True when the row matched only approximately, i.e. the query was
    /// probably misspelled.
    pub fuzzy: bool,
    /// Where the river is, least specific first - country code, then the
    /// regions its sections lie in, so a name on its own says which of the
    /// world's rivers it is. Empty for a river with no located sections.
    pub place: Vec<String>,
}

/// Query parameters of the waterway search.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct WaterwayFilters {
    /// Page number, starting at 1.
    pub page: Option<i64>,
    /// Items per page (max 100, default 20).
    pub per_page: Option<i64>,
    /// Filter by river, section or rapid name, including translations.
    /// Diacritics and common misspellings are matched too.
    pub name: Option<String>,
    /// Filter by ISO 3166-1 alpha-2 country code (e.g. "AT", "FR").
    pub country: Option<String>,
    /// Minimum whitewater grade (1=I … 6=VI, 10=X).
    pub min_difficulty: Option<i32>,
    /// Maximum whitewater grade (1=I … 6=VI, 10=X).
    pub max_difficulty: Option<i32>,
    /// Latitude for proximity filter (requires lon and radius_km).
    pub lat: Option<f64>,
    /// Longitude for proximity filter (requires lat and radius_km).
    pub lon: Option<f64>,
    /// Radius in km - returns waterways with at least one section within this distance.
    pub radius_km: Option<f64>,
    /// Region to filter by - returns waterways with at least one section
    /// inside the region's imported outline.
    pub region_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PaginatedResponse<T: JsonSchema> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
    pub total_pages: i64,
}
