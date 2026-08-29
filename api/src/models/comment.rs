use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type CommentId = i64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CommentEntityType {
    WaterSection,
    Feature,
    Waterway,
}

/// What kind of note this is. A tree across the channel and a trip report
/// are different things and must not read alike; the set follows Riverzone's
/// note categories, the reference for this kind of field report.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CommentCategory {
    /// Immediate hazard to life.
    Urgent,
    /// Temporary obstruction: a tree, works, a fence.
    DangerTemporary,
    /// A previously reported temporary danger is gone.
    DangerCleared,
    /// Permanent hazard: weir, siphon.
    DangerPermanent,
    /// Gauge readings against what was actually on the water.
    Calibration,
    /// The grade is harder or easier than recorded.
    Difficulty,
    /// What the river was doing on a given day.
    CurrentConditions,
    /// Access, permits, closures.
    Regulations,
    /// Shuttle, parking, take-out logistics.
    Logistics,
    /// Anything else.
    Info,
}

impl CommentCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            CommentCategory::Urgent => "urgent",
            CommentCategory::DangerTemporary => "danger_temporary",
            CommentCategory::DangerCleared => "danger_cleared",
            CommentCategory::DangerPermanent => "danger_permanent",
            CommentCategory::Calibration => "calibration",
            CommentCategory::Difficulty => "difficulty",
            CommentCategory::CurrentConditions => "current_conditions",
            CommentCategory::Regulations => "regulations",
            CommentCategory::Logistics => "logistics",
            CommentCategory::Info => "info",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "urgent" => CommentCategory::Urgent,
            "danger_temporary" => CommentCategory::DangerTemporary,
            "danger_cleared" => CommentCategory::DangerCleared,
            "danger_permanent" => CommentCategory::DangerPermanent,
            "calibration" => CommentCategory::Calibration,
            "difficulty" => CommentCategory::Difficulty,
            "current_conditions" => CommentCategory::CurrentConditions,
            "regulations" => CommentCategory::Regulations,
            "logistics" => CommentCategory::Logistics,
            "info" => CommentCategory::Info,
            _ => return None,
        })
    }
}

/// Where a note stands. `Merged` means an editor folded it into curated
/// data (a feature, a description), so it can drop out of the thread
/// without being deleted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CommentStatus {
    Ok,
    Merged,
    Outdated,
    Spam,
}

impl CommentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            CommentStatus::Ok => "ok",
            CommentStatus::Merged => "merged",
            CommentStatus::Outdated => "outdated",
            CommentStatus::Spam => "spam",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "ok" => CommentStatus::Ok,
            "merged" => CommentStatus::Merged,
            "outdated" => CommentStatus::Outdated,
            "spam" => CommentStatus::Spam,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Comment {
    pub id: CommentId,
    pub entity_type: CommentEntityType,
    pub entity_id: i64,
    pub body: String,
    pub category: CommentCategory,
    pub status: CommentStatus,
    pub author_id: String,
    /// Media posted with this note, in gallery order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub media: Vec<crate::models::media_item::Media>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct CreateCommentRequest {
    pub body: String,
    /// Defaults to `info` when the client says nothing.
    #[serde(default)]
    pub category: Option<CommentCategory>,
    /// Ids of already-uploaded media to attach, in the order given. Upload
    /// first, then post the note that shows them.
    #[serde(default)]
    pub media_ids: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct UpdateCommentRequest {
    pub body: String,
    #[serde(default)]
    pub category: Option<CommentCategory>,
}

/// Moderation of a note: admins only.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ModerateCommentRequest {
    pub status: CommentStatus,
}
