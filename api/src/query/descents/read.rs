use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};

use crate::models::{
    descent::{Descent, DescentId, SectionDescentCount},
    page::{PaginatedResponse, page_of},
    visibility::Visibility,
};

use super::common::*;

/// A log is also open to the people on the trip it is credited to - the same
/// rule the trip's log list follows, so a log listed there opens. Its owner
/// is always on that trip: the link hangs off their membership.
pub async fn get_descent_for_viewer(
    pool: &PgPool,
    descent_id: DescentId,
    viewer_id: Option<&str>,
) -> Result<Option<Descent>, sqlx::Error> {
    let row = if let Some(vid) = viewer_id {
        sqlx::query(&format!(
            "SELECT {DESCENT_LIST_COLS} FROM descents \
             LEFT JOIN users u ON u.id = descents.user_id \
             WHERE descents.id = $1 AND ( \
                 descents.user_id = $2 \
                 OR (visibility_scope = 'public' AND (visible_from IS NULL OR visible_from <= NOW())) \
                 OR (visibility_scope = 'shared' AND EXISTS ( \
                     SELECT 1 FROM descent_visible_users \
                     WHERE descent_id = descents.id AND user_id = $2 \
                 )) \
                 OR (visibility_scope = 'shared' AND EXISTS ( \
                     SELECT 1 FROM descent_visible_groups dvg \
                     JOIN group_members gm ON gm.group_id = dvg.group_id \
                     WHERE dvg.descent_id = descents.id AND gm.user_id = $2 \
                 )) \
                 OR (descents.trip_id IS NOT NULL AND EXISTS ( \
                     SELECT 1 FROM trip_members tm \
                     WHERE tm.trip_id = descents.trip_id AND tm.user_id = $2 \
                 )) \
             )"
        ))
        .bind(descent_id)
        .bind(vid)
        .fetch_optional(pool)
        .await?
    } else {
        sqlx::query(&format!(
            "SELECT {DESCENT_LIST_COLS} FROM descents \
             LEFT JOIN users u ON u.id = descents.user_id \
             WHERE descents.id = $1 \
               AND descents.visibility_scope = 'public' \
               AND (descents.visible_from IS NULL OR descents.visible_from <= NOW())"
        ))
        .bind(descent_id)
        .fetch_optional(pool)
        .await?
    };

    let Some(r) = row else { return Ok(None) };
    let mut descent = [enrich_descent(pool, row_to_descent(&r)?).await?];
    hide_foreign_trips(pool, viewer_id, &mut descent).await?;
    let [descent] = descent;
    Ok(Some(descent))
}

/// Which trip a log is credited to is as private as the trip: a public log
/// is readable by anyone, but only the trip's members learn its `trip_id`.
async fn hide_foreign_trips(
    pool: &PgPool,
    viewer_id: Option<&str>,
    descents: &mut [Descent],
) -> Result<(), sqlx::Error> {
    if descents.iter().all(|d| d.trip_id.is_none()) {
        return Ok(());
    }
    let mine: std::collections::HashSet<i64> = match viewer_id {
        Some(vid) => sqlx::query_scalar("SELECT trip_id FROM trip_members WHERE user_id = $1")
            .bind(vid)
            .fetch_all(pool)
            .await?
            .into_iter()
            .collect(),
        None => Default::default(),
    };
    for d in descents {
        if d.trip_id.is_some_and(|t| !mine.contains(&t)) {
            d.trip_id = None;
        }
    }
    Ok(())
}

pub struct ListFilters<'a> {
    /// "owned" | "visible" (default "visible")
    pub scope: Option<&'a str>,
    /// Narrows to one author. Composed on top of the visibility rules, so
    /// it can only ever hide rows the viewer was already allowed to see.
    pub user_id: Option<&'a str>,
    pub visibility: Option<&'a str>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub section_id: Option<i64>,
    /// Narrows to one trip. A member of that trip sees every log in it, so
    /// this is also what unlocks the visibility override below.
    pub trip_id: Option<i64>,
    pub page: i64,
    pub per_page: i64,
}

