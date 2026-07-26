use sqlx::{PgPool, QueryBuilder};

use crate::models::waterway::{MatchSource, WaterwayFilters, WaterwayListItem, WaterwayType};

/// Shortest query that may match approximately. Below this a single typo
/// leaves too few correct characters for trigram scoring to mean anything.
const FUZZY_MIN_CHARS: usize = 4;

/// Case-insensitive check whether a waterway with this name already exists.
pub async fn name_exists(pool: &PgPool, name: &str) -> Result<bool, sqlx::Error> {
    let row: (bool,) =
        sqlx::query_as("SELECT EXISTS(SELECT 1 FROM waterways WHERE lower(name) = lower($1))")
            .bind(name)
            .fetch_one(pool)
            .await?;
    Ok(row.0)
}

// Row shape of the search query. The matched_* columns are null when no name
// filter was given, in which case there is nothing to explain.
#[derive(sqlx::FromRow)]
struct SearchRow {
    id: i64,
    waterway_type: WaterwayType,
    name: String,
    description: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    matched_name: Option<String>,
    matched_source: Option<String>,
    matched_lang: Option<String>,
    matched_section_id: Option<i64>,
    matched_section_name: Option<String>,
    fuzzy: Option<bool>,
    total_count: Option<i64>,
}

impl From<SearchRow> for WaterwayListItem {
    fn from(r: SearchRow) -> Self {
        WaterwayListItem {
            id: r.id,
            waterway_type: r.waterway_type,
            name: r.name,
            description: r.description,
            created_at: r.created_at,
            updated_at: r.updated_at,
            matched_name: r.matched_name,
            matched_source: r.matched_source.as_deref().and_then(MatchSource::from_db),
            matched_lang: r.matched_lang,
            matched_section_id: r.matched_section_id,
            matched_section_name: r.matched_section_name,
            fuzzy: r.fuzzy.unwrap_or(false),
        }
    }
}

/// Escape the characters LIKE treats as wildcards, so a query containing "%"
/// searches for a literal percent sign instead of matching every row.
fn escape_like(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Search waterways, matching river names, section names and the localized
/// names of both, plus rapid names. Returns the page of results and the total
/// number of matches.
///
/// Ranking is tiered: an exact name beats a prefix, which beats a substring,
/// which beats an approximate match. Within a tier the more specific source
/// wins, so a river whose own name matched sorts above one matched through a
/// rapid.
pub async fn search(
    pool: &PgPool,
    filters: &WaterwayFilters,
    page: i64,
    per_page: i64,
) -> Result<(Vec<WaterwayListItem>, i64), sqlx::Error> {
    let offset = (page - 1) * per_page;
    let name = filters
        .name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty());

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new("");

    if let Some(name) = name {
        let pattern = escape_like(name);
        let fuzzy = name.chars().count() >= FUZZY_MIN_CHARS;

        // search_key() is immutable, so binding the query text repeatedly lets
        // the planner fold each call to a constant and use the trigram indexes.
        qb.push("WITH best AS (SELECT DISTINCT ON (n.waterway_id) n.waterway_id, n.source, n.lang_code, n.section_id, n.name AS matched_name, CASE WHEN n.name_key = public.search_key(");
        qb.push_bind(name.to_string());
        qb.push(") THEN 0 WHEN n.name_key LIKE public.search_key(");
        qb.push_bind(pattern.clone());
        qb.push(") || '%' THEN 1 WHEN n.name_key LIKE '%' || public.search_key(");
        qb.push_bind(pattern.clone());
        qb.push(") || '%' THEN 2 ELSE 3 END AS tier, CASE n.source WHEN 'waterway' THEN 0 WHEN 'section' THEN 1 WHEN 'section_name' THEN 2 ELSE 3 END AS source_rank, word_similarity(public.search_key(");
        qb.push_bind(name.to_string());
        qb.push("), n.name_key) AS score FROM searchable_names n WHERE n.name_key LIKE '%' || public.search_key(");
        qb.push_bind(pattern);
        qb.push(") || '%'");

        if fuzzy {
            // The indexed expression stays on the left of %> so that the gate
            // and the score above cannot disagree about what is similar.
            qb.push(" OR n.name_key %> public.search_key(");
            qb.push_bind(name.to_string());
            qb.push(")");
        }

        qb.push(" ORDER BY n.waterway_id, tier, source_rank, score DESC) ");
        // The section is joined so a rapid match can say which section it is
        // in - the rapid name alone does not locate it for the reader.
        qb.push(
            "SELECT w.id, w.waterway_type, w.name, w.description, w.created_at, w.updated_at, \
             b.matched_name, b.source AS matched_source, b.lang_code AS matched_lang, \
             b.section_id AS matched_section_id, matched_section.name AS matched_section_name, \
             (b.tier = 3) AS fuzzy, \
             COUNT(*) OVER () AS total_count \
             FROM waterways w JOIN best b ON b.waterway_id = w.id \
             LEFT JOIN water_sections matched_section ON matched_section.id = b.section_id WHERE 1=1",
        );
    } else {
        qb.push(
            "SELECT w.id, w.waterway_type, w.name, w.description, w.created_at, w.updated_at, \
             NULL::text AS matched_name, NULL::text AS matched_source, \
             NULL::varchar AS matched_lang, NULL::bigint AS matched_section_id, \
             NULL::varchar AS matched_section_name, \
             false AS fuzzy, COUNT(*) OVER () AS total_count \
             FROM waterways w WHERE 1=1",
        );
    }

    push_filters(&mut qb, filters);

    if name.is_some() {
        qb.push(" ORDER BY b.tier, b.source_rank, b.score DESC, w.name");
    } else {
        qb.push(" ORDER BY w.name");
    }
    qb.push(" LIMIT ");
    qb.push_bind(per_page);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let rows = qb.build_query_as::<SearchRow>().fetch_all(pool).await?;
    let total = rows.first().and_then(|r| r.total_count).unwrap_or(0);
    Ok((
        rows.into_iter().map(WaterwayListItem::from).collect(),
        total,
    ))
}

