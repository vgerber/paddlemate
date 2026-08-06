use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::{
    descent::{
        CreateDescentRequest, Descent, DescentId, DescentSection, PatchDescentRequest,
        SectionDescentCount, Visibility,
    },
    gauge::{SectionWaterSnapshot, WaterLevel, WaterRangeWithStatus},
    waterway::PaginatedResponse,
};

use super::gauges::water_status_for_section_at;

fn optional_username(row: &PgRow) -> Result<Option<String>, sqlx::Error> {
    match row.try_get::<Option<String>, _>("username") {
        Ok(username) => Ok(username),
        Err(sqlx::Error::ColumnNotFound(_)) => Ok(None),
        Err(err) => Err(err),
    }
}

fn row_to_descent(row: &PgRow) -> Result<Descent, sqlx::Error> {
    // Visibility audience is populated later by enrich_descent.
    let visibility = match row.try_get::<String, _>("visibility_scope")?.as_str() {
        "public" => Visibility::Public,
        "shared" => Visibility::Shared {
            users: vec![],
            groups: vec![],
        },
        _ => Visibility::Private,
    };
    Ok(Descent {
        id: row.try_get("id")?,
        user_id: row.try_get("user_id")?,
        // Present only in list queries that join the users table; None otherwise.
        username: optional_username(row)?,
        name: row.try_get("name")?,
        start_time: row.try_get("start_time")?,
        end_time: row.try_get("end_time")?,
        note: row.try_get("note")?,
        put_in_feature_id: row.try_get("put_in_feature_id")?,
        put_in_lat: row.try_get("put_in_lat")?,
        put_in_lon: row.try_get("put_in_lon")?,
        put_in_label: row.try_get("put_in_label")?,
        take_out_feature_id: row.try_get("take_out_feature_id")?,
        take_out_lat: row.try_get("take_out_lat")?,
        take_out_lon: row.try_get("take_out_lon")?,
        take_out_label: row.try_get("take_out_label")?,
        visibility,
        visible_from: row.try_get("visible_from")?,
        sections: vec![],
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

const DESCENT_COLS: &str = "id, user_id, name, start_time, end_time, note, \
    put_in_feature_id, put_in_lat, put_in_lon, put_in_label, \
    take_out_feature_id, take_out_lat, take_out_lon, take_out_label, \
    visibility_scope::text AS visibility_scope, visible_from, created_at, updated_at";

/// Column list for list queries that JOIN the users table for username attribution.
const DESCENT_LIST_COLS: &str = concat!(
    "descents.id, descents.user_id, descents.name, descents.start_time, descents.end_time, ",
    "descents.note, descents.put_in_feature_id, descents.put_in_lat, descents.put_in_lon, ",
    "descents.put_in_label, descents.take_out_feature_id, descents.take_out_lat, ",
    "descents.take_out_lon, descents.take_out_label, ",
    "descents.visibility_scope::text AS visibility_scope, descents.visible_from, ",
    "descents.created_at, descents.updated_at, u.username"
);

async fn load_sections(
    pool: &PgPool,
    descent_id: DescentId,
) -> Result<Vec<DescentSection>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT ds.section_id, ds.sort_order, ds.note, \
                ws.name AS section_name, w.name AS waterway_name, \
                ST_AsGeoJSON(ws.location) AS section_location \
         FROM descent_sections ds \
         LEFT JOIN water_sections ws ON ws.id = ds.section_id \
         LEFT JOIN waterways w ON w.id = ws.waterway_id \
         WHERE ds.descent_id = $1 \
         ORDER BY ds.sort_order",
    )
    .bind(descent_id)
    .fetch_all(pool)
    .await?;

    let mut sections: Vec<DescentSection> = rows
        .iter()
        .map(|r| {
            Ok(DescentSection {
                section_id: r.try_get("section_id")?,
                sort_order: r.try_get("sort_order")?,
                note: r.try_get("note")?,
                section_name: r.try_get("section_name")?,
                waterway_name: r.try_get("waterway_name")?,
                location: r
                    .try_get::<Option<String>, _>("section_location")?
                    .and_then(|g| serde_json::from_str(&g).ok()),
                water_snapshots: vec![],
            })
        })
        .collect::<Result<_, sqlx::Error>>()?;

    let snapshots = load_snapshots_for_descent(pool, descent_id).await?;
    for s in &mut sections {
        s.water_snapshots = snapshots
            .get(&(descent_id, s.section_id))
            .cloned()
            .unwrap_or_default();
    }

    Ok(sections)
}

const SNAPSHOT_COLS: &str = "descent_id, section_id, series_id, gauge_id, gauge_name, unit, \
    value, level::text AS level, measured_at, \
    range_low, range_medium, range_high, \
    value_min, value_max, value_avg";

/// Keyed by (descent_id, section_id): several descents can cover the same
/// section, and each carries only the snapshots taken when *it* was logged.
fn collect_snapshots(
    rows: &[PgRow],
) -> Result<HashMap<(i64, i64), Vec<SectionWaterSnapshot>>, sqlx::Error> {
    let mut map: HashMap<(i64, i64), Vec<SectionWaterSnapshot>> = HashMap::new();
    for r in rows {
        let descent_id: i64 = r.try_get("descent_id")?;
        let section_id: i64 = r.try_get("section_id")?;
        map.entry((descent_id, section_id))
            .or_default()
            .push(row_to_snapshot(r)?);
    }
    Ok(map)
}

async fn load_snapshots_for_descent(
    pool: &PgPool,
    descent_id: DescentId,
) -> Result<HashMap<(i64, i64), Vec<SectionWaterSnapshot>>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {SNAPSHOT_COLS} \
         FROM descent_section_water_snapshots \
         WHERE descent_id = $1 \
         ORDER BY section_id, id",
    ))
    .bind(descent_id)
    .fetch_all(pool)
    .await?;

    collect_snapshots(&rows)
}