pub async fn list_descents_for_viewer(
    pool: &PgPool,
    viewer_id: Option<&str>,
    filters: ListFilters<'_>,
) -> Result<PaginatedResponse<Descent>, sqlx::Error> {
    let offset = (filters.page.saturating_sub(1)) * filters.per_page;

    let rows = if filters.scope == Some("owned") {
        let vid = match viewer_id {
            Some(v) => v,
            None => {
                return Ok(PaginatedResponse {
                    items: vec![],
                    total: 0,
                    page: filters.page,
                    per_page: filters.per_page,
                    total_pages: 0,
                });
            }
        };
        sqlx::query(&format!(
            "SELECT {DESCENT_LIST_COLS}, COUNT(*) OVER() AS total_count \
             FROM descents \
             LEFT JOIN users u ON u.id = descents.user_id \
             WHERE descents.user_id = $1 \
               AND ($2::text IS NULL OR descents.visibility_scope::text = $2) \
               AND ($3::timestamptz IS NULL OR descents.start_time >= $3) \
               AND ($4::timestamptz IS NULL OR descents.start_time <= $4) \
               AND ($5::bigint IS NULL OR EXISTS ( \
                   SELECT 1 FROM descent_sections ds \
                   WHERE ds.descent_id = descents.id AND ds.section_id = $5 \
               )) \
               AND ($8::text IS NULL OR descents.user_id = $8) \
               AND ($9::bigint IS NULL OR descents.trip_id = $9) \
             ORDER BY descents.start_time DESC \
             LIMIT $6 OFFSET $7"
        ))
        .bind(vid)
        .bind(filters.visibility)
        .bind(filters.from)
        .bind(filters.to)
        .bind(filters.section_id)
        .bind(filters.per_page)
        .bind(offset)
        .bind(filters.user_id)
        .bind(filters.trip_id)
        .fetch_all(pool)
        .await?
    } else if filters.scope == Some("following") {
        let vid = match viewer_id {
            Some(v) => v,
            None => {
                return Ok(PaginatedResponse {
                    items: vec![],
                    total: 0,
                    page: filters.page,
                    per_page: filters.per_page,
                    total_pages: 0,
                });
            }
        };
        sqlx::query(&format!(
            "SELECT {DESCENT_LIST_COLS}, COUNT(*) OVER() AS total_count \
             FROM descents \
             LEFT JOIN users u ON u.id = descents.user_id \
             WHERE descents.user_id IN ( \
                 SELECT following_id FROM user_follows \
                 WHERE follower_id = $1 AND status = 'accepted' \
             ) \
             AND ( \
                 (descents.visibility_scope = 'public' AND (descents.visible_from IS NULL OR descents.visible_from <= NOW())) \
                 OR (descents.visibility_scope = 'shared' AND EXISTS ( \
                     SELECT 1 FROM descent_visible_users \
                     WHERE descent_id = descents.id AND user_id = $1 \
                 )) \
                 OR (descents.visibility_scope = 'shared' AND EXISTS ( \
                     SELECT 1 FROM descent_visible_groups dvg \
                     JOIN group_members gm ON gm.group_id = dvg.group_id \
                     WHERE dvg.descent_id = descents.id AND gm.user_id = $1 \
                 )) \
             ) \
               AND ($2::text IS NULL OR descents.visibility_scope::text = $2) \
               AND ($3::timestamptz IS NULL OR descents.start_time >= $3) \
               AND ($4::timestamptz IS NULL OR descents.start_time <= $4) \
               AND ($5::bigint IS NULL OR EXISTS ( \
                   SELECT 1 FROM descent_sections ds \
                   WHERE ds.descent_id = descents.id AND ds.section_id = $5 \
               )) \
               AND ($8::text IS NULL OR descents.user_id = $8) \
               AND ($9::bigint IS NULL OR descents.trip_id = $9) \
             ORDER BY descents.start_time DESC \
             LIMIT $6 OFFSET $7"
        ))
        .bind(vid)
        .bind(filters.visibility)
        .bind(filters.from)
        .bind(filters.to)
        .bind(filters.section_id)
        .bind(filters.per_page)
        .bind(offset)
        .bind(filters.user_id)
        .bind(filters.trip_id)
        .fetch_all(pool)
        .await?
    } else if let Some(vid) = viewer_id {
        sqlx::query(&format!(
            "SELECT {DESCENT_LIST_COLS}, COUNT(*) OVER() AS total_count \
             FROM descents \
             LEFT JOIN users u ON u.id = descents.user_id \
             WHERE ( \
                 descents.user_id = $1 \
                 OR (descents.visibility_scope = 'public' AND (descents.visible_from IS NULL OR descents.visible_from <= NOW())) \
                 OR (descents.visibility_scope = 'shared' AND EXISTS ( \
                     SELECT 1 FROM descent_visible_users \
                     WHERE descent_id = descents.id AND user_id = $1 \
                 )) \
                 OR (descents.visibility_scope = 'shared' AND EXISTS ( \
                     SELECT 1 FROM descent_visible_groups dvg \
                     JOIN group_members gm ON gm.group_id = dvg.group_id \
                     WHERE dvg.descent_id = descents.id AND gm.user_id = $1 \
                 )) \
                 OR ($9::bigint IS NOT NULL AND descents.trip_id = $9 AND EXISTS ( \
                     SELECT 1 FROM trip_members tm \
                     WHERE tm.trip_id = $9 AND tm.user_id = $1 \
                 )) \
             ) \
               AND ($2::text IS NULL OR descents.visibility_scope::text = $2) \
               AND ($3::timestamptz IS NULL OR descents.start_time >= $3) \
               AND ($4::timestamptz IS NULL OR descents.start_time <= $4) \
               AND ($5::bigint IS NULL OR EXISTS ( \
                   SELECT 1 FROM descent_sections ds \
                   WHERE ds.descent_id = descents.id AND ds.section_id = $5 \
               )) \
               AND ($8::text IS NULL OR descents.user_id = $8) \
               AND ($9::bigint IS NULL OR descents.trip_id = $9) \
             ORDER BY descents.start_time DESC \
             LIMIT $6 OFFSET $7"
        ))
        .bind(vid)
        .bind(filters.visibility)
        .bind(filters.from)
        .bind(filters.to)
        .bind(filters.section_id)
        .bind(filters.per_page)
        .bind(offset)
        .bind(filters.user_id)
        .bind(filters.trip_id)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query(&format!(
            "SELECT {DESCENT_LIST_COLS}, COUNT(*) OVER() AS total_count \
             FROM descents \
             LEFT JOIN users u ON u.id = descents.user_id \
             WHERE descents.visibility_scope = 'public' \
               AND (descents.visible_from IS NULL OR descents.visible_from <= NOW()) \
               AND ($1::timestamptz IS NULL OR descents.start_time >= $1) \
               AND ($2::timestamptz IS NULL OR descents.start_time <= $2) \
               AND ($3::bigint IS NULL OR EXISTS ( \
                   SELECT 1 FROM descent_sections ds \
                   WHERE ds.descent_id = descents.id AND ds.section_id = $3 \
               )) \
               AND ($6::text IS NULL OR descents.user_id = $6) \
               AND ($7::bigint IS NULL OR descents.trip_id = $7) \
             ORDER BY descents.start_time DESC \
             LIMIT $4 OFFSET $5"
        ))
        .bind(filters.from)
        .bind(filters.to)
        .bind(filters.section_id)
        .bind(filters.per_page)
        .bind(offset)
        .bind(filters.user_id)
        .bind(filters.trip_id)
        .fetch_all(pool)
        .await?
    };

    let total: i64 = rows
        .first()
        .and_then(|r| r.try_get::<Option<i64>, _>("total_count").ok().flatten())
        .unwrap_or(0);

    let mut descents: Vec<Descent> = rows.iter().map(row_to_descent).collect::<Result<_, _>>()?;
    let ids: Vec<DescentId> = descents.iter().map(|d| d.id).collect();

    let mut sections_map = batch_load_sections(pool, &ids).await?;
    let mut users_map = batch_load_shared_users(pool, &ids).await?;
    let mut groups_map = batch_load_shared_groups(pool, &ids).await?;

    for d in &mut descents {
        d.sections = sections_map.remove(&d.id).unwrap_or_default();
        if let Visibility::Shared {
            ref mut users,
            ref mut groups,
        } = d.visibility
        {
            *users = users_map.remove(&d.id).unwrap_or_default();
            *groups = groups_map.remove(&d.id).unwrap_or_default();
        }
    }

    hide_foreign_trips(pool, viewer_id, &mut descents).await?;

    Ok(page_of(descents, total, filters.page, filters.per_page))
}

