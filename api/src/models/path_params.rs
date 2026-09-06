use schemars::JsonSchema;
use serde::Deserialize;

use super::{
    comment::CommentId,
    trip::{TripId, TripStayId},
    water_section::SectionId,
    waterway::WaterwayId,
};

#[derive(Deserialize, JsonSchema)]
pub struct WaterwayPath {
    pub waterway_id: WaterwayId,
}

#[derive(Deserialize, JsonSchema)]
pub struct SectionPath {
    pub waterway_id: WaterwayId,
    pub section_id: SectionId,
}

#[derive(Deserialize, JsonSchema)]
pub struct FeaturePath {
    pub waterway_id: WaterwayId,
    pub section_id: SectionId,
    pub feature_id: i64,
}

#[derive(Deserialize, JsonSchema)]
pub struct FeatureLocalePath {
    pub waterway_id: WaterwayId,
    pub section_id: SectionId,
    pub feature_id: i64,
    pub lang_code: String,
}

/// A section together with the language of one of its translations.
#[derive(Deserialize, JsonSchema)]
pub struct SectionLocalePath {
    pub waterway_id: WaterwayId,
    pub section_id: SectionId,
    pub lang_code: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct WaterwayMediaPath {
    pub waterway_id: WaterwayId,
    pub media_id: i64,
}

#[derive(Deserialize, JsonSchema)]
pub struct WaterwayCommentPath {
    pub waterway_id: WaterwayId,
    pub comment_id: CommentId,
}

#[derive(Deserialize, JsonSchema)]
pub struct SectionCommentPath {
    pub waterway_id: WaterwayId,
    pub section_id: SectionId,
    pub comment_id: CommentId,
}

#[derive(Deserialize, JsonSchema)]
pub struct FeatureCommentPath {
    pub waterway_id: WaterwayId,
    pub section_id: SectionId,
    pub feature_id: i64,
    pub comment_id: CommentId,
}

#[derive(Deserialize, JsonSchema)]
pub struct ProposalPath {
    pub proposal_id: i64,
}

#[derive(Deserialize, JsonSchema)]
pub struct FeatureProposalPath {
    pub waterway_id: WaterwayId,
    pub proposal_id: i64,
}

#[derive(Deserialize, JsonSchema)]
pub struct DescentPath {
    pub descent_id: i64,
}

#[derive(Deserialize, JsonSchema)]
pub struct GaugePath {
    pub gauge_id: i64,
}

#[derive(Deserialize, JsonSchema)]
pub struct GaugeSeriesPath {
    pub gauge_id: i64,
    pub series_id: i64,
}

#[derive(Deserialize, JsonSchema)]
pub struct FeatureWaterRangePath {
    pub waterway_id: WaterwayId,
    pub section_id: SectionId,
    pub feature_id: i64,
    pub range_id: i64,
}

#[derive(Deserialize, JsonSchema)]
pub struct TripPath {
    pub trip_id: TripId,
}

#[derive(Deserialize, JsonSchema)]
pub struct TripMemberPath {
    pub trip_id: TripId,
    pub user_id: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct TripStayPath {
    pub trip_id: TripId,
    pub stay_id: TripStayId,
}