async fn batch_load_snapshots(
    pool: &PgPool,
    descent_ids: &[DescentId],
) -> Result<HashMap<(i64, i64), Vec<SectionWaterSnapshot>>, sqlx::Error> {
    if descent_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(&format!(
        "SELECT {SNAPSHOT_COLS} \
         FROM descent_section_water_snapshots \
         WHERE descent_id = ANY($1) \
         ORDER BY section_id, id",
    ))
    .bind(descent_ids)
    .fetch_all(pool)
    .await?;

    collect_snapshots(&rows)
}

fn row_to_snapshot(r: &sqlx::postgres::PgRow) -> Result<SectionWaterSnapshot, sqlx::Error> {
    let level = match r.try_get::<String, _>("level")?.as_str() {
        "low" => WaterLevel::Low,
        "medium" => WaterLevel::Medium,
        "high" => WaterLevel::High,
        _ => WaterLevel::Empty,
    };
    Ok(SectionWaterSnapshot {
        series_id: r.try_get("series_id")?,
        gauge_id: r.try_get("gauge_id")?,
        gauge_name: r.try_get("gauge_name")?,
        unit: r.try_get("unit")?,
        value: r.try_get("value")?,
        level,
        measured_at: r.try_get("measured_at")?,
        range_low: r.try_get("range_low")?,
        range_medium: r.try_get("range_medium")?,
        range_high: r.try_get("range_high")?,
        value_min: r.try_get("value_min")?,
        value_max: r.try_get("value_max")?,
        value_avg: r.try_get("value_avg")?,
    })
}

