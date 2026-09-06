use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::geometry::Geometry;
use super::user::UserId;
use super::visibility::Visibility;
use super::water_section::SectionId;

pub type TripId = i64;
pub type TripStayId = i64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "trip_member_role", rename_all = "snake_case")]
pub enum TripMemberRole {
    Admin,
    Member,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "trip_stay_kind", rename_all = "snake_case")]
pub enum TripStayKind {
    Camp,
    Hotel,
    Bivouac,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "trip_section_status", rename_all = "snake_case")]
pub enum TripSectionStatus {
    Planned,
    Optional,
    Done,
    Skipped,
}

/// A collaborative trip. Ownership is a member row with role `admin`, so it
/// can be transferred or shared without touching the trip itself.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Trip {
    pub id: TripId,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub start_date: NaiveDate,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_date: Option<NaiveDate>,
    pub visibility: Visibility,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible_from: Option<DateTime<Utc>>,
    pub created_by: UserId,
    /// Role of the requesting user, absent when they are not a member.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub viewer_role: Option<TripMemberRole>,
    pub member_count: i64,
    /// Logged descents linked to the trip. One run by four paddlers is four
    /// logs, since every member keeps their own.
    pub descent_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A member of a trip, with the days - and, once they know them, the hours -
/// they can personally make.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TripMember {
    pub trip_id: TripId,
    pub user_id: UserId,
    pub username: String,
    pub role: TripMemberRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arrival: Option<NaiveDate>,
    /// Local to the trip, so it reads the same for everyone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arrival_time: Option<NaiveTime>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub departure: Option<NaiveDate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub departure_time: Option<NaiveTime>,
    pub created_at: DateTime<Utc>,
}

/// Where the group is based for part of the trip. Only `kind` and `name` are
/// required so a stay works as a placeholder while booking is still open.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TripStay {
    pub id: TripStayId,
    pub trip_id: TripId,
    pub kind: TripStayKind,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// GeoJSON Point of the accommodation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<Geometry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arrival: Option<NaiveDate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub departure: Option<NaiveDate>,
    pub sections: Vec<TripSection>,
    pub created_by: UserId,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A section the group is watching from one stay. The same section can be
/// watched from several stays: two camps a kilometre apart reach the same
/// rivers, and each keeps its own list when the base moves.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TripSection {
    pub id: i64,
    pub stay_id: TripStayId,
    pub section_id: SectionId,
    pub sort_order: i32,
    pub status: TripSectionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub waterway_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub waterway_id: Option<i64>,
    /// GeoJSON LineString geometry of the section.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<Geometry>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct TripSectionInput {
    pub section_id: SectionId,
    pub sort_order: i32,
    pub status: Option<TripSectionStatus>,
    pub note: Option<String>,
}

/// A trip is created with its first stay, so the watch list always hangs off
/// somewhere. Kind and name are enough - "somewhere in the Oetztal" is a
/// valid plan to work against.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct CreateTripStayRequest {
    pub kind: TripStayKind,
    pub name: String,
    pub description: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub arrival: Option<NaiveDate>,
    pub departure: Option<NaiveDate>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateTripRequest {
    pub name: String,
    pub description: Option<String>,
    pub start_date: NaiveDate,
    pub end_date: Option<NaiveDate>,
    pub visibility: Visibility,
    pub visible_from: Option<DateTime<Utc>>,
    pub stay: CreateTripStayRequest,
}

/// Partial update for a trip. Omitted fields are left unchanged; nullable
/// fields take `null` to clear. Patching `visibility` to `shared` replaces the
/// full audience inline, to `private` or `public` clears it.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct PatchTripRequest {
    pub name: Option<String>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub description: Option<Option<String>>,
    pub start_date: Option<NaiveDate>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub end_date: Option<Option<NaiveDate>>,
    pub visibility: Option<Visibility>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub visible_from: Option<Option<DateTime<Utc>>>,
}

/// Partial update for a stay. The base moves while the trip is already
/// running, so every field stays editable throughout.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct PatchTripStayRequest {
    pub kind: Option<TripStayKind>,
    pub name: Option<String>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub description: Option<Option<String>>,
    /// Omit to leave unchanged; send null to clear the location.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub lat: Option<Option<f64>>,
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub lon: Option<Option<f64>>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub arrival: Option<Option<NaiveDate>>,
    /// Omit to leave unchanged; send null to clear. Needs a day to sit on.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub arrival_time: Option<Option<NaiveTime>>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub departure: Option<Option<NaiveDate>>,
    /// Omit to leave unchanged; send null to clear. Needs a day to sit on.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub departure_time: Option<Option<NaiveTime>>,
}

/// Role is admin-only; arrival and departure are the member's own record.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct PatchTripMemberRequest {
    pub role: Option<TripMemberRole>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub arrival: Option<Option<NaiveDate>>,
    /// Omit to leave unchanged; send null to clear. Needs a day to sit on.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub arrival_time: Option<Option<NaiveTime>>,
    /// Omit to leave unchanged; send null to clear.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub departure: Option<Option<NaiveDate>>,
    /// Omit to leave unchanged; send null to clear. Needs a day to sit on.
    #[serde(default, deserialize_with = "super::patch::nullable")]
    pub departure_time: Option<Option<NaiveTime>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ReplaceTripSectionsRequest {
    pub sections: Vec<TripSectionInput>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ReplaceAudienceUsersRequest {
    pub users: Vec<UserId>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ReplaceAudienceGroupsRequest {
    pub groups: Vec<i64>,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct ListTripsQuery {
    /// Filter scope: "member" returns only trips the caller belongs to;
    /// "visible" (default) returns every trip visible to the viewer.
    pub scope: Option<String>,
    /// Only return trips that have not ended before this date.
    pub from: Option<NaiveDate>,
    /// Only return trips that start on or before this date.
    pub to: Option<NaiveDate>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}
