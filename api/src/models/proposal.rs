use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub type ProposalId = i64;

/// Filters accepted by the unified proposal listing endpoint.
#[derive(Debug, Default)]
pub struct ListProposalsFilters {
    pub status: Option<String>,
    pub entity_type: Option<String>,
    pub operation: Option<String>,
    pub waterway_id: Option<i64>,
    pub section_id: Option<i64>,
    pub feature_id: Option<i64>,
    pub submitted_by: Option<String>,
    /// 1-based page, already clamped.
    pub page: i64,
    /// Rows per page, already clamped.
    pub per_page: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProposalEntityType {
    Waterway,
    WaterSection,
    Feature,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProposalOperation {
    Create,
    Update,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProposalStatus {
    Pending,
    Approved,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Proposal {
    pub id: ProposalId,
    pub entity_type: ProposalEntityType,
    /// ID of the existing record for update/delete operations; null for create
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<i64>,
    pub operation: ProposalOperation,
    /// Full snapshot of the proposed state
    pub proposed_data: Value,
    /// Snapshot of the entity state before this proposal (null for create operations)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_data: Option<Value>,
    pub submitted_by: String,
    /// Username of the submitter; null when the account no longer exists
    pub submitted_by_name: Option<String>,
    pub status: ProposalStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_by: Option<String>,
    /// Username of the reviewer; null while pending or when the account is gone
    pub reviewed_by_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_note: Option<String>,
    /// The submitter's own note on why they propose this, if they gave one
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submitter_note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub upvotes: i64,
    pub downvotes: i64,
    /// The calling user's current vote (1 or -1), absent if not voted
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_vote: Option<i16>,
}

/// Request body for approving or rejecting a proposal
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ReviewRequest {
    pub status: ProposalStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_note: Option<String>,
}

/// Request body for voting on a proposal
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct VoteRequest {
    /// 1 for upvote, -1 for downvote
    pub vote: i16,
}

/// Longest submitter note, in characters.
pub const MAX_NOTE_CHARS: usize = 500;

/// A change body that may carry the submitter's note. The note is kept with
/// the proposal when the caller is not an admin, and ignored when the change
/// is applied directly.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct Proposable<T> {
    #[serde(flatten)]
    pub body: T,
    /// Optional note for the reviewer (max 500 characters)
    pub proposal_note: Option<String>,
}

/// Trim a submitter note; blank means none. Too long is a validation error.
pub fn clean_note(raw: Option<String>) -> Result<Option<String>, crate::error::ApiError> {
    let Some(raw) = raw else { return Ok(None) };
    let note = raw.trim();
    if note.chars().count() > MAX_NOTE_CHARS {
        return Err(crate::error::ApiError::validation(format!(
            "proposal_note must be at most {MAX_NOTE_CHARS} characters"
        ))
        .with_target("proposal_note"));
    }
    Ok((!note.is_empty()).then(|| note.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notes_are_trimmed_and_bounded() {
        assert_eq!(clean_note(None).unwrap(), None);
        assert_eq!(clean_note(Some("  ".into())).unwrap(), None);
        assert_eq!(clean_note(Some(" hi ".into())).unwrap(), Some("hi".into()));
        assert!(clean_note(Some("a".repeat(MAX_NOTE_CHARS))).is_ok());
        assert!(clean_note(Some("a".repeat(MAX_NOTE_CHARS + 1))).is_err());
    }
}