async fn insert_water_snapshots(
    pool: &PgPool,
    descent_id: DescentId,
    section_id: i64,
    ranges: &[WaterRangeWithStatus],
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    // One snapshot per gauge series - the section-level reading - not one
    // per feature range. The whitewater feature's calibration wins, like the
    // section display; then any calibrated range, then the first.
    let whitewater_ids: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM features WHERE section_id = $1 AND feature_type = 'whitewater'",
    )
    .bind(section_id)
    .fetch_all(pool)
    .await?;

    let is_calibrated = |r: &WaterRangeWithStatus| {
        r.range_low.is_some() || r.range_medium.is_some() || r.range_high.is_some()
    };
    let rank = |r: &WaterRangeWithStatus| {
        if whitewater_ids.contains(&r.feature_id) && is_calibrated(r) {
            0
        } else if is_calibrated(r) {
            1
        } else {
            2
        }
    };
    let mut by_series: std::collections::BTreeMap<i64, &WaterRangeWithStatus> =
        std::collections::BTreeMap::new();
    for range in ranges {
        by_series
            .entry(range.series.id)
            .and_modify(|best| {
                if rank(range) < rank(best) {
                    *best = range;
                }
            })
            .or_insert(range);
    }

    for range in by_series.into_values() {
        let value = range.latest_reading.as_ref().map(|r| r.value);
        let measured_at = range.latest_reading.as_ref().map(|r| r.measured_at);
        let level_str = match &range.level {
            WaterLevel::Low => "low",
            WaterLevel::Medium => "medium",
            WaterLevel::High => "high",
            WaterLevel::Empty => "empty",
        };

        // Compute min/max/avg over the descent time range.
        let agg = sqlx::query(
            "SELECT MIN(value) AS value_min, MAX(value) AS value_max, AVG(value) AS value_avg \
             FROM gauge_readings \
             WHERE series_id = $1 AND measured_at >= $2 AND measured_at <= $3",
        )
        .bind(range.series.id)
        .bind(start_time)
        .bind(end_time)
        .fetch_one(pool)
        .await?;

        let value_min: Option<f64> = agg.try_get("value_min")?;
        let value_max: Option<f64> = agg.try_get("value_max")?;
        let value_avg: Option<f64> = agg.try_get("value_avg")?;

        sqlx::query(
            "INSERT INTO descent_section_water_snapshots \
                (descent_id, section_id, series_id, gauge_id, gauge_name, unit, \
                 value, level, measured_at, range_low, range_medium, range_high, \
                 value_min, value_max, value_avg) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::water_level, $9, $10, $11, $12, $13, $14, $15)",
        )
        .bind(descent_id)
        .bind(section_id)
        .bind(range.series.id)
        .bind(range.gauge.id)
        .bind(&range.gauge.name)
        .bind(&range.series.unit)
        .bind(value)
        .bind(level_str)
        .bind(measured_at)
        .bind(range.range_low)
        .bind(range.range_medium)
        .bind(range.range_high)
        .bind(value_min)
        .bind(value_max)
        .bind(value_avg)
        .execute(pool)
        .await?;
    }
    Ok(())
}

async fn load_shared_users(
    pool: &PgPool,
    descent_id: DescentId,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT user_id FROM descent_visible_users WHERE descent_id = $1 ORDER BY user_id",
    )
    .bind(descent_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(|r| r.get("user_id")).collect())
}

async fn load_shared_groups(pool: &PgPool, descent_id: DescentId) -> Result<Vec<i64>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT group_id FROM descent_visible_groups WHERE descent_id = $1 ORDER BY group_id",
    )
    .bind(descent_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(|r| r.get("group_id")).collect())
}

async fn enrich_descent(pool: &PgPool, mut d: Descent) -> Result<Descent, sqlx::Error> {
    d.sections = load_sections(pool, d.id).await?;
    // Only load audience for shared descents; private/public have no audience rows.
    if let Visibility::Shared {
        ref mut users,
        ref mut groups,
    } = d.visibility
    {
        *users = load_shared_users(pool, d.id).await?;
        *groups = load_shared_groups(pool, d.id).await?;
    }
    Ok(d)
}

