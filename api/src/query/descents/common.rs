use std::collections::HashMap;

use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::{
    descent::{Descent, DescentId, DescentSection},
    visibility::Visibility,
};

use super::snapshots::{batch_load_snapshots, load_snapshots_for_descent};

pub(super) fn row_to_descent(row: &PgRow) -> Result<Descent, sqlx::Error> {
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
        username: row.try_get("username")?,
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
        trip_id: row.try_get("trip_id")?,
        sections: vec![],
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// Column list for INSERT/UPDATE ... RETURNING on descents; username comes from a subselect.
pub(super) const DESCENT_COLS: &str = "id, user_id, name, start_time, end_time, note, \
    put_in_feature_id, put_in_lat, put_in_lon, put_in_label, \
    take_out_feature_id, take_out_lat, take_out_lon, take_out_label, \
    visibility_scope::text AS visibility_scope, visible_from, trip_id, created_at, updated_at, \
    (SELECT u.username FROM users u WHERE u.id = descents.user_id) AS username";

/// Column list for list queries that JOIN the users table for username attribution.
pub(super) const DESCENT_LIST_COLS: &str = concat!(
    "descents.id, descents.user_id, descents.name, descents.start_time, descents.end_time, ",
    "descents.note, descents.put_in_feature_id, descents.put_in_lat, descents.put_in_lon, ",
    "descents.put_in_label, descents.take_out_feature_id, descents.take_out_lat, ",
    "descents.take_out_lon, descents.take_out_label, ",
    "descents.visibility_scope::text AS visibility_scope, descents.visible_from, ",
    "descents.trip_id, descents.created_at, descents.updated_at, u.username"
);

pub(super) async fn load_sections(
    pool: &PgPool,
    descent_id: DescentId,
) -> Result<Vec<DescentSection>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT ds.section_id, ds.sort_order, ds.note, \
                ws.name AS section_name, w.name AS waterway_name, \
                ws.waterway_id, \
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
                waterway_id: r.try_get("waterway_id")?,
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

pub(super) async fn load_shared_users(
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

pub(super) async fn load_shared_groups(
    pool: &PgPool,
    descent_id: DescentId,
) -> Result<Vec<i64>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT group_id FROM descent_visible_groups WHERE descent_id = $1 ORDER BY group_id",
    )
    .bind(descent_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(|r| r.get("group_id")).collect())
}

pub(super) async fn enrich_descent(pool: &PgPool, mut d: Descent) -> Result<Descent, sqlx::Error> {
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

pub(super) async fn batch_load_sections(
    pool: &PgPool,
    ids: &[DescentId],
) -> Result<HashMap<DescentId, Vec<DescentSection>>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(
        "SELECT ds.descent_id, ds.section_id, ds.sort_order, ds.note, \
                ws.name AS section_name, w.name AS waterway_name, \
                ws.waterway_id, \
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
            waterway_id: r.try_get("waterway_id")?,
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

pub(super) async fn batch_load_shared_users(
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

pub(super) async fn batch_load_shared_groups(
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
