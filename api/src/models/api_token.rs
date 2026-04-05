use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type ApiTokenId = i64;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ApiToken {
    pub id: ApiTokenId,
    pub user_id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<DateTime<Utc>>,
    pub is_active: bool,
}
