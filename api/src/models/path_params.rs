use schemars::JsonSchema;
use serde::Deserialize;

use super::{comment::CommentId, water_section::SectionId, waterway::WaterwayId};

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
