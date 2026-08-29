use sqlx::{PgPool, Row, postgres::PgRow};

use crate::media::{thumb_key, url_for};
use crate::models::image::{Image, ImageEntityType, ImageId};

fn row_to_image(row: &PgRow) -> Image {
    let storage_key: String = row.get("storage_key");
    Image {
        id: row.get("id"),
        entity_type: ImageEntityType::Waterway,
        entity_id: row.get("entity_id"),
        url: url_for(&storage_key),
        thumbnail_url: url_for(&thumb_key(&storage_key)),
        mime_type: row.get("mime_type"),
        width: row.get("width"),
        height: row.get("height"),
        byte_size: row.get("byte_size"),
        caption: row.get("caption"),
        uploaded_by: row.get("uploaded_by"),
        created_at: row.get("created_at"),
    }
}

const IMAGE_COLS: &str = "id, entity_type, entity_id, storage_key, mime_type, width, height, \
                          byte_size, caption, uploaded_by, created_at";

pub async fn list_images(
    db: &PgPool,
    entity_type: ImageEntityType,
    entity_id: i64,
) -> Result<Vec<Image>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {IMAGE_COLS} FROM images
         WHERE entity_type = $1 AND entity_id = $2
         ORDER BY created_at DESC"
    ))
    .bind(entity_type.as_str())
    .bind(entity_id)
    .fetch_all(db)
    .await?;
    Ok(rows.iter().map(row_to_image).collect())
}

#[allow(clippy::too_many_arguments)]
pub async fn insert_image(
    db: &PgPool,
    entity_type: ImageEntityType,
    entity_id: i64,
    storage_key: &str,
    mime_type: &str,
    width: i32,
    height: i32,
    byte_size: i64,
    caption: Option<&str>,
    uploaded_by: &str,
) -> Result<Image, sqlx::Error> {
    let row = sqlx::query(&format!(
        "INSERT INTO images (entity_type, entity_id, storage_key, mime_type, width, height,
                             byte_size, caption, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING {IMAGE_COLS}"
    ))
    .bind(entity_type.as_str())
    .bind(entity_id)
    .bind(storage_key)
    .bind(mime_type)
    .bind(width)
    .bind(height)
    .bind(byte_size)
    .bind(caption)
    .bind(uploaded_by)
    .fetch_one(db)
    .await?;
    Ok(row_to_image(&row))
}

/// Delete an image the caller owns (admins may delete any). Returns the
/// storage key so the files can be removed once the row is gone.
pub async fn delete_image(
    db: &PgPool,
    id: ImageId,
    user_id: &str,
    is_admin: bool,
) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query(
        "DELETE FROM images
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
