//! The browse tree: category, discipline, brand, with counts.

use sqlx::{PgPool, QueryBuilder, Row};

use super::{push_filters, push_name_match};
use crate::models::material::{
    MaterialCategory, MaterialDiscipline, MaterialFilters, MaterialTree, MaterialTreeBrand,
    MaterialTreeCategory, MaterialTreeDiscipline,
};

/// The tree of everything matching the filters. The tree's own levels
/// (category, discipline, brand) are ignored: the tree is what they pick
/// from. Models are counted as the model list counts them. The caller bounds
/// the text.
pub async fn tree(pool: &PgPool, filters: &MaterialFilters) -> Result<MaterialTree, sqlx::Error> {
    let q = filters
        .q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let rest = MaterialFilters {
        category: None,
        discipline: None,
        brand: None,
        ..clone_measures(filters)
    };

    // One pass, three levels: grouping() says which levels a row sums over.
    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        "SELECT m.category, m.discipline, lower(btrim(m.brand)) AS bk, min(m.brand) AS brand, \
         grouping(m.discipline, lower(btrim(m.brand))) AS lvl, COUNT(*) AS entries, \
         COUNT(DISTINCT (lower(btrim(m.brand)), lower(btrim(m.model)), \
         lower(btrim(COALESCE(m.variant, ''))))) AS models \
         FROM materials m WHERE 1=1",
    );
    if let Some(q) = q {
        push_name_match(&mut qb, q);
    }
    push_filters(&mut qb, &rest);
    qb.push(
        " GROUP BY GROUPING SETS ((m.category), (m.category, m.discipline), \
         (m.category, m.discipline, lower(btrim(m.brand)))) \
         ORDER BY models DESC, m.category, m.discipline, brand",
    );

    let rows = qb.build().fetch_all(pool).await?;
    let mut categories: Vec<MaterialTreeCategory> = Vec::new();
    // Rows come by models descending, so each level lands in order.
    for row in &rows {
        let lvl: i32 = row.try_get("lvl")?;
        if lvl == 3 {
            categories.push(MaterialTreeCategory {
                category: row.try_get::<MaterialCategory, _>("category")?,
                models: row.try_get("models")?,
                entries: row.try_get("entries")?,
                disciplines: Vec::new(),
            });
        }
    }
    for row in &rows {
        let lvl: i32 = row.try_get("lvl")?;
        let category: MaterialCategory = row.try_get("category")?;
        let discipline: Option<MaterialDiscipline> = row.try_get("discipline")?;
        let Some(cat) = categories.iter_mut().find(|c| c.category == category) else {
            continue;
        };
        if let (1, Some(discipline)) = (lvl, discipline) {
            cat.disciplines.push(MaterialTreeDiscipline {
                discipline,
                models: row.try_get("models")?,
                entries: row.try_get("entries")?,
                brands: Vec::new(),
            });
        }
    }
    for row in &rows {
        let lvl: i32 = row.try_get("lvl")?;
        if lvl != 0 {
            continue;
        }
        let category: MaterialCategory = row.try_get("category")?;
        let Some(discipline) = row.try_get::<Option<MaterialDiscipline>, _>("discipline")? else {
            continue;
        };
        let Some(disc) = categories
            .iter_mut()
            .find(|c| c.category == category)
            .and_then(|c| {
                c.disciplines
                    .iter_mut()
                    .find(|d| d.discipline == discipline)
            })
        else {
            continue;
        };
        disc.brands.push(MaterialTreeBrand {
            brand: row.try_get("brand")?,
            models: row.try_get("models")?,
            entries: row.try_get("entries")?,
        });
    }
    Ok(MaterialTree { categories })
}

/// The measurement filters of a request, without paging or the tree levels.
fn clone_measures(f: &MaterialFilters) -> MaterialFilters {
    MaterialFilters {
        construction: f.construction,
        min_length_cm: f.min_length_cm,
        max_length_cm: f.max_length_cm,
        min_volume_l: f.min_volume_l,
        max_volume_l: f.max_volume_l,
        min_weight_kg: f.min_weight_kg,
        max_weight_kg: f.max_weight_kg,
        fits_paddler_kg: f.fits_paddler_kg,
        ..MaterialFilters::default()
    }
}
