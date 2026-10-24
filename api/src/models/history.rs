use std::collections::HashMap;

use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::waterway::PaginatedResponse;

/// Query parameters of a history listing.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct HistoryQuery {
    /// Page number, starting at 1.
    pub page: Option<i64>,
    /// Steps per page (max 100, default 50).
    pub per_page: Option<i64>,
}

/// Query parameters of a section's history.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct SectionHistoryQuery {
    /// Page number, starting at 1.
    pub page: Option<i64>,
    /// Steps per page (max 100, default 50), for the section and for each
    /// feature alike.
    pub per_page: Option<i64>,
    /// Also return the history of each of the section's features, including
    /// ones deleted since, under `features`.
    pub include_features: Option<bool>,
}

impl SectionHistoryQuery {
    pub fn paging(&self) -> HistoryQuery {
        HistoryQuery {
            page: self.page,
            per_page: self.per_page,
        }
    }
}

/// Query parameters of the sources view.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct SourcesQuery {
    /// Count only this section's entries (its own and its features'), and
    /// only the contributors behind them. Must belong to the waterway.
    pub section_id: Option<i64>,
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

    /// The step kind stored in the database, None for an unknown name.
    pub fn parse(s: &str) -> Option<Self> {
        serde_json::from_value(serde_json::Value::String(s.to_string())).ok()
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
    /// The submitter's note on that proposal, if they left one
    pub proposal_note: Option<String>,
    pub reviewer: Option<HistoryUser>,
    pub changes: Vec<HistoryChange>,
}

/// A feature that was deleted from a section, as it last stood.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeletedFeature {
    pub feature_id: i64,
    /// Name when it was last live; null if it had none recorded
    pub name: Option<String>,
    /// Type when it was last live, e.g. `weir`
    pub feature_type: Option<String>,
    pub deleted_at: DateTime<Utc>,
    /// Who deleted it (the submitter, when a proposal did)
    pub deleted_by: Option<HistoryUser>,
    /// Set when the delete is the outcome of a proposal
    pub proposal_id: Option<i64>,
    pub reviewer: Option<HistoryUser>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step_kind_names_match_serde() {
        for kind in [
            StepKind::Imported,
            StepKind::Created,
            StepKind::ProposalAccepted,
            StepKind::Edited,
            StepKind::Deleted,
        ] {
            assert_eq!(StepKind::parse(kind.as_str()), Some(kind));
            assert_eq!(serde_json::to_value(kind).unwrap(), kind.as_str());
        }
        assert_eq!(StepKind::parse("bogus"), None);
    }
}

/// A section's history page, with its features' pages when asked for.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct SectionHistory {
    #[serde(flatten)]
    pub page: PaginatedResponse<HistoryStep>,
    /// Feature id to that feature's page, as its own history route returns it.
    /// Only with `include_features=true`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub features: Option<HashMap<i64, PaginatedResponse<HistoryStep>>>,
}
