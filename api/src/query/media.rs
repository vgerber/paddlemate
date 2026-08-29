use sqlx::{PgPool, Row, postgres::PgRow};

use crate::media::{thumb_key, url_for};
use crate::models::media_item::{Media, MediaDetails, MediaEntityType, MediaId, MediaKind};

const MEDIA_COLS: &str = "id, entity_type, entity_id, kind, storage_key, external_url, mime_type, \
                          width, height, byte_size, caption, copyright, license_name, \
                          license_url, weight, comment_id, uploaded_by, created_at";

fn row_to_media(row: &PgRow) -> Media {
    let kind = MediaKind::parse(&row.get::<String, _>("kind")).unwrap_or(MediaKind::Photo);
    let storage_key: Option<String> = row.get("storage_key");
    let external_url: Option<String> = row.get("external_url");
    Media {
        id: row.get("id"),
        entity_type: MediaEntityType::Waterway,
        entity_id: row.get("entity_id"),
        kind,
        url: match (&storage_key, &external_url) {
            (Some(key), _) => url_for(key),
            (None, Some(url)) => url.clone(),
            // The table's check constraint rules this out.
            (None, None) => String::new(),
        },
        thumbnail_url: storage_key.as_deref().map(|key| url_for(&thumb_key(key))),
        mime_type: row.get("mime_type"),
        width: row.get("width"),
        height: row.get("height"),
        byte_size: row.get("byte_size"),
        caption: row.get("caption"),
        copyright: row.get("copyright"),
        license_name: row.get("license_name"),
        license_url: row.get("license_url"),
        weight: row.get("weight"),
        comment_id: row.get("comment_id"),
        uploaded_by: row.get("uploaded_by"),
        created_at: row.get("created_at"),
    }
}

/// A river's gallery: items added directly, newest first within a weight.
pub async fn list_media(
    db: &PgPool,
    entity_type: MediaEntityType,
    entity_id: i64,
) -> Result<Vec<Media>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {MEDIA_COLS} FROM media
         WHERE entity_type = $1 AND entity_id = $2
         ORDER BY weight, created_at DESC"
    ))
    .bind(entity_type.as_str())
    .bind(entity_id)
    .fetch_all(db)
    .await?;
    Ok(rows.iter().map(row_to_media).collect())
}

/// Media attached to the given notes, for rendering a thread in one query.
pub async fn list_media_for_comments(
    db: &PgPool,
    comment_ids: &[i64],
) -> Result<Vec<Media>, sqlx::Error> {
    if comment_ids.is_empty() {
        return Ok(vec![]);
    }
    let rows = sqlx::query(&format!(
        "SELECT {MEDIA_COLS} FROM media
         WHERE comment_id = ANY($1)
         ORDER BY weight, created_at"
    ))
    .bind(comment_ids)
    .fetch_all(db)
    .await?;
    Ok(rows.iter().map(row_to_media).collect())
}

pub struct NewMedia<'a> {
    pub entity_type: MediaEntityType,
    pub entity_id: i64,
    pub kind: MediaKind,
    pub storage_key: Option<&'a str>,
    pub external_url: Option<&'a str>,
    pub mime_type: Option<&'a str>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub byte_size: Option<i64>,
    pub details: MediaDetails,
    pub uploaded_by: &'a str,
}

pub async fn insert_media(db: &PgPool, new: NewMedia<'_>) -> Result<Media, sqlx::Error> {
    let row = sqlx::query(&format!(
        "INSERT INTO media (entity_type, entity_id, kind, storage_key, external_url, mime_type,
                            width, height, byte_size, caption, copyright, license_name,
                            license_url, weight, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING {MEDIA_COLS}"
    ))
    .bind(new.entity_type.as_str())
    .bind(new.entity_id)
    .bind(new.kind.as_str())
    .bind(new.storage_key)
    .bind(new.external_url)
    .bind(new.mime_type)
    .bind(new.width)
    .bind(new.height)
    .bind(new.byte_size)
    .bind(new.details.caption)
    .bind(new.details.copyright)
    .bind(new.details.license_name)
    .bind(new.details.license_url)
    .bind(new.details.weight.unwrap_or(0))
    .bind(new.uploaded_by)
    .fetch_one(db)
    .await?;
    Ok(row_to_media(&row))
}

/// Hand the caller's own media to a note they just posted, in the order
/// given. Items already spoken for, or belonging to someone else, are left
/// alone - a note cannot adopt another user's photo.
pub async fn attach_media_to_comment(
    db: &PgPool,
    comment_id: i64,
    media_ids: &[i64],
    user_id: &str,
) -> Result<(), sqlx::Error> {
    if media_ids.is_empty() {
        return Ok(());
    }
    for (position, id) in media_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE media SET comment_id = $1, weight = $2
             WHERE id = $3 AND uploaded_by = $4 AND comment_id IS NULL",
        )
        .bind(comment_id)
        .bind(position as i32)
        .bind(id)
        .bind(user_id)
        .execute(db)
        .await?;
    }
    Ok(())
}

/// Delete media the caller owns (admins may delete any). Returns the storage
/// key, if any, so the files can be removed once the row is gone.
pub async fn delete_media(
    db: &PgPool,
    id: MediaId,
    user_id: &str,
    is_admin: bool,
) -> Result<Option<Option<String>>, sqlx::Error> {
    let row = sqlx::query(
        "DELETE FROM media
         WHERE id = $1 AND ($2 OR uploaded_by = $3)
         RETURNING storage_key",
    )
    .bind(id)
    .bind(is_admin)
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    Ok(row.map(|row| row.get("storage_key")))
}

/// Storage keys of the files a comment owns, for cleanup before it is
/// deleted (the rows themselves cascade).
pub async fn storage_keys_for_comment(
    db: &PgPool,
    comment_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT storage_key FROM media WHERE comment_id = $1 AND storage_key IS NOT NULL",
    )
    .bind(comment_id)
    .fetch_all(db)
    .await?;
    Ok(rows.iter().map(|row| row.get("storage_key")).collect())
}
