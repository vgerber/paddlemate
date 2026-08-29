use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type MediaId = i64;

/// What a media item is attached to. Only rivers for now; the column is
/// shaped like `comments` so sections and features can join by widening the
/// check.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MediaEntityType {
    Waterway,
}

impl MediaEntityType {
    pub fn as_str(&self) -> &'static str {
        match self {
            MediaEntityType::Waterway => "waterway",
        }
    }
}

/// One gallery covers uploads and links, as whitewater.guide's does: a photo
/// is a file we store, a video or blog is somebody else's URL.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MediaKind {
    Photo,
    Video,
    Blog,
}

impl MediaKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            MediaKind::Photo => "photo",
            MediaKind::Video => "video",
            MediaKind::Blog => "blog",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "photo" => MediaKind::Photo,
            "video" => MediaKind::Video,
            "blog" => MediaKind::Blog,
            _ => return None,
        })
    }
}

/// A stored photo or a linked video/write-up. For a photo the bytes live
/// under MEDIA_DIR and `url`/`thumbnail_url` point at them; for a link they
/// carry the external address.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Media {
    pub id: MediaId,
    pub entity_type: MediaEntityType,
    pub entity_id: i64,
    pub kind: MediaKind,
    pub url: String,
    /// Only photos have one.
    pub thumbnail_url: Option<String>,
    pub mime_type: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub byte_size: Option<i64>,
    pub caption: Option<String>,
    /// Who took the photo, when that is not the uploader.
    pub copyright: Option<String>,
    pub license_name: Option<String>,
    pub license_url: Option<String>,
    /// Gallery order, lowest first.
    pub weight: i32,
    /// Set when the item was posted inside a note.
    pub comment_id: Option<i64>,
    pub uploaded_by: String,
    pub created_at: DateTime<Utc>,
}

/// Attribution and ordering, settable on upload and editable afterwards.
#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct MediaDetails {
    pub caption: Option<String>,
    pub copyright: Option<String>,
    pub license_name: Option<String>,
    pub license_url: Option<String>,
    pub weight: Option<i32>,
}
