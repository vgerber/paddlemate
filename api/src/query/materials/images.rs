//! Mirrored product photos: what the API shows, what the mirror job works
//! through, and the admin takedown.

use sqlx::{PgPool, Row};

use crate::{
    media,
    models::material::{Material, MaterialId, MaterialImage},
};

/// Tries a transient failure (timeout, 5xx) gets before the row is failed.
pub const MAX_ATTEMPTS: i32 = 3;

/// SQL that holds when entries `a` and `b` are sizes of one model, folded the
/// way the unique index folds the key.
pub(super) fn same_model(a: &str, b: &str) -> String {
    let key = |t: &str| {
        format!(
            "(lower(btrim({t}.brand)), lower(btrim({t}.model)), \
             lower(btrim(COALESCE({t}.variant, ''))))"
        )
    };
    format!("{a}.category = {b}.category AND {} = {}", key(a), key(b))
}

/// Fill in the fetched images of every material in one query. A mirrored
/// photo belongs to its own entry; an uploaded one shows on every size of its
/// model, because the paddler photographed the boat, not one size of it.
pub async fn attach(pool: &PgPool, materials: &mut [Material]) -> Result<(), sqlx::Error> {
    if materials.is_empty() {
        return Ok(());
    }
    let ids: Vec<MaterialId> = materials.iter().map(|m| m.id).collect();
    let sql = format!(
        "SELECT m.id AS target, i.id, i.file, i.page_url, i.credit, i.source_kind \
         FROM materials m JOIN material_images i ON i.status = 'fetched' AND ( \
             i.material_id = m.id OR (i.source_kind = 'user' AND EXISTS ( \
                 SELECT 1 FROM materials s WHERE s.id = i.material_id AND {}))) \
         WHERE m.id = ANY($1) ORDER BY i.id",
        same_model("s", "m")
    );
    let rows = sqlx::query(&sql).bind(&ids).fetch_all(pool).await?;
    for row in rows {
        let target: MaterialId = row.try_get("target")?;
        let file: String = row.try_get("file")?;
        let Some(material) = materials.iter_mut().find(|m| m.id == target) else {
            continue;
        };
        let page_url: String = row.try_get("page_url")?;
        material.images.push(MaterialImage {
            id: row.try_get("id")?,
            url: media::url_for(&file),
            thumb_url: media::url_for(&media::thumb_key(&file)),
            page_url: (!page_url.is_empty()).then_some(page_url),
            credit: row.try_get("credit")?,
            source_kind: row.try_get("source_kind")?,
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

/// The hosts the job may contact: those of the seeded links. A host whose
/// links were all taken down drops out.
pub async fn allowed_hosts(pool: &PgPool) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT DISTINCT host FROM material_images \
         WHERE source_kind <> 'user' AND status <> 'removed'",
    )
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

/// Take one image down. The image is looked up inside its entry (or, for an
/// uploaded photo, inside the entry's model, since it shows on every size).
/// Returns None when there is no such live image, else the stored file to
/// delete.
pub async fn remove_one(
    pool: &PgPool,
    material_id: MaterialId,
    image_id: i64,
) -> Result<Option<Option<String>>, sqlx::Error> {
    let sql = format!(
        "WITH old AS ( \
             SELECT id, file FROM material_images \
             WHERE id = $1 AND status <> 'removed' AND (material_id = $2 OR ( \
                 source_kind = 'user' AND material_id IN ( \
                     SELECT s.id FROM materials s JOIN materials t ON t.id = $2 \
                     AND {}))) \
             FOR UPDATE) \
         UPDATE material_images i SET status = 'removed', file = NULL FROM old \
         WHERE i.id = old.id RETURNING old.file",
        same_model("s", "t")
    );
    let row = sqlx::query(&sql)
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

/// Which fetched photos to download again.
#[derive(Debug, Default, Clone)]
pub struct RefetchFilter {
    /// Source URL path ends in .png, .webp or .gif (formats with alpha).
    pub transparent_sources: bool,
    /// Brand names of the material, case-insensitive.
    pub brands: Vec<String>,
}

impl RefetchFilter {
    pub fn is_empty(&self) -> bool {
        !self.transparent_sources && self.brands.is_empty()
    }
}

/// A fetched photo chosen for a refetch.
#[derive(Debug, sqlx::FromRow)]
pub struct RefetchRow {
    pub id: i64,
    pub file: String,
    pub source_url: String,
}

/// Fetched photos matching any part of the filter. Only `material_images`
/// rows are ever selected; an empty filter selects nothing.
pub async fn select_refetch(
    pool: &PgPool,
    filter: &RefetchFilter,
) -> Result<Vec<RefetchRow>, sqlx::Error> {
    if filter.is_empty() {
        return Ok(Vec::new());
    }
    let brands: Vec<String> = filter.brands.iter().map(|b| b.to_lowercase()).collect();
    sqlx::query_as::<_, RefetchRow>(
        "SELECT i.id, i.file, i.source_url FROM material_images i \
         JOIN materials m ON m.id = i.material_id \
         WHERE i.status = 'fetched' AND i.file IS NOT NULL AND ( \
               ($1 AND i.source_url ~* '^[^?#]*\\.(png|webp|gif)([?#].*)?$') \
            OR lower(btrim(m.brand)) = ANY($2)) \
         ORDER BY i.id",
    )
    .bind(filter.transparent_sources)
    .bind(&brands)
    .fetch_all(pool)
    .await
}

/// Mark the rows pending again and delete their files. Returns how many
/// rows were requeued; a row that stopped being fetched meanwhile is left.
pub async fn requeue(pool: &PgPool, ids: &[i64]) -> Result<usize, sqlx::Error> {
    let files: Vec<String> = sqlx::query_scalar(
        "UPDATE material_images m SET status = 'pending', file = NULL, fetched_at = NULL, \
                error = NULL, attempts = 0 \
         FROM (SELECT id, file FROM material_images \
               WHERE id = ANY($1) AND status = 'fetched' FOR UPDATE) o \
         WHERE m.id = o.id RETURNING o.file",
    )
    .bind(ids)
    .fetch_all(pool)
    .await?;
    for file in &files {
        media::delete_image(file).await;
    }
    Ok(files.len())
}