async fn batch_load_sections(
    pool: &PgPool,
    ids: &[DescentId],
) -> Result<HashMap<DescentId, Vec<DescentSection>>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(
        "SELECT ds.descent_id, ds.section_id, ds.sort_order, ds.note, \
                ws.name AS section_name, w.name AS waterway_name, \
                ST_AsGeoJSON(ws.location) AS section_location \
         FROM descent_sections ds \
         LEFT JOIN water_sections ws ON ws.id = ds.section_id \
         LEFT JOIN waterways w ON w.id = ws.waterway_id \
         WHERE ds.descent_id = ANY($1) \
         ORDER BY ds.descent_id, ds.sort_order",
    )
    .bind(ids)
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<DescentId, Vec<DescentSection>> = HashMap::new();
    for r in &rows {
        let did: DescentId = r.try_get("descent_id")?;
        map.entry(did).or_default().push(DescentSection {
            section_id: r.try_get("section_id")?,
            sort_order: r.try_get("sort_order")?,
            note: r.try_get("note")?,
            section_name: r.try_get("section_name")?,
            waterway_name: r.try_get("waterway_name")?,
            location: r
                .try_get::<Option<String>, _>("section_location")?
                .and_then(|g| serde_json::from_str(&g).ok()),
            water_snapshots: vec![],
        });
    }

    let snapshots = batch_load_snapshots(pool, ids).await?;
    for (descent_id, sections) in map.iter_mut() {
        for s in sections.iter_mut() {
            s.water_snapshots = snapshots
                .get(&(*descent_id, s.section_id))
                .cloned()
                .unwrap_or_default();
        }
    }

    Ok(map)
}

async fn batch_load_shared_users(
    pool: &PgPool,
    ids: &[DescentId],
) -> Result<HashMap<DescentId, Vec<String>>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(
        "SELECT descent_id, user_id \
         FROM descent_visible_users \
         WHERE descent_id = ANY($1) \
         ORDER BY descent_id, user_id",
    )
    .bind(ids)
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<DescentId, Vec<String>> = HashMap::new();
    for r in &rows {
        let did: DescentId = r.try_get("descent_id")?;
        map.entry(did).or_default().push(r.try_get("user_id")?);
    }
    Ok(map)
}

async fn batch_load_shared_groups(
    pool: &PgPool,
    ids: &[DescentId],
) -> Result<HashMap<DescentId, Vec<i64>>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(
        "SELECT descent_id, group_id \
         FROM descent_visible_groups \
         WHERE descent_id = ANY($1) \
         ORDER BY descent_id, group_id",
    )
    .bind(ids)
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<DescentId, Vec<i64>> = HashMap::new();
    for r in &rows {
        let did: DescentId = r.try_get("descent_id")?;
        map.entry(did).or_default().push(r.try_get("group_id")?);
    }
    Ok(map)
}

pub async fn create_descent(
    pool: &PgPool,
    user_id: &str,
    req: &CreateDescentRequest,
) -> Result<Descent, sqlx::Error> {
    let visibility_str = req.visibility.scope_str();
    let (shared_users, shared_groups): (&[String], &[i64]) = match &req.visibility {
        Visibility::Shared { users, groups } => (users, groups),
        _ => (&[], &[]),
    };
    let mut tx = pool.begin().await?;

    let row = sqlx::query(&format!(
        "INSERT INTO descents \
            (user_id, name, start_time, end_time, note, \
             put_in_feature_id, put_in_lat, put_in_lon, put_in_label, \
             take_out_feature_id, take_out_lat, take_out_lon, take_out_label, \
             visibility_scope, visible_from) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::visibility_scope, $15) \
         RETURNING {DESCENT_COLS}"
    ))
    .bind(user_id)
    .bind(req.name.as_deref())
    .bind(req.start_time)
    .bind(req.end_time)
    .bind(req.note.as_deref())
    .bind(req.put_in_feature_id)
    .bind(req.put_in_lat)
    .bind(req.put_in_lon)
    .bind(req.put_in_label.as_deref())
    .bind(req.take_out_feature_id)
    .bind(req.take_out_lat)
    .bind(req.take_out_lon)
    .bind(req.take_out_label.as_deref())
    .bind(visibility_str)
    .bind(req.visible_from)
    .fetch_one(&mut *tx)
    .await?;

    let descent = row_to_descent(&row)?;
    let descent_id = descent.id;

    for s in &req.sections {
        sqlx::query(
            "INSERT INTO descent_sections (descent_id, section_id, sort_order, note) \
             VALUES ($1, $2, $3, $4)",
        )
        .bind(descent_id)
        .bind(s.section_id)
        .bind(s.sort_order)
        .bind(s.note.as_deref())
        .execute(&mut *tx)
        .await?;
    }

    for uid in shared_users {
        sqlx::query("INSERT INTO descent_visible_users (descent_id, user_id) VALUES ($1, $2)")
            .bind(descent_id)
            .bind(uid)
            .execute(&mut *tx)
            .await?;
    }

    for gid in shared_groups {
        sqlx::query("INSERT INTO descent_visible_groups (descent_id, group_id) VALUES ($1, $2)")
            .bind(descent_id)
            .bind(gid)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    // Snapshot water levels at or before the descent's end time so the reading
    // reflects conditions during the run, not when the descent was logged.
    // Non-fatal: a gauge lookup failure must never prevent a descent from being saved.
    for s in &req.sections {
        if let Ok(status) = water_status_for_section_at(pool, s.section_id, req.end_time).await {
            if !status.ranges.is_empty() {
                let _ = insert_water_snapshots(
                    pool,
                    descent_id,
                    s.section_id,
                    &status.ranges,
                    req.start_time,
                    req.end_time,
                )
                .await;
            }
        }
    }

    enrich_descent(pool, descent).await
}

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

    match row {
        None => Ok(None),
        Some(r) => Ok(Some(enrich_descent(pool, row_to_descent(&r)?).await?)),
    }
}

