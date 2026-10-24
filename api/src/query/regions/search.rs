use sqlx::PgPool;

use super::rows::{BBOX_COLUMNS, OUTLINE_COLUMNS, PARENTS_SQL, drawn_geom, to_outline, to_region};

use crate::models::region::{Region, RegionKind, RegionOutline};

use crate::query::FUZZY_MIN_CHARS;

/// Countries whose English name matches the search term `$1`.
const COUNTRY_MATCH: &str = "SELECT cn.country FROM country_names cn
     WHERE public.search_key(cn.name) LIKE public.search_key($1) || '%'
        OR ($5 AND public.search_key(cn.name) %> public.search_key($1))";

/// Imported regions matching a name fragment, most specific kind first.
/// Diacritics and common misspellings fold the same way as the river search,
/// so "Otztal" finds "Ötztal" and "Tirool" finds "Tirol". An English country
/// name ("Austria") lists the regions of that country, after name matches.
pub async fn search(
    pool: &PgPool,
    name: Option<&str>,
    kind: Option<RegionKind>,
    country: Option<&str>,
    limit: i64,
) -> Result<Vec<Region>, sqlx::Error> {
    let drawn = drawn_geom();
    let fuzzy = name.is_some_and(|n| n.chars().count() >= FUZZY_MIN_CHARS);
    // Tier 0 exact, 1 contains, 2 only the country matched, 3 misspelt.
    // Within the country tier the larger kinds lead: thirty valleys would
    // say little about a country.
    let ranking = "ORDER BY tier,
                   array_position(CASE WHEN tier = 2
                                       THEN ARRAY['state', 'range', 'district', 'valley']
                                       ELSE ARRAY['valley', 'district', 'state', 'range'] END, kind),
                   name";
    let rows = sqlx::query(&format!(
        "SELECT id, name, kind, country, parents, {BBOX_COLUMNS}
         FROM (
             SELECT id, name, kind, country, {drawn} AS drawn, {PARENTS_SQL}, tier
             FROM (
                 SELECT r.*,
                        CASE WHEN $1::text IS NULL OR public.search_key(r.name) = public.search_key($1) THEN 0
                             WHEN public.search_key(r.name) LIKE '%' || public.search_key($1) || '%' THEN 1
                             WHEN r.country IN ({COUNTRY_MATCH}) THEN 2
                             ELSE 3 END AS tier
                 FROM regions r
                 WHERE r.kind <> 'country'
                   AND ($1::text IS NULL
                        OR public.search_key(r.name) LIKE '%' || public.search_key($1) || '%'
                        OR ($5 AND public.search_key(r.name) %> public.search_key($1))
                        OR r.country IN ({COUNTRY_MATCH}))
                   AND ($2::text IS NULL OR r.kind = $2)
                   AND ($3::text IS NULL OR r.country = $3)
             ) r
             {ranking}
             LIMIT $4
         ) matched
         {ranking}"
    ))
    .bind(name)
    .bind(kind.map(RegionKind::as_str))
    .bind(country.map(str::to_uppercase))
    .bind(limit)
    .bind(fuzzy)
    .fetch_all(pool)
    .await?;
    rows.iter().map(to_region).collect()
}

/// One region with its boundary.
pub async fn fetch(pool: &PgPool, id: i64) -> Result<Option<RegionOutline>, sqlx::Error> {
    let drawn = drawn_geom();
    let row = sqlx::query(&format!(
        "SELECT {OUTLINE_COLUMNS}, {BBOX_COLUMNS}, NULL::jsonb AS parents
         FROM (
             SELECT id, name, kind, country, {drawn} AS drawn
             FROM regions WHERE id = $1
         ) one"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;
    row.as_ref().map(to_outline).transpose()
}
