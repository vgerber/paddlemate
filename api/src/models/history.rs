use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Query parameters of a history listing.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct HistoryQuery {
    /// Page number, starting at 1.
    pub page: Option<i64>,
    /// Steps per page (max 100, default 50).
    pub per_page: Option<i64>,
}

/// What kind of step this is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum StepKind {
    Imported,
    Created,
    ProposalAccepted,
    Edited,
    Deleted,
}

impl StepKind {
    pub fn as_str(self) -> &'static str {
        match self {
            StepKind::Imported => "imported",
            StepKind::Created => "created",
            StepKind::ProposalAccepted => "proposal_accepted",
            StepKind::Edited => "edited",
            StepKind::Deleted => "deleted",
        }
    }

    pub fn from_db(s: &str) -> Self {
        match s {
            "imported" => StepKind::Imported,
            "proposal_accepted" => StepKind::ProposalAccepted,
            "edited" => StepKind::Edited,
            "deleted" => StepKind::Deleted,
            _ => StepKind::Created,
        }
    }
}

/// A person named in a history. Only the username is exposed.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct HistoryUser {
    pub user_id: String,
    pub username: String,
}

/// A data source (authority) a step came from.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct HistorySource {
    pub id: String,
    pub name: String,
    pub short_name: String,
    pub website: Option<String>,
    pub license_name: Option<String>,
    pub license_url: Option<String>,
}

/// One field a step changed, as short display strings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct HistoryChange {
    pub field: String,
    pub before: Option<String>,
    pub after: Option<String>,
}

/// One step in the life of a river, section or feature.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct HistoryStep {
    pub id: i64,
    pub at: DateTime<Utc>,
    pub kind: StepKind,
    /// Null for an import
    pub actor: Option<HistoryUser>,
    /// Set for an import
    pub source: Option<HistorySource>,
    /// Set when the step is the outcome of a proposal
    pub proposal_id: Option<i64>,
    pub reviewer: Option<HistoryUser>,
    pub changes: Vec<HistoryChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct HistoryPage {
    /// Steps, oldest first
    pub items: Vec<HistoryStep>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
    pub total_pages: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SourceEntries {
    pub source: HistorySource,
    /// Number of steps that name this source
    pub entries: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Contributor {
    pub user: HistoryUser,
    /// Number of steps this user made
    pub steps: i64,
    pub last_at: DateTime<Utc>,
}

/// Where the data of a river comes from and who contributed it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WaterwaySources {
    pub sources: Vec<SourceEntries>,
    pub contributors: Vec<Contributor>,
}
