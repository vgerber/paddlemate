//! Photos paddlers upload to the wiki: the caps, the row, and the review
//! steps. An admin's photo is live at once; anyone else's waits in status
//! `review` with a proposal beside it, and is deleted if the proposal is
//! rejected or withdrawn.

use sqlx::{PgConnection, PgPool, Row};

use crate::{
    media::{self, StoredImage},
    models::material::{MaterialId, MaterialImage},
};

/// Photos one user may upload in a day, whatever became of them.
pub const MAX_PER_DAY: i64 = 10;
/// Photos one non-admin may have waiting for review at once.
pub const MAX_PENDING: i64 = 5;
/// Uploaded photos (live or waiting) one model may hold.
pub const MAX_PER_MODEL: i64 = 6;
/// Longest credit line, in characters.
pub const MAX_CREDIT_CHARS: usize = 80;

/// Why an upload was not stored.
#[derive(Debug)]
pub enum UploadError {
    /// A cap was hit; the message says which.
    OverLimit(String),
    /// The entry does not exist.
    Gone,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for UploadError {
    fn from(err: sqlx::Error) -> Self {
        UploadError::Db(err)
    }
}

/// The user's name, which is the default credit.
pub async fn username(pool: &PgPool, user_id: &str) -> Result<String, sqlx::Error> {
    let name: Option<String> = sqlx::query_scalar("SELECT username FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(name.unwrap_or_else(|| "paddler".to_string()))
}

/// Check the entry exists and the caps hold. With `lock` the user and the
/// model are locked first (inside a transaction), so parallel uploads cannot
/// both pass; without it the check is a cheap early refusal.
pub async fn check_in(
    conn: &mut PgConnection,
    material_id: MaterialId,
    user_id: &str,
    admin: bool,
    lock: bool,
) -> Result<(), UploadError> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM materials WHERE id = $1)")
        .bind(material_id)
        .fetch_one(&mut *conn)
        .await?;
    if !exists {
        return Err(UploadError::Gone);
    }
    if lock {
        // User first, then model: one order everywhere.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext('material-photos:' || $1))")
            .bind(user_id)
            .execute(&mut *conn)
            .await?;
        sqlx::query(
            "SELECT pg_advisory_xact_lock(hashtext('material-photos-model:' || \
             t.category::text || lower(btrim(t.brand)) || '|' || lower(btrim(t.model)) || '|' || \
             lower(btrim(COALESCE(t.variant, ''))))) FROM materials t WHERE t.id = $1",
        )
        .bind(material_id)
        .execute(&mut *conn)
        .await?;
    }
    let (day, pending): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day'), \
                COUNT(*) FILTER (WHERE status = 'review') \
         FROM material_images WHERE source_kind = 'user' AND uploaded_by = $1",
    )
    .bind(user_id)
    .fetch_one(&mut *conn)
    .await?;
    if day >= MAX_PER_DAY {
        return Err(UploadError::OverLimit(format!(
            "At most {MAX_PER_DAY} photos per day"
        )));
    }
    if !admin && pending >= MAX_PENDING {
        return Err(UploadError::OverLimit(format!(
            "At most {MAX_PENDING} photos waiting for review"
        )));
    }
    let on_model: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM material_images i JOIN materials s ON s.id = i.material_id \
         JOIN materials t ON t.id = $1 AND {} \
         WHERE i.source_kind = 'user' AND i.status IN ('fetched', 'review')",
        super::images::same_model("s", "t")
    ))
    .bind(material_id)
    .fetch_one(&mut *conn)
    .await?;
    if on_model >= MAX_PER_MODEL {
        return Err(UploadError::OverLimit(format!(
            "A model can hold at most {MAX_PER_MODEL} uploaded photos"
        )));
    }
    Ok(())
}

/// Insert the row of a stored upload: live (`fetched`) or waiting (`review`).
/// Returns its id.
pub async fn insert_in(
    conn: &mut PgConnection,
    material_id: MaterialId,
    stored: &StoredImage,
    credit: &str,
    user_id: &str,
    live: bool,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "INSERT INTO material_images (material_id, source_url, host, page_url, credit, file, \
             status, fetched_at, source_kind, uploaded_by, rights_confirmed_at) \
         VALUES ($1, 'https://upload.invalid/' || $2, 'upload.invalid', '', $3, $2, \
             CASE WHEN $5 THEN 'fetched' ELSE 'review' END::material_image_status, \
             CASE WHEN $5 THEN NOW() END, 'user', $4, NOW()) RETURNING id",
    )
    .bind(material_id)
    .bind(&stored.storage_key)
    .bind(credit)
    .bind(user_id)
    .bind(live)
    .fetch_one(conn)
    .await
}

/// The API view of an uploaded photo.
pub fn view(id: i64, stored: &StoredImage, credit: &str) -> MaterialImage {
    MaterialImage {
        id,
        url: media::url_for(&stored.storage_key),
        thumb_url: media::url_for(&media::thumb_key(&stored.storage_key)),
        page_url: None,
        credit: credit.to_string(),
        source_kind: "user".to_string(),
    }
}

/// Add an admin's photo, live at once.
pub async fn add_live(
    pool: &PgPool,
    material_id: MaterialId,
    stored: &StoredImage,
    credit: &str,
    user_id: &str,
) -> Result<MaterialImage, UploadError> {
    let mut tx = pool.begin().await?;
    check_in(&mut tx, material_id, user_id, true, true).await?;
    let id = insert_in(&mut tx, material_id, stored, credit, user_id, true).await?;
    tx.commit().await?;
    Ok(view(id, stored, credit))
}

/// Make a photo under review live. A photo that was taken down meanwhile
/// stays gone.
pub async fn approve_in(
    conn: &mut PgConnection,
    material_id: MaterialId,
    image_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE material_images SET status = 'fetched', fetched_at = NOW() \
         WHERE id = $1 AND material_id = $2 AND status = 'review'",
    )
    .bind(image_id)
    .bind(material_id)
    .execute(conn)
    .await?;
    Ok(())
}

/// Delete a photo that is still under review (rejected or withdrawn) and
/// return its file for the caller to delete once the transaction commits.
pub async fn discard_in(
    conn: &mut PgConnection,
    material_id: Option<MaterialId>,
    image_id: i64,
) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query(
        "DELETE FROM material_images WHERE id = $1 AND status = 'review' \
         AND ($2::bigint IS NULL OR material_id = $2) RETURNING file",
    )
    .bind(image_id)
    .bind(material_id)
    .fetch_optional(conn)
    .await?;
    row.map(|r| r.try_get("file")).transpose()
}

/// The stored file of a photo the caller may preview: under review, and
/// either theirs or they are an admin.
pub async fn preview_file(
    pool: &PgPool,
    material_id: MaterialId,
    image_id: i64,
    user_id: &str,
    admin: bool,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT file FROM material_images WHERE id = $1 AND material_id = $2 \
         AND status = 'review' AND ($4 OR uploaded_by = $3)",
    )
    .bind(image_id)
    .bind(material_id)
    .bind(user_id)
    .bind(admin)
    .fetch_optional(pool)
    .await
    .map(Option::flatten)
}
