use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type ImageId = i64;

/// What an image is attached to. Only rivers for now; the column is shaped
/// like `comments` so sections and features can join by widening the check.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ImageEntityType {
    Waterway,
}

impl ImageEntityType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ImageEntityType::Waterway => "waterway",
        }
    }
}

/// A stored photo. The bytes live under MEDIA_DIR; `url` and `thumbnail_url`
/// are what a client fetches.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct Image {
    pub id: ImageId,
    pub entity_type: ImageEntityType,
    pub entity_id: i64,
    pub url: String,
    pub thumbnail_url: String,
    pub mime_type: String,
    pub width: i32,
    pub height: i32,
    pub byte_size: i64,
    pub caption: Option<String>,
    pub uploaded_by: String,
    pub created_at: DateTime<Utc>,
}
