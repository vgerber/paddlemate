//! The wiki as models: entries that share category, brand, model and variant
//! are the sizes of one model.

use sqlx::{PgPool, QueryBuilder, Row};

use super::{SIZE_ORDER, push_filters, push_name_match, push_score, push_tier};
use crate::{
    media,
    models::material::{MaterialFilters, MaterialModel, MaterialSort, ModelSize},
};

/// One page of models matching the filters and the total number of matching
/// models. Each model lists only the sizes that match. The caller bounds the
/// text and the paging.
pub async fn list(
    pool: &PgPool,
    filters: &MaterialFilters,
    page: i64,
    per_page: i64,
) -> Result<(Vec<MaterialModel>, i64), sqlx::Error> {
    let q = filters
        .q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        "WITH g AS (SELECT m.category, lower(btrim(m.brand)) AS bk, lower(btrim(m.model)) AS mk, \
         lower(btrim(COALESCE(m.variant, ''))) AS vk, min(m.brand) AS brand, min(m.model) AS model, \
         array_agg(m.id) AS ids, ",
    );
    // The model's rank under the chosen sort, as one sortable column.
    let by_relevance = q.is_some() && filters.sort == MaterialSort::Name;
    match (filters.sort, q) {
        (MaterialSort::Length, _) => qb.push("min(m.length_cm)::float8 AS rank"),
        (MaterialSort::Volume, _) => qb.push("min(m.volume_l)::float8 AS rank"),
        (MaterialSort::Weight, _) => qb.push("min(m.weight_kg)::float8 AS rank"),
        (MaterialSort::Newest, _) => qb.push("extract(epoch FROM max(m.created_at)) AS rank"),
        (MaterialSort::Name, Some(q)) => {
            qb.push("min(");
            push_tier(&mut qb, q);
            qb.push(")::float8 - max(");
            push_score(&mut qb, q);
            qb.push(")::float8 / 2 AS rank");
            &mut qb
        }
        (MaterialSort::Name, None) => qb.push("0::float8 AS rank"),
    };
    qb.push(" FROM materials m WHERE 1=1");
    if let Some(q) = q {
        push_name_match(&mut qb, q);
    }
    push_filters(&mut qb, filters);
    qb.push(
        " GROUP BY 1, 2, 3, 4), pg AS (SELECT g.*, COUNT(*) OVER () AS total_count, \
         row_number() OVER (ORDER BY ",
    );
    let order = match filters.sort {
        MaterialSort::Newest => "g.rank DESC, g.vk, g.brand, g.model",
        _ if by_relevance => "g.rank, g.brand, g.model, g.vk",
        MaterialSort::Name => "g.brand, g.model, g.vk",
        _ => "g.rank ASC NULLS LAST, g.brand, g.model, g.vk",
    };
    qb.push(order);
    qb.push(") AS pos FROM g ORDER BY pos LIMIT ");
    qb.push_bind(per_page);
    qb.push(" OFFSET ");
    qb.push_bind((page - 1) * per_page);
    qb.push(
        ") SELECT pg.pos, pg.total_count, m.id, m.category, m.brand, m.model, m.variant, \
         m.size, m.discipline, m.construction, m.year_from, m.year_to, m.year_approximate, \
         m.length_cm, m.weight_kg, m.volume_l, m.paddler_weight_min_kg, \
         m.paddler_weight_max_kg, m.lengths_cm, \
         (SELECT i.file FROM material_images i WHERE i.material_id = ANY(pg.ids) \
          AND i.status = 'fetched' ORDER BY i.id LIMIT 1) AS thumb_file \
         FROM pg JOIN materials m ON m.id = ANY(pg.ids) ORDER BY pg.pos, ",
    );
    qb.push(SIZE_ORDER);
    qb.push(", m.id");

    let rows = qb.build().fetch_all(pool).await?;
    let total = rows
        .first()
        .and_then(|row| row.try_get::<i64, _>("total_count").ok())
        .unwrap_or(0);

    let mut models: Vec<MaterialModel> = Vec::new();
    let mut last_pos = None;
    for row in &rows {
        let pos: i64 = row.try_get("pos")?;
        let size = ModelSize {
            id: row.try_get("id")?,
            size: row.try_get("size")?,
            length_cm: row.try_get("length_cm")?,
            weight_kg: row.try_get("weight_kg")?,
            volume_l: row.try_get("volume_l")?,
            paddler_weight_min_kg: row.try_get("paddler_weight_min_kg")?,
            paddler_weight_max_kg: row.try_get("paddler_weight_max_kg")?,
            lengths_cm: row.try_get("lengths_cm")?,
        };
        if last_pos != Some(pos) {
            last_pos = Some(pos);
            let thumb: Option<String> = row.try_get("thumb_file")?;
            models.push(MaterialModel {
                category: row.try_get("category")?,
                brand: row.try_get("brand")?,
                model: row.try_get("model")?,
                variant: row.try_get("variant")?,
                discipline: None,
                construction: None,
                year_from: None,
                year_to: None,
                year_approximate: false,
                thumb_url: thumb.map(|file| media::url_for(&media::thumb_key(&file))),
                sizes: Vec::new(),
            });
        }
        let Some(model) = models.last_mut() else {
            continue;
        };
        // The sizes of a model share its description; fill each gap from the
        // first size that states it. The years span all sizes.
        model.discipline = model.discipline.or(row.try_get("discipline")?);
        model.construction = model.construction.or(row.try_get("construction")?);
        let from: Option<i32> = row.try_get("year_from")?;
        model.year_from = match (model.year_from, from) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (a, b) => a.or(b),
        };
        let to: Option<i32> = row.try_get("year_to")?;
        model.year_to = match (model.year_to, to) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (a, b) => a.or(b),
        };
        model.year_approximate |= row.try_get::<bool, _>("year_approximate")?;
        model.sizes.push(size);
    }
    Ok((models, total))
}
