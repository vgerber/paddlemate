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

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Comment {
    pub id: CommentId,
    pub entity_type: CommentEntityType,
    pub entity_id: i64,
    pub body: String,
    pub author_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct CreateCommentRequest {
    pub body: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct UpdateCommentRequest {
    pub body: String,
}
