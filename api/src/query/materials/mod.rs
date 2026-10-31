use sqlx::{PgPool, QueryBuilder, Row, postgres::PgRow};

pub mod images;
pub mod models;

use super::FUZZY_MIN_CHARS;
use super::util::escape_like;
use crate::models::material::{
    Material, MaterialBody, MaterialBrand, MaterialCategory, MaterialFilters, MaterialId,
    MaterialSibling, MaterialSort,
};

/// The model key of an entry, folded the way the unique index folds it.
const MODEL_KEY: &str = "(lower(btrim(m.brand)), lower(btrim(m.model)), \
     lower(btrim(COALESCE(m.variant, ''))))";
const MODEL_KEY_OF: &str =
    "SELECT lower(btrim($2)), lower(btrim($3)), lower(btrim(COALESCE($4, '')))";

/// Orders the sizes of a model: XS to XL, then by number, then the rest.
pub(super) const SIZE_ORDER: &str = "COALESCE(array_position(ARRAY['XS','S','S/M','M','M/L','L','XL'], m.size), \
     CASE WHEN m.size IS NULL THEN 0 ELSE 100 END), \
     CASE WHEN m.size ~ '^[0-9]{1,6}(\\.[0-9]{1,6})?$' THEN m.size::numeric END, m.size";

/// New entries one user may add per day. Edits are not counted: correcting
/// the wiki is the point, and the write rate limit bounds them.
pub const MAX_NEW_PER_DAY: i64 = 30;

/// How many entries one comparison can ask for. Four columns is what a
/// desktop table shows without scrolling sideways; the cap is generous
/// enough that a client can hold a few more in its tray.
pub const MAX_COMPARE_IDS: usize = 8;

const MATERIAL_COLS: &str = "m.id, m.category, m.brand, m.model, m.variant, m.size, m.discipline, \
     m.construction, m.description, m.year_from, m.year_to, m.length_cm, m.width_cm, \
     m.height_cm, m.volume_l, m.weight_kg, m.cockpit_length_cm, m.cockpit_width_cm, \
     m.paddler_weight_min_kg, m.paddler_weight_max_kg, m.product_url, m.colors, \
     m.year_approximate, m.sources, m.notes, m.blade_area_cm2, m.blade_length_cm, \
     m.blade_width_cm, m.length_min_cm, m.length_max_cm, m.lengths_cm, m.pieces, m.shaft, \
     m.shaft_material, m.blade_material, m.feather_deg, m.shaft_diameter, m.created_by, \
     m.created_at, m.updated_at, \
     cu.username AS created_by_username, uu.username AS updated_by_username";

const MATERIAL_FROM: &str = " FROM materials m \
     LEFT JOIN users cu ON cu.id = m.created_by \
     LEFT JOIN users uu ON uu.id = m.updated_by";

/// The indexed expression the name search runs on. Written exactly as in the
/// index of migration 0055 so the planner can use it.
const NAME_KEY: &str = "public.search_key(m.brand || ' ' || m.model)";