/// Per-section descent counts for a waterway, honoring the same
/// visibility rules as the descent list (owner, public, shared).
pub async fn count_descents_per_section(
    pool: &PgPool,
    waterway_id: i64,
    viewer_id: Option<&str>,
) -> Result<Vec<SectionDescentCount>, sqlx::Error> {
    let rows = if let Some(vid) = viewer_id {
        sqlx::query(
            "SELECT ds.section_id, COUNT(*) AS count \
             FROM descent_sections ds \
             JOIN descents ON descents.id = ds.descent_id \
             JOIN water_sections ws ON ws.id = ds.section_id \
             WHERE ws.waterway_id = $1 \
               AND ( \
                 descents.user_id = $2 \
                 OR (descents.visibility_scope = 'public' AND (descents.visible_from IS NULL OR descents.visible_from <= NOW())) \
                 OR (descents.visibility_scope = 'shared' AND EXISTS ( \
                     SELECT 1 FROM descent_visible_users \
                     WHERE descent_id = descents.id AND user_id = $2 \
                 )) \
                 OR (descents.visibility_scope = 'shared' AND EXISTS ( \
                     SELECT 1 FROM descent_visible_groups dvg \
                     JOIN group_members gm ON gm.group_id = dvg.group_id \
                     WHERE dvg.descent_id = descents.id AND gm.user_id = $2 \
                 )) \
               ) \
             GROUP BY ds.section_id",
        )
        .bind(waterway_id)
        .bind(vid)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query(
            "SELECT ds.section_id, COUNT(*) AS count \
             FROM descent_sections ds \
             JOIN descents ON descents.id = ds.descent_id \
             JOIN water_sections ws ON ws.id = ds.section_id \
             WHERE ws.waterway_id = $1 \
               AND descents.visibility_scope = 'public' \
               AND (descents.visible_from IS NULL OR descents.visible_from <= NOW()) \
             GROUP BY ds.section_id",
        )
        .bind(waterway_id)
        .fetch_all(pool)
        .await?
    };

    rows.iter()
        .map(|r| {
            Ok(SectionDescentCount {
                section_id: r.try_get("section_id")?,
                count: r.try_get("count")?,
            })
        })
        .collect()
}