/// The non-name filters, which narrow the rivers found by name rather than
/// contributing to the match themselves.
fn push_filters(qb: &mut QueryBuilder<'_, sqlx::Postgres>, filters: &WaterwayFilters) {
    if let Some(country) = filters.country.as_deref().filter(|c| !c.is_empty()) {
        qb.push(
            " AND EXISTS (SELECT 1 FROM water_sections ws WHERE ws.waterway_id = w.id AND ws.country = ",
        );
        qb.push_bind(country.to_uppercase());
        qb.push(")");
    }

    if filters.min_difficulty.is_some() || filters.max_difficulty.is_some() {
        qb.push(
            r#" AND EXISTS (
            SELECT 1 FROM water_sections ws
            JOIN features f ON f.section_id = ws.id AND f.feature_type = 'whitewater'
            WHERE ws.waterway_id = w.id
            AND (CASE
                WHEN f.metadata->>'difficulty' ~ '^X'   THEN 10
                WHEN f.metadata->>'difficulty' ~ '^VI'  THEN 6
                WHEN f.metadata->>'difficulty' ~ '^V'   THEN 5
                WHEN f.metadata->>'difficulty' ~ '^IV'  THEN 4
                WHEN f.metadata->>'difficulty' ~ '^III' THEN 3
                WHEN f.metadata->>'difficulty' ~ '^II'  THEN 2
                WHEN f.metadata->>'difficulty' ~ '^I'   THEN 1
                ELSE NULL
            END) BETWEEN "#,
        );
        qb.push_bind(filters.min_difficulty.unwrap_or(1));
        qb.push(" AND ");
        qb.push_bind(filters.max_difficulty.unwrap_or(10));
        qb.push(")");
    }

    if let (Some(lat), Some(lon), Some(radius_km)) = (filters.lat, filters.lon, filters.radius_km) {
        qb.push(
            " AND EXISTS (SELECT 1 FROM water_sections ws2 WHERE ws2.waterway_id = w.id
            AND ST_DWithin(ws2.location::geography, ST_SetSRID(ST_MakePoint(",
        );
        qb.push_bind(lon);
        qb.push(", ");
        qb.push_bind(lat);
        qb.push("), 4326)::geography, ");
        qb.push_bind(radius_km * 1000.0);
        qb.push("))");
    }
}

#[cfg(test)]
mod tests {
    use super::escape_like;

    #[test]
    fn escapes_like_wildcards() {
        assert_eq!(escape_like("salzach"), "salzach");
        assert_eq!(escape_like("100%"), "100\\%");
        assert_eq!(escape_like("a_b"), "a\\_b");
        assert_eq!(escape_like("back\\slash"), "back\\\\slash");
    }
}
