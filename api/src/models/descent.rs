use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::gauge::SectionWaterSnapshot;
use super::geometry::Geometry;

pub type DescentId = i64;

/// Visibility mode for a descent.
/// For `shared`, the audience (users and groups) is embedded directly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Visibility {
    Private,
    Public,
    Shared {
        #[serde(default)]
        users: Vec<String>,
        #[serde(default)]
        groups: Vec<i64>,
    },
}

impl Visibility {
    pub fn scope_str(&self) -> &'static str {
        match self {
            Visibility::Private => "private",
            Visibility::Public => "public",
            Visibility::Shared { .. } => "shared",
        }
    }
}

/// An ordered section that is part of a descent.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DescentSection {
    pub section_id: i64,
    pub sort_order: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub waterway_name: Option<String>,
    /// GeoJSON LineString geometry of the section
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<Geometry>,
    /// Water level snapshots captured at the time the descent was logged.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub water_snapshots: Vec<SectionWaterSnapshot>,
}

/// A logged paddling descent.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Descent {
    pub id: DescentId,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub put_in_feature_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub put_in_lat: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub put_in_lon: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub put_in_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub take_out_feature_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub take_out_lat: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub take_out_lon: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub take_out_label: Option<String>,
    pub visibility: Visibility,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible_from: Option<DateTime<Utc>>,
    pub sections: Vec<DescentSection>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Request bodies ---

/// An ordered section entry for create/replace requests.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct DescentSectionInput {
    pub section_id: i64,
    pub sort_order: i32,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateDescentRequest {
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub name: Option<String>,
    pub note: Option<String>,
    pub put_in_feature_id: Option<i64>,
    pub put_in_lat: Option<f64>,
    pub put_in_lon: Option<f64>,
    pub put_in_label: Option<String>,
    pub take_out_feature_id: Option<i64>,
    pub take_out_lat: Option<f64>,
    pub take_out_lon: Option<f64>,
    pub take_out_label: Option<String>,
    pub visibility: Visibility,
    pub visible_from: Option<DateTime<Utc>>,
    pub sections: Vec<DescentSectionInput>,
}

/// Partial update for a descent.
/// Omitted fields are left unchanged.
/// For nullable fields (note, visible_from), send `null` to clear the value.
/// Patching `visibility` to `shared` replaces the full audience inline.
/// Patching to `private` or `public` clears any existing audience.
/// Patching `sections` replaces the full ordered section list.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct PatchDescentRequest {
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default)]
    pub name: Option<Option<String>>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default)]
    pub note: Option<Option<String>>,
    pub put_in_feature_id: Option<i64>,
    pub put_in_lat: Option<f64>,
    pub put_in_lon: Option<f64>,
    pub put_in_label: Option<String>,
    pub take_out_feature_id: Option<i64>,
    pub take_out_lat: Option<f64>,
    pub take_out_lon: Option<f64>,
    pub take_out_label: Option<String>,
    pub visibility: Option<Visibility>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default)]
    pub visible_from: Option<Option<DateTime<Utc>>>,
    /// When provided, replaces the full ordered section list.
    pub sections: Option<Vec<DescentSectionInput>>,
}

// --- Query parameters ---

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct ListDescentsQuery {
    /// Filter scope: "owned" returns only the authenticated user's descents;
    /// "following" returns public/shared descents from users you follow (auth required);
    /// "visible" (default) returns all descents visible to the viewer.
    pub scope: Option<String>,
    /// Narrow results by visibility: "private", "shared", or "public".
    pub visibility: Option<String>,
    /// Only return descents whose start_time is on or after this timestamp.
    pub from: Option<DateTime<Utc>>,
    /// Only return descents whose start_time is on or before this timestamp.
    pub to: Option<DateTime<Utc>>,
    /// Only return descents that include this water section.
    pub section_id: Option<i64>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}
