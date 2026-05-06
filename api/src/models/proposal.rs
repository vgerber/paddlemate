use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub type ProposalId = i64;

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
    pub submitted_by: String,
    pub status: ProposalStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Request body for approving or rejecting a proposal
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ReviewRequest {
    pub status: ProposalStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_note: Option<String>,
}