fn row_to_material(row: &PgRow) -> Result<Material, sqlx::Error> {
    Ok(Material {
        id: row.try_get("id")?,
        category: row.try_get("category")?,
        brand: row.try_get("brand")?,
        model: row.try_get("model")?,
        variant: row.try_get("variant")?,
        size: row.try_get("size")?,
        discipline: row.try_get("discipline")?,
        construction: row.try_get("construction")?,
        description: row.try_get("description")?,
        year_from: row.try_get("year_from")?,
        year_to: row.try_get("year_to")?,
        length_cm: row.try_get("length_cm")?,
        width_cm: row.try_get("width_cm")?,
        height_cm: row.try_get("height_cm")?,
        volume_l: row.try_get("volume_l")?,
        weight_kg: row.try_get("weight_kg")?,
        cockpit_length_cm: row.try_get("cockpit_length_cm")?,
        cockpit_width_cm: row.try_get("cockpit_width_cm")?,
        paddler_weight_min_kg: row.try_get("paddler_weight_min_kg")?,
        paddler_weight_max_kg: row.try_get("paddler_weight_max_kg")?,
        product_url: row.try_get("product_url")?,
        colors: row.try_get("colors")?,
        year_approximate: row.try_get("year_approximate")?,
        sources: row.try_get("sources")?,
        notes: row.try_get("notes")?,
        blade_area_cm2: row.try_get("blade_area_cm2")?,
        blade_length_cm: row.try_get("blade_length_cm")?,
        blade_width_cm: row.try_get("blade_width_cm")?,
        length_min_cm: row.try_get("length_min_cm")?,
        length_max_cm: row.try_get("length_max_cm")?,
        lengths_cm: row.try_get("lengths_cm")?,
        pieces: row.try_get("pieces")?,
        shaft: row.try_get("shaft")?,
        shaft_material: row.try_get("shaft_material")?,
        blade_material: row.try_get("blade_material")?,
        feather_deg: row.try_get("feather_deg")?,
        shaft_diameter: row.try_get("shaft_diameter")?,
        images: Vec::new(),
        siblings: Vec::new(),
        created_by: row.try_get("created_by")?,
        created_by_username: row.try_get("created_by_username")?,
        updated_by_username: row.try_get("updated_by_username")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// The measurement column a sort reads, or None for the sorts that do not
/// order by a measurement.
fn sort_column(sort: MaterialSort) -> Option<&'static str> {
    match sort {
        MaterialSort::Length => Some("m.length_cm"),
        MaterialSort::Volume => Some("m.volume_l"),
        MaterialSort::Weight => Some("m.weight_kg"),
        MaterialSort::Name | MaterialSort::Newest => None,
    }
}

pub(super) fn push_filters(qb: &mut QueryBuilder<'_, sqlx::Postgres>, filters: &MaterialFilters) {
    if let Some(category) = filters.category {
        qb.push(" AND m.category = ");
        qb.push_bind(category);
    }
    if let Some(discipline) = filters.discipline {
        qb.push(" AND m.discipline = ");
        qb.push_bind(discipline);
    }
    if let Some(construction) = filters.construction {
        qb.push(" AND m.construction = ");
        qb.push_bind(construction);
    }
    if let Some(brand) = filters
        .brand
        .as_deref()
        .map(str::trim)
        .filter(|b| !b.is_empty())
    {
        qb.push(" AND lower(btrim(m.brand)) = ");
        qb.push_bind(brand.to_lowercase());
    }

    let bounds: [(&str, Option<f64>, bool); 6] = [
        ("m.length_cm", filters.min_length_cm, true),
        ("m.length_cm", filters.max_length_cm, false),
        ("m.volume_l", filters.min_volume_l, true),
        ("m.volume_l", filters.max_volume_l, false),
        ("m.weight_kg", filters.min_weight_kg, true),
        ("m.weight_kg", filters.max_weight_kg, false),
    ];
    for (column, value, is_min) in bounds {
        let Some(value) = value else { continue };
        qb.push(" AND ");
        qb.push(column);
        qb.push(if is_min { " >= " } else { " <= " });
        qb.push_bind(value);
    }

    // An entry that states no paddler range is kept: silence is not a
    // statement that the boat does not fit.
    if let Some(weight) = filters.fits_paddler_kg {
        qb.push(" AND (m.paddler_weight_min_kg IS NULL OR m.paddler_weight_min_kg <= ");
        qb.push_bind(weight);
        qb.push(") AND (m.paddler_weight_max_kg IS NULL OR m.paddler_weight_max_kg >= ");
        qb.push_bind(weight);
        qb.push(")");
    }
}

/// How well the name matches the search text: exact 0, prefix 1, substring 2,
/// approximate 3.
pub(super) fn push_tier(qb: &mut QueryBuilder<'_, sqlx::Postgres>, q: &str) {
    let pattern = escape_like(q);
    qb.push("CASE WHEN ");
    qb.push(NAME_KEY);
    qb.push(" = public.search_key(");
    qb.push_bind(q.to_string());
    qb.push(") THEN 0 WHEN ");
    qb.push(NAME_KEY);
    qb.push(" LIKE public.search_key(");
    qb.push_bind(pattern.clone());
    qb.push(") || '%' THEN 1 WHEN ");
    qb.push(NAME_KEY);
    qb.push(" LIKE '%' || public.search_key(");
    qb.push_bind(pattern);
    qb.push(") || '%' THEN 2 ELSE 3 END");
}

pub(super) fn push_score(qb: &mut QueryBuilder<'_, sqlx::Postgres>, q: &str) {
    qb.push("word_similarity(public.search_key(");
    qb.push_bind(q.to_string());
    qb.push("), ");
    qb.push(NAME_KEY);
    qb.push(")");
}

/// The WHERE clause of a name search: a substring match, plus an approximate
/// one for texts long enough to tolerate a typo.
pub(super) fn push_name_match(qb: &mut QueryBuilder<'_, sqlx::Postgres>, q: &str) {
    let pattern = escape_like(q);
    qb.push(" AND (");
    qb.push(NAME_KEY);
    qb.push(" LIKE '%' || public.search_key(");
    qb.push_bind(pattern);
    qb.push(") || '%'");
    if q.chars().count() >= FUZZY_MIN_CHARS {
        // The indexed expression stays on the left of %> so the gate and
        // the score cannot disagree about what is similar.
        qb.push(" OR ");
        qb.push(NAME_KEY);
        qb.push(" %> public.search_key(");
        qb.push_bind(q.to_string());
        qb.push(")");
    }
    qb.push(")");
}

/// Search the wiki, matching brand and model. Returns the page of entries and
/// the total number of matches. The caller bounds the text and the paging.
///
/// With a query text and the default name sort the order is relevance: an
/// exact name beats a prefix, which beats a substring, which beats an
/// approximate match. Asking for a measurement sort overrides that.
pub async fn search(
    pool: &PgPool,
    filters: &MaterialFilters,
    page: i64,
    per_page: i64,
) -> Result<(Vec<Material>, i64), sqlx::Error> {
    let offset = (page - 1) * per_page;
    let q = filters
        .q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new("SELECT ");
    qb.push(MATERIAL_COLS);

    if let Some(q) = q {
        qb.push(", ");
        push_tier(&mut qb, q);
        qb.push(" AS tier, ");
        push_score(&mut qb, q);
        qb.push(" AS score");
    }

    qb.push(", COUNT(*) OVER () AS total_count");
    qb.push(MATERIAL_FROM);
    qb.push(" WHERE 1=1");

    if let Some(q) = q {
        push_name_match(&mut qb, q);
    }

    push_filters(&mut qb, filters);

    qb.push(" ORDER BY ");
    match sort_column(filters.sort) {
        // NULLS LAST either way: an entry that does not state the measurement
        // cannot be placed among the ones that do.
        Some(column) => {
            qb.push(column);
            qb.push(" ASC NULLS LAST, m.brand, m.model");
        }
        None if filters.sort == MaterialSort::Newest => {
            qb.push("m.created_at DESC, m.id DESC");
        }
        None if q.is_some() => {
            qb.push("tier, score DESC, m.brand, m.model");
        }
        None => {
            qb.push("m.brand, m.model, m.variant NULLS FIRST");
        }
    }

    qb.push(" LIMIT ");
    qb.push_bind(per_page);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let rows = qb.build().fetch_all(pool).await?;
    let total = rows
        .first()
        .and_then(|row| row.try_get::<i64, _>("total_count").ok())
        .unwrap_or(0);
    let mut items = rows
        .iter()
        .map(row_to_material)
        .collect::<Result<Vec<_>, _>>()?;
    images::attach(pool, &mut items).await?;
    Ok((items, total))
}

pub async fn fetch(pool: &PgPool, id: MaterialId) -> Result<Option<Material>, sqlx::Error> {
    let sql = format!("SELECT {MATERIAL_COLS}{MATERIAL_FROM} WHERE m.id = $1");
    let row = sqlx::query(&sql).bind(id).fetch_optional(pool).await?;
    let Some(mut material) = row.as_ref().map(row_to_material).transpose()? else {
        return Ok(None);
    };
    images::attach(pool, std::slice::from_mut(&mut material)).await?;
    material.siblings = siblings(pool, &material).await?;
    Ok(Some(material))
}

/// The other sizes of an entry's model, found by the model key in SQL.
async fn siblings(pool: &PgPool, of: &Material) -> Result<Vec<MaterialSibling>, sqlx::Error> {
    let sql = format!(
        "SELECT m.id, m.size FROM materials m \
         WHERE m.category = $1 AND {MODEL_KEY} = ({MODEL_KEY_OF}) AND m.id <> $5 \
         ORDER BY {SIZE_ORDER}, m.id"
    );
    let rows = sqlx::query(&sql)
        .bind(of.category)
        .bind(of.brand.as_str())
        .bind(of.model.as_str())
        .bind(of.variant.as_deref())
        .bind(of.id)
        .fetch_all(pool)
        .await?;
    rows.iter()
        .map(|row| {
            Ok(MaterialSibling {
                id: row.try_get("id")?,
                size: row.try_get("size")?,
            })
        })
        .collect()
}

/// Several entries at once, returned in the order the ids were given - the
/// comparison's columns are the caller's, not the database's.
pub async fn fetch_many(pool: &PgPool, ids: &[MaterialId]) -> Result<Vec<Material>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!("SELECT {MATERIAL_COLS}{MATERIAL_FROM} WHERE m.id = ANY($1)");
    let rows = sqlx::query(&sql).bind(ids).fetch_all(pool).await?;
    let mut found = rows
        .iter()
        .map(row_to_material)
        .collect::<Result<Vec<_>, _>>()?;
    images::attach(pool, &mut found).await?;
    Ok(ids
        .iter()
        .filter_map(|id| found.iter().find(|m| m.id == *id).cloned())
        .collect())
}

/// Every brand in the wiki with its entry count, most entries first. Feeds
/// the brand filter, which is why it narrows by category the same way the
/// list does.
pub async fn list_brands(
    pool: &PgPool,
    category: Option<MaterialCategory>,
) -> Result<Vec<MaterialBrand>, sqlx::Error> {
    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        "SELECT btrim(brand) AS brand, COUNT(*) AS count FROM materials WHERE 1=1",
    );
    if let Some(category) = category {
        qb.push(" AND category = ");
        qb.push_bind(category);
    }
    qb.push(" GROUP BY btrim(brand) ORDER BY count DESC, brand");

    let rows = qb.build().fetch_all(pool).await?;
    rows.iter()
        .map(|row| {
            Ok(MaterialBrand {
                brand: row.try_get("brand")?,
                count: row.try_get("count")?,
            })
        })
        .collect()
}

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
        .bind(body.discipline)
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

    let query = sqlx::query(
        "INSERT INTO materials (category, brand, model, variant, size, discipline, construction, \
         description, year_from, year_to, length_cm, width_cm, height_cm, volume_l, weight_kg, \
         cockpit_length_cm, cockpit_width_cm, paddler_weight_min_kg, paddler_weight_max_kg, \
         product_url, colors, year_approximate, notes, blade_area_cm2, blade_length_cm, \
         blade_width_cm, length_min_cm, length_max_cm, lengths_cm, pieces, shaft, \
         shaft_material, blade_material, feather_deg, shaft_diameter, created_by) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, \
         $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, \
         $35, $36) RETURNING id",
    );
    let row = bind_body(query, body)
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row.try_get("id")?)
}

/// Replace an entry. Returns false when there is no such entry.
pub async fn update(
    pool: &PgPool,
    id: MaterialId,
    body: &MaterialBody,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let query = sqlx::query(
        "UPDATE materials SET category = $1, brand = $2, model = $3, variant = $4, size = $5, \
         discipline = $6, construction = $7, description = $8, year_from = $9, year_to = $10, \
         length_cm = $11, width_cm = $12, height_cm = $13, volume_l = $14, weight_kg = $15, \
         cockpit_length_cm = $16, cockpit_width_cm = $17, paddler_weight_min_kg = $18, \
         paddler_weight_max_kg = $19, product_url = $20, colors = $21, year_approximate = $22, \
         notes = $23, blade_area_cm2 = $24, blade_length_cm = $25, blade_width_cm = $26, \
         length_min_cm = $27, length_max_cm = $28, lengths_cm = $29, pieces = $30, shaft = $31, \
         shaft_material = $32, blade_material = $33, feather_deg = $34, shaft_diameter = $35, \
         updated_by = $36, updated_at = NOW() \
         WHERE id = $37",
    );
    let result = bind_body(query, body)
        .bind(user_id)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn delete(pool: &PgPool, id: MaterialId) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM materials WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