pub struct ListFilters<'a> {
    /// "owned" | "visible" (default "visible")
    pub scope: Option<&'a str>,
    pub visibility: Option<&'a str>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub section_id: Option<i64>,
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
             ) \
               AND ($2::text IS NULL OR descents.visibility_scope::text = $2) \
               AND ($3::timestamptz IS NULL OR descents.start_time >= $3) \
               AND ($4::timestamptz IS NULL OR descents.start_time <= $4) \
               AND ($5::bigint IS NULL OR EXISTS ( \
                   SELECT 1 FROM descent_sections ds \
                   WHERE ds.descent_id = descents.id AND ds.section_id = $5 \
               )) \
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
             ORDER BY descents.start_time DESC \
             LIMIT $4 OFFSET $5"
        ))
        .bind(filters.from)
        .bind(filters.to)
        .bind(filters.section_id)
        .bind(filters.per_page)
        .bind(offset)
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

    let total_pages = (total + filters.per_page - 1) / filters.per_page;
    Ok(PaginatedResponse {
        items: descents,
        total,
        page: filters.page,
        per_page: filters.per_page,
        total_pages,
    })
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

pub async fn patch_descent(
    pool: &PgPool,
    descent_id: DescentId,
    user_id: &str,
    patch: &PatchDescentRequest,
) -> Result<Option<Descent>, sqlx::Error> {
    let visibility_str: Option<&str> = patch.visibility.as_ref().map(|v| v.scope_str());
    let update_name = patch.name.is_some();
    let name_val: Option<&str> = patch.name.as_ref().and_then(|n| n.as_deref());
    let update_note = patch.note.is_some();
    let note_val: Option<&str> = patch.note.as_ref().and_then(|n| n.as_deref());
    let update_visible_from = patch.visible_from.is_some();
    let visible_from_val: Option<DateTime<Utc>> = patch.visible_from.flatten();
    let update_put_in = patch.put_in_feature_id.is_some()
        || patch.put_in_lat.is_some()
        || patch.put_in_lon.is_some()
        || patch.put_in_label.is_some();
    let update_take_out = patch.take_out_feature_id.is_some()
        || patch.take_out_lat.is_some()
        || patch.take_out_lon.is_some()
        || patch.take_out_label.is_some();

    let mut tx = pool.begin().await?;

    let row = sqlx::query(&format!(
        "UPDATE descents SET \
             start_time          = COALESCE($3::timestamptz, start_time), \
             end_time            = COALESCE($4::timestamptz, end_time), \
             name                = CASE WHEN $5::boolean THEN $6::text ELSE name END, \
             note                = CASE WHEN $7::boolean THEN $8::text ELSE note END, \
             visibility_scope    = COALESCE($9::text::visibility_scope, visibility_scope), \
             visible_from        = CASE WHEN $10::boolean THEN $11::timestamptz ELSE visible_from END, \
             put_in_feature_id   = CASE WHEN $12::boolean THEN $13::bigint ELSE put_in_feature_id END, \
             put_in_lat          = CASE WHEN $12::boolean THEN $14::float8 ELSE put_in_lat END, \
             put_in_lon          = CASE WHEN $12::boolean THEN $15::float8 ELSE put_in_lon END, \
             put_in_label        = CASE WHEN $12::boolean THEN $16::text ELSE put_in_label END, \
             take_out_feature_id = CASE WHEN $17::boolean THEN $18::bigint ELSE take_out_feature_id END, \
             take_out_lat        = CASE WHEN $17::boolean THEN $19::float8 ELSE take_out_lat END, \
             take_out_lon        = CASE WHEN $17::boolean THEN $20::float8 ELSE take_out_lon END, \
             take_out_label      = CASE WHEN $17::boolean THEN $21::text ELSE take_out_label END, \
             updated_at          = NOW() \
         WHERE id = $1 AND user_id = $2 \
         RETURNING {DESCENT_COLS}"
    ))
    .bind(descent_id)
    .bind(user_id)
    .bind(patch.start_time)
    .bind(patch.end_time)
    .bind(update_name)
    .bind(name_val)
    .bind(update_note)
    .bind(note_val)
    .bind(visibility_str)
    .bind(update_visible_from)
    .bind(visible_from_val)
    .bind(update_put_in)
    .bind(patch.put_in_feature_id)
    .bind(patch.put_in_lat)
    .bind(patch.put_in_lon)
    .bind(patch.put_in_label.as_deref())
    .bind(update_take_out)
    .bind(patch.take_out_feature_id)
    .bind(patch.take_out_lat)
    .bind(patch.take_out_lon)
    .bind(patch.take_out_label.as_deref())
    .fetch_optional(&mut *tx)
    .await?;

    let row = match row {
        None => return Ok(None),
        Some(r) => r,
    };
    let base = row_to_descent(&row)?;

    // Sync audience tables when visibility changes.
    if let Some(ref vis) = patch.visibility {
        sqlx::query("DELETE FROM descent_visible_users  WHERE descent_id = $1")
            .bind(descent_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM descent_visible_groups WHERE descent_id = $1")
            .bind(descent_id)
            .execute(&mut *tx)
            .await?;

        if let Visibility::Shared { users, groups } = vis {
            for uid in users {
                sqlx::query(
                    "INSERT INTO descent_visible_users (descent_id, user_id) VALUES ($1, $2)",
                )
                .bind(descent_id)
                .bind(uid)
                .execute(&mut *tx)
                .await?;
            }
            for gid in groups {
                sqlx::query(
                    "INSERT INTO descent_visible_groups (descent_id, group_id) VALUES ($1, $2)",
                )
                .bind(descent_id)
                .bind(gid)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    // Replace sections when provided.
    if let Some(ref sections) = patch.sections {
        sqlx::query("DELETE FROM descent_sections WHERE descent_id = $1")
            .bind(descent_id)
            .execute(&mut *tx)
            .await?;
        for s in sections {
            sqlx::query(
                "INSERT INTO descent_sections (descent_id, section_id, sort_order, note) \
                 VALUES ($1, $2, $3, $4)",
            )
            .bind(descent_id)
            .bind(s.section_id)
            .bind(s.sort_order)
            .bind(s.note.as_deref())
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(Some(enrich_descent(pool, base).await?))
}

pub async fn delete_descent(
    pool: &PgPool,
    descent_id: DescentId,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM descents WHERE id = $1 AND user_id = $2")
        .bind(descent_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
