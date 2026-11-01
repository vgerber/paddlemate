//! Writes to the wiki. The admin path and the approval of a proposal share them.

use sqlx::{PgConnection, PgPool, Row};

use crate::models::material::{MaterialBody, MaterialId};

/// New entries one user may add per day. Edits are not counted: correcting
/// the wiki is the point, and the write rate limit bounds them.
pub const MAX_NEW_PER_DAY: i64 = 30;

/// Bind the writable fields in the order the INSERT and UPDATE statements
/// below list them, so the two cannot drift apart.
fn bind_body<'a>(
    query: sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments>,
    body: &'a MaterialBody,
) -> sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments> {
    query
        .bind(body.category)
        .bind(body.brand.as_str())
        .bind(body.model.as_str())
        .bind(body.variant.as_deref())
        .bind(body.size.as_deref())
        .bind(body.disciplines.as_slice())
        .bind(body.construction)
        .bind(body.description.as_deref())
        .bind(body.year_from)
        .bind(body.year_to)
        .bind(body.length_cm)
        .bind(body.width_cm)
        .bind(body.height_cm)
        .bind(body.volume_l)
        .bind(body.weight_kg)
        .bind(body.cockpit_length_cm)
        .bind(body.cockpit_width_cm)
        .bind(body.paddler_weight_min_kg)
        .bind(body.paddler_weight_max_kg)
        .bind(body.product_url.as_deref())
        .bind(body.colors.as_slice())
        .bind(body.year_approximate)
        .bind(body.notes.as_deref())
        .bind(body.blade_area_cm2)
        .bind(body.blade_length_cm)
        .bind(body.blade_width_cm)
        .bind(body.length_min_cm)
        .bind(body.length_max_cm)
        .bind(body.lengths_cm.as_deref())
        .bind(body.pieces)
        .bind(body.shaft)
        .bind(body.shaft_material)
        .bind(body.blade_material.as_deref())
        .bind(body.feather_deg.as_deref())
        .bind(body.shaft_diameter.as_deref())
        .bind(body.availability)
        .bind(body.availability_source.as_deref())
        .bind(body.availability_checked)
}

/// Why an entry could not be added.
#[derive(Debug)]
pub enum CreateError {
    /// The user already added `MAX_NEW_PER_DAY` entries in the last day.
    DailyLimit,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for CreateError {
    fn from(err: sqlx::Error) -> Self {
        CreateError::Db(err)
    }
}

/// Add an entry unless the user is over the daily cap. The count and the
/// insert run under a per-user advisory lock, so two parallel requests cannot
/// both pass the count.
pub async fn create(
    pool: &PgPool,
    body: &MaterialBody,
    user_id: &str,
) -> Result<MaterialId, CreateError> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('materials:' || $1))")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let recent: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM materials \
         WHERE created_by = $1 AND created_at > NOW() - INTERVAL '1 day'",
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    if recent >= MAX_NEW_PER_DAY {
        return Err(CreateError::DailyLimit);
    }

    let id = create_in(&mut tx, body, user_id).await?;
    tx.commit().await?;
    Ok(id)
}

/// Insert an entry with no cap check; the caller has already applied its rules.
pub async fn create_in(
    conn: &mut PgConnection,
    body: &MaterialBody,
    user_id: &str,
) -> Result<MaterialId, sqlx::Error> {
    let query = sqlx::query(
        "INSERT INTO materials (category, brand, model, variant, size, disciplines, construction, \
         description, year_from, year_to, length_cm, width_cm, height_cm, volume_l, weight_kg, \
         cockpit_length_cm, cockpit_width_cm, paddler_weight_min_kg, paddler_weight_max_kg, \
         product_url, colors, year_approximate, notes, blade_area_cm2, blade_length_cm, \
         blade_width_cm, length_min_cm, length_max_cm, lengths_cm, pieces, shaft, \
         shaft_material, blade_material, feather_deg, shaft_diameter, availability, \
         availability_source, availability_checked, created_by) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, \
         $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, \
         $35, $36, $37, $38, $39) RETURNING id",
    );
    let row = bind_body(query, body)
        .bind(user_id)
        .fetch_one(&mut *conn)
        .await?;
    row.try_get("id")
}

/// Replace an entry. Returns false when there is no such entry.
pub async fn update(
    pool: &PgPool,
    id: MaterialId,
    body: &MaterialBody,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    update_in(&mut conn, id, body, user_id).await
}

/// `update` on a connection, for the approval of a proposal.
pub async fn update_in(
    conn: &mut PgConnection,
    id: MaterialId,
    body: &MaterialBody,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let query = sqlx::query(
        "UPDATE materials SET category = $1, brand = $2, model = $3, variant = $4, size = $5, \
         disciplines = $6, construction = $7, description = $8, year_from = $9, year_to = $10, \
         length_cm = $11, width_cm = $12, height_cm = $13, volume_l = $14, weight_kg = $15, \
         cockpit_length_cm = $16, cockpit_width_cm = $17, paddler_weight_min_kg = $18, \
         paddler_weight_max_kg = $19, product_url = $20, colors = $21, year_approximate = $22, \
         notes = $23, blade_area_cm2 = $24, blade_length_cm = $25, blade_width_cm = $26, \
         length_min_cm = $27, length_max_cm = $28, lengths_cm = $29, pieces = $30, shaft = $31, \
         shaft_material = $32, blade_material = $33, feather_deg = $34, shaft_diameter = $35, \
         availability = $36, availability_source = $37, availability_checked = $38, \
         updated_by = $39, updated_at = NOW() \
         WHERE id = $40",
    );
    let result = bind_body(query, body)
        .bind(user_id)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn delete(pool: &PgPool, id: MaterialId) -> Result<bool, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    delete_in(&mut conn, id).await
}

pub async fn delete_in(conn: &mut PgConnection, id: MaterialId) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM materials WHERE id = $1")
        .bind(id)
        .execute(conn)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Whether another entry (not `except`) already has the body's category,
/// brand, model, variant and size, folded the way the unique index folds them.
pub async fn key_taken(
    pool: &PgPool,
    body: &MaterialBody,
    except: Option<MaterialId>,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM materials WHERE category = $1 \
         AND lower(btrim(brand)) = lower(btrim($2)) AND lower(btrim(model)) = lower(btrim($3)) \
         AND lower(btrim(COALESCE(variant, ''))) = lower(btrim(COALESCE($4, ''))) \
         AND lower(btrim(COALESCE(size, ''))) = lower(btrim(COALESCE($5, ''))) \
         AND ($6::bigint IS NULL OR id <> $6))",
    )
    .bind(body.category)
    .bind(body.brand.as_str())
    .bind(body.model.as_str())
    .bind(body.variant.as_deref())
    .bind(body.size.as_deref())
    .bind(except)
    .fetch_one(pool)
    .await
}
