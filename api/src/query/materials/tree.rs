//! The browse tree: category, (use, kayaks only), discipline, brand, with counts.

use sqlx::{PgPool, QueryBuilder, Row};

use super::{push_filters, push_name_match};
use crate::models::material::{
    MaterialCategory, MaterialDiscipline, MaterialFilters, MaterialTree, MaterialTreeBrand,
    MaterialTreeCategory, MaterialTreeDiscipline, MaterialTreeUse, MaterialUse,
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
        use_: None,
        brand: None,
        ..clone_measures(filters)
    };

    // One pass, four levels: grouping() says which levels a row sums over.
    // A model in several groups appears once per group, so every count is
    // distinct: the category and use levels count it once, each group too.
    // The use of a group comes from a bound mapping, so the Rust enum is the
    // only place that knows it.
    let (groups, uses): (Vec<MaterialDiscipline>, Vec<String>) = MaterialDiscipline::ALL
        .into_iter()
        .map(|d| (d, use_key(d.use_of()).to_string()))
        .unzip();
    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        "SELECT m.category, u.use_key, d.discipline, lower(btrim(m.brand)) AS bk, \
         min(m.brand) AS brand, \
         grouping(u.use_key, d.discipline, lower(btrim(m.brand))) AS lvl, \
         COUNT(DISTINCT m.id) AS entries, \
         COUNT(DISTINCT (lower(btrim(m.brand)), lower(btrim(m.model)), \
         lower(btrim(COALESCE(m.variant, ''))))) AS models \
         FROM materials m CROSS JOIN LATERAL unnest(m.disciplines) AS d(discipline) \
         JOIN unnest(",
    );
    qb.push_bind(groups);
    qb.push("::material_discipline[], ");
    qb.push_bind(uses);
    qb.push("::text[]) AS u(discipline, use_key) ON u.discipline = d.discipline WHERE 1=1");
    if let Some(q) = q {
        push_name_match(&mut qb, q);
    }
    push_filters(&mut qb, &rest);
    qb.push(
        " GROUP BY GROUPING SETS ((m.category), (m.category, u.use_key), \
         (m.category, u.use_key, d.discipline), \
         (m.category, u.use_key, d.discipline, lower(btrim(m.brand)))) \
         ORDER BY models DESC, m.category, d.discipline, brand",
    );

    let rows = qb.build().fetch_all(pool).await?;
    let mut categories: Vec<MaterialTreeCategory> = Vec::new();
    // Rows come by models descending, so each level lands in order.
    for row in &rows {
        if row.try_get::<i32, _>("lvl")? == 7 {
            let category: MaterialCategory = row.try_get("category")?;
            categories.push(MaterialTreeCategory {
                category,
                models: row.try_get("models")?,
                entries: row.try_get("entries")?,
                disciplines: Vec::new(),
                uses: (category == MaterialCategory::Kayak).then(Vec::new),
            });
        }
    }
    for row in &rows {
        let lvl: i32 = row.try_get("lvl")?;
        let category: MaterialCategory = row.try_get("category")?;
        let Some(cat) = categories.iter_mut().find(|c| c.category == category) else {
            continue;
        };
        if lvl == 3 {
            if let (Some(uses), Some(key)) = (
                cat.uses.as_mut(),
                row.try_get::<Option<String>, _>("use_key")?,
            ) {
                if let Some(use_) = use_from_key(&key) {
                    uses.push(MaterialTreeUse {
                        use_,
                        models: row.try_get("models")?,
                        entries: row.try_get("entries")?,
                        disciplines: Vec::new(),
                    });
                }
            }
        } else if let (1, Some(discipline)) = (lvl, row.try_get("discipline")?) {
            let group = MaterialTreeDiscipline {
                discipline,
                models: row.try_get("models")?,
                entries: row.try_get("entries")?,
                brands: Vec::new(),
            };
            if cat.uses.is_none() {
                cat.disciplines.push(group);
            }
        }
    }
    // Groups of a kayak go under their use, in the order the rows came.
    for row in &rows {
        if row.try_get::<i32, _>("lvl")? != 1 {
            continue;
        }
        let category: MaterialCategory = row.try_get("category")?;
        let Some(uses) = categories
            .iter_mut()
            .find(|c| c.category == category)
            .and_then(|c| c.uses.as_mut())
        else {
            continue;
        };
        let key: Option<String> = row.try_get("use_key")?;
        let Some(use_) = key.as_deref().and_then(use_from_key) else {
            continue;
        };
        if let (Some(u), Some(discipline)) = (
            uses.iter_mut().find(|u| u.use_ == use_),
            row.try_get::<Option<MaterialDiscipline>, _>("discipline")?,
        ) {
            u.disciplines.push(MaterialTreeDiscipline {
                discipline,
                models: row.try_get("models")?,
                entries: row.try_get("entries")?,
                brands: Vec::new(),
            });
        }
    }
    for row in &rows {
        if row.try_get::<i32, _>("lvl")? != 0 {
            continue;
        }
        let category: MaterialCategory = row.try_get("category")?;
        let Some(discipline) = row.try_get::<Option<MaterialDiscipline>, _>("discipline")? else {
            continue;
        };
        let Some(cat) = categories.iter_mut().find(|c| c.category == category) else {
            continue;
        };
        let groups: Vec<&mut MaterialTreeDiscipline> = match cat.uses.as_mut() {
            Some(uses) => uses
                .iter_mut()
                .flat_map(|u| u.disciplines.iter_mut())
                .collect(),
            None => cat.disciplines.iter_mut().collect(),
        };
        if let Some(disc) = groups.into_iter().find(|d| d.discipline == discipline) {
            disc.brands.push(MaterialTreeBrand {
                brand: row.try_get("brand")?,
                models: row.try_get("models")?,
                entries: row.try_get("entries")?,
            });
        }
    }
    for cat in &mut categories {
        if let Some(uses) = cat.uses.as_mut() {
            uses.sort_by_key(|u| u.use_);
        }
    }
    Ok(MaterialTree { categories })
}

fn use_key(u: MaterialUse) -> &'static str {
    match u {
        MaterialUse::Whitewater => "whitewater",
        MaterialUse::Racing => "racing",
        MaterialUse::Touring => "touring",
        MaterialUse::Other => "other",
    }
}

fn use_from_key(key: &str) -> Option<MaterialUse> {
    [
        MaterialUse::Whitewater,
        MaterialUse::Racing,
        MaterialUse::Touring,
        MaterialUse::Other,
    ]
    .into_iter()
    .find(|u| use_key(*u) == key)
}

/// The measurement filters of a request, without paging or the tree levels.
fn clone_measures(f: &MaterialFilters) -> MaterialFilters {
    MaterialFilters {
        construction: f.construction,
        availability: f.availability,
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
