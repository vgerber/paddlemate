//! Mirrored product photos: what the API shows, what the mirror job works
//! through, and the admin takedown.

use sqlx::{PgPool, Row};

use crate::{
    media,
    models::material::{Material, MaterialId, MaterialImage},
};

/// Tries a transient failure (timeout, 5xx) gets before the row is failed.
pub const MAX_ATTEMPTS: i32 = 3;

/// Fill in the fetched images of every material in one query.
pub async fn attach(pool: &PgPool, materials: &mut [Material]) -> Result<(), sqlx::Error> {
    if materials.is_empty() {
        return Ok(());
    }
    let ids: Vec<MaterialId> = materials.iter().map(|m| m.id).collect();
    let rows = sqlx::query(
        "SELECT id, material_id, file, page_url, credit FROM material_images \
         WHERE material_id = ANY($1) AND status = 'fetched' ORDER BY id",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;
    for row in rows {
        let material_id: MaterialId = row.try_get("material_id")?;
        let file: String = row.try_get("file")?;
        let Some(material) = materials.iter_mut().find(|m| m.id == material_id) else {
            continue;
        };
        material.images.push(MaterialImage {
            id: row.try_get("id")?,
            url: media::url_for(&file),
            thumb_url: media::url_for(&media::thumb_key(&file)),
            page_url: row.try_get("page_url")?,
            credit: row.try_get("credit")?,
        });
    }
    Ok(())
}

/// A pending image the job is about to fetch.
#[derive(Debug, Clone)]
pub struct PendingImage {
    pub id: i64,
    pub source_url: String,
    pub host: String,
}

/// The hosts the job may contact: those of the seeded links.
pub async fn allowed_hosts(pool: &PgPool) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT DISTINCT host FROM material_images")
        .fetch_all(pool)
        .await
}

/// The next pending image of each host that is not on cooldown, at most
/// `limit` hosts. One per host keeps a round to one request per host.
pub async fn next_round(pool: &PgPool, limit: i64) -> Result<Vec<PendingImage>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, source_url, host FROM ( \
             SELECT DISTINCT ON (i.host) i.id, i.source_url, i.host FROM material_images i \
             WHERE i.status = 'pending' AND i.attempts < $2 \
               AND NOT EXISTS (SELECT 1 FROM material_image_hosts h \
                               WHERE h.host = i.host AND h.blocked_until > NOW()) \
             ORDER BY i.host, i.attempts, i.id \
         ) one_per_host ORDER BY id LIMIT $1",
    )
    .bind(limit)
    .bind(MAX_ATTEMPTS)
    .fetch_all(pool)
    .await?;
    rows.iter()
        .map(|row| {
            Ok(PendingImage {
                id: row.try_get("id")?,
                source_url: row.try_get("source_url")?,
                host: row.try_get("host")?,
            })
        })
        .collect()
}

/// Record the stored file. False when the row stopped being pending meanwhile
/// (a takedown), in which case the caller deletes the file again.
pub async fn mark_fetched(pool: &PgPool, id: i64, file: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE material_images SET status = 'fetched', file = $2, fetched_at = NOW(), \
         error = NULL, attempts = attempts + 1 WHERE id = $1 AND status = 'pending'",
    )
    .bind(id)
    .bind(file)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// Record a failed try. A permanent failure ends the row; a transient one
/// leaves it pending until it runs out of attempts.
pub async fn mark_failed(
    pool: &PgPool,
    id: i64,
    error: &str,
    permanent: bool,
) -> Result<(), sqlx::Error> {
    let error: String = error.chars().take(500).collect();
    sqlx::query(
        "UPDATE material_images SET attempts = attempts + 1, error = $2, \
         status = CASE WHEN $3 OR attempts + 1 >= $4 THEN 'failed'::material_image_status \
                       ELSE status END \
         WHERE id = $1 AND status = 'pending'",
    )
    .bind(id)
    .bind(error)
    .bind(permanent)
    .bind(MAX_ATTEMPTS)
    .execute(pool)
    .await?;
    Ok(())
}

/// Keep the job away from a host for 24 hours.
pub async fn block_host(pool: &PgPool, host: &str, reason: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO material_image_hosts (host, blocked_until, reason) \
         VALUES ($1, NOW() + INTERVAL '24 hours', $2) \
         ON CONFLICT (host) DO UPDATE SET blocked_until = EXCLUDED.blocked_until, \
         reason = EXCLUDED.reason",
    )
    .bind(host)
    .bind(reason)
    .execute(pool)
    .await?;
    Ok(())
}

/// Take one image down. The image is looked up inside its entry. Returns
/// None when there is no such live image, else the stored file to delete.
pub async fn remove_one(
    pool: &PgPool,
    material_id: MaterialId,
    image_id: i64,
) -> Result<Option<Option<String>>, sqlx::Error> {
    let row = sqlx::query(
        "WITH old AS ( \
             SELECT id, file FROM material_images \
             WHERE id = $1 AND material_id = $2 AND status <> 'removed' FOR UPDATE) \
         UPDATE material_images i SET status = 'removed', file = NULL FROM old \
         WHERE i.id = old.id RETURNING old.file",
    )
    .bind(image_id)
    .bind(material_id)
    .fetch_optional(pool)
    .await?;
    row.map(|row| row.try_get("file")).transpose()
}

/// Take down every image of a brand (case-insensitive). Returns how many
/// rows were removed and the files to delete.
pub async fn remove_brand(pool: &PgPool, brand: &str) -> Result<(i64, Vec<String>), sqlx::Error> {
    let rows = sqlx::query(
        "WITH old AS ( \
             SELECT i.id, i.file FROM material_images i \
             JOIN materials m ON m.id = i.material_id \
             WHERE lower(btrim(m.brand)) = lower(btrim($1)) AND i.status <> 'removed' \
             FOR UPDATE OF i) \
         UPDATE material_images i SET status = 'removed', file = NULL FROM old \
         WHERE i.id = old.id RETURNING old.file",
    )
    .bind(brand)
    .fetch_all(pool)
    .await?;
    let files: Vec<String> = rows
        .iter()
        .filter_map(|row| row.try_get::<Option<String>, _>("file").ok().flatten())
        .collect();
    Ok((rows.len() as i64, files))
}
