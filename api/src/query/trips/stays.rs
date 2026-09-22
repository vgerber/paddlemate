//! The bases a trip moves between, and the runs watched from each.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::{trip::*, water_section::SectionId};

use super::{Outcome, lock_trip, missed};

pub(super) fn row_to_stay(row: &PgRow) -> Result<TripStay, sqlx::Error> {
    Ok(TripStay {
        id: row.try_get("id")?,
        trip_id: row.try_get("trip_id")?,
        kind: row.try_get("kind")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        location: row
            .try_get::<Option<String>, _>("location")?
            .and_then(|g| serde_json::from_str(&g).ok()),
        arrival: row.try_get("arrival")?,
        departure: row.try_get("departure")?,
        sections: vec![],
        created_by: row.try_get("created_by")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

const STAY_COLS: &str = "id, trip_id, kind, name, description, \
    ST_AsGeoJSON(location) AS location, arrival, departure, created_by, created_at, updated_at";

pub(super) async fn insert_stay(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    trip_id: TripId,
    user_id: &str,
    req: &CreateTripStayRequest,
) -> Result<TripStay, sqlx::Error> {
    let row = sqlx::query(&format!(
        "INSERT INTO trip_stays (trip_id, kind, name, description, location, arrival, departure, created_by) \
         VALUES ($1, $2, $3, $4, \
                 CASE WHEN $5::double precision IS NULL OR $6::double precision IS NULL THEN NULL \
                      ELSE ST_SetSRID(ST_MakePoint($6, $5), 4326) END, \
                 $7, $8, $9) \
         RETURNING {STAY_COLS}"
    ))
    .bind(trip_id)
    .bind(&req.kind)
    .bind(&req.name)
    .bind(req.description.as_deref())
    .bind(req.lat)
    .bind(req.lon)
    .bind(req.arrival)
    .bind(req.departure)
    .bind(user_id)
    .fetch_one(&mut **tx)
    .await?;
    row_to_stay(&row)
}

/// A timeline: ordered by arrival, falling back to creation while the date is
/// still unset, so a placeholder stay keeps the position it was added in.
pub async fn list_stays(pool: &PgPool, trip_id: TripId) -> Result<Vec<TripStay>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {STAY_COLS} FROM trip_stays WHERE trip_id = $1 \
         ORDER BY arrival NULLS LAST, created_at, id"
    ))
    .bind(trip_id)
    .fetch_all(pool)
    .await?;

    let mut stays: Vec<TripStay> = rows.iter().map(row_to_stay).collect::<Result<_, _>>()?;
    let ids: Vec<TripStayId> = stays.iter().map(|s| s.id).collect();
    let mut sections = load_sections(pool, &ids).await?;
    for s in &mut stays {
        s.sections = sections.remove(&s.id).unwrap_or_default();
    }
    Ok(stays)
}

async fn load_sections(
    pool: &PgPool,
    stay_ids: &[TripStayId],
) -> Result<HashMap<TripStayId, Vec<TripSection>>, sqlx::Error> {
    let mut out: HashMap<TripStayId, Vec<TripSection>> = HashMap::new();
    if stay_ids.is_empty() {
        return Ok(out);
    }

    let rows = sqlx::query(
        "SELECT ts.id, ts.stay_id, ts.section_id, ts.sort_order, ts.status, ts.note, \
                ws.name AS section_name, w.name AS waterway_name, ws.waterway_id, \
                ST_AsGeoJSON(ws.location) AS section_location \
         FROM trip_sections ts \
         JOIN water_sections ws ON ws.id = ts.section_id \
         LEFT JOIN waterways w ON w.id = ws.waterway_id \
         WHERE ts.stay_id = ANY($1) \
         ORDER BY ts.stay_id, ts.sort_order",
    )
    .bind(stay_ids)
    .fetch_all(pool)
    .await?;

    for r in &rows {
        let stay_id: TripStayId = r.try_get("stay_id")?;
        out.entry(stay_id).or_default().push(TripSection {
            id: r.try_get("id")?,
            stay_id,
            section_id: r.try_get("section_id")?,
            sort_order: r.try_get("sort_order")?,
            status: r.try_get("status")?,
            note: r.try_get("note")?,
            section_name: r.try_get("section_name")?,
            waterway_name: r.try_get("waterway_name")?,
            waterway_id: r.try_get("waterway_id")?,
            location: r
                .try_get::<Option<String>, _>("section_location")?
                .and_then(|g| serde_json::from_str(&g).ok()),
        });
    }
    Ok(out)
}

pub async fn create_stay(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
    req: &CreateTripStayRequest,
) -> Result<TripStay, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let stay = insert_stay(&mut tx, trip_id, user_id, req).await?;
    tx.commit().await?;
    Ok(stay)
}

pub async fn patch_stay(
    pool: &PgPool,
    trip_id: TripId,
    stay_id: TripStayId,
    expected: Option<DateTime<Utc>>,
    req: &PatchTripStayRequest,
) -> Result<Outcome<TripStay>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "UPDATE trip_stays SET \
             kind        = COALESCE($3, kind), \
             name        = COALESCE($4, name), \
             description = CASE WHEN $5 THEN $6 ELSE description END, \
             location    = CASE WHEN $7 THEN \
                                CASE WHEN $8::double precision IS NULL OR $9::double precision IS NULL \
                                     THEN NULL ELSE ST_SetSRID(ST_MakePoint($9, $8), 4326) END \
                           ELSE location END, \
             arrival     = CASE WHEN $10 THEN $11 ELSE arrival END, \
             departure   = CASE WHEN $12 THEN $13 ELSE departure END, \
             updated_at  = NOW() \
         WHERE trip_id = $1 AND id = $2 AND ($14::timestamptz IS NULL OR updated_at = $14) \
         RETURNING {STAY_COLS}"
    ))
    .bind(trip_id)
    .bind(stay_id)
    .bind(req.kind.as_ref())
    .bind(req.name.as_deref())
    .bind(req.description.is_some())
    .bind(req.description.clone().flatten())
    .bind(req.lat.is_some() || req.lon.is_some())
    .bind(req.lat.flatten())
    .bind(req.lon.flatten())
    .bind(req.arrival.is_some())
    .bind(req.arrival.flatten())
    .bind(req.departure.is_some())
    .bind(req.departure.flatten())
    .bind(expected)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return missed(
            pool,
            "trip_stays",
            "trip_id = $1 AND id = $2",
            &[trip_id, stay_id],
            expected,
        )
        .await;
    };
    let mut stay = row_to_stay(&row)?;
    let mut sections = load_sections(pool, &[stay.id]).await?;
    stay.sections = sections.remove(&stay.id).unwrap_or_default();
    Ok(Outcome::Done(stay))
}

/// A trip always has somewhere to be, so its last base cannot go. The count
/// and the delete share the trip lock, or two deletes of the last two bases
/// would each see the other and both succeed.
pub async fn delete_stay(
    pool: &PgPool,
    trip_id: TripId,
    stay_id: TripStayId,
) -> Result<Outcome<()>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    if !lock_trip(&mut tx, trip_id).await? {
        return Ok(Outcome::NotFound);
    }

    let row = sqlx::query(
        "SELECT COUNT(*) AS n, bool_or(id = $2) AS present FROM trip_stays WHERE trip_id = $1",
    )
    .bind(trip_id)
    .bind(stay_id)
    .fetch_one(&mut *tx)
    .await?;
    if !row.try_get::<Option<bool>, _>("present")?.unwrap_or(false) {
        return Ok(Outcome::NotFound);
    }
    if row.try_get::<i64, _>("n")? <= 1 {
        return Ok(Outcome::Refused("A trip must keep at least one stay"));
    }

    sqlx::query("DELETE FROM trip_stays WHERE trip_id = $1 AND id = $2")
        .bind(trip_id)
        .bind(stay_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Outcome::Done(()))
}

/// Replaces the watch list, but edits it in place rather than rebuilding it:
/// a run that stays on the list keeps its row, and with it its id, its status
/// and its note. Rebuilding would hand every entry a new id on every reorder,
/// which breaks anything that points at one (a vote, a comment) and quietly
/// drops a "done" somebody else marked meanwhile.
///
/// Position is the order of `sections`; duplicates are the route's to reject.
pub async fn replace_stay_sections(
    pool: &PgPool,
    trip_id: TripId,
    stay_id: TripStayId,
    sections: &[TripSectionInput],
) -> Result<Option<Vec<TripSection>>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    // Locks the stay too, so two editors saving at once apply one after the
    // other instead of interleaving their positions.
    let exists =
        sqlx::query("SELECT 1 FROM trip_stays WHERE trip_id = $1 AND id = $2 FOR NO KEY UPDATE")
            .bind(trip_id)
            .bind(stay_id)
            .fetch_optional(&mut *tx)
            .await?;
    if exists.is_none() {
        return Ok(None);
    }

    // Moving entries past each other briefly doubles up a position; the rule
    // is checked when the whole reorder commits.
    sqlx::query("SET CONSTRAINTS trip_sections_stay_id_sort_order_key DEFERRED")
        .execute(&mut *tx)
        .await?;

    let keep: Vec<SectionId> = sections.iter().map(|s| s.section_id).collect();
    sqlx::query("DELETE FROM trip_sections WHERE stay_id = $1 AND NOT (section_id = ANY($2))")
        .bind(stay_id)
        .bind(&keep)
        .execute(&mut *tx)
        .await?;

    for (i, s) in sections.iter().enumerate() {
        // Status and note are kept when the entry omits them, so reordering
        // never resets a run somebody already marked.
        sqlx::query(
            "INSERT INTO trip_sections (stay_id, section_id, sort_order, status, note) \
             VALUES ($1, $2, $3, COALESCE($4, 'planned'), $6) \
             ON CONFLICT (stay_id, section_id) DO UPDATE SET \
                 sort_order = EXCLUDED.sort_order, \
                 status     = COALESCE($4, trip_sections.status), \
                 note       = CASE WHEN $5 THEN $6 ELSE trip_sections.note END, \
                 updated_at = NOW()",
        )
        .bind(stay_id)
        .bind(s.section_id)
        .bind(i as i32 + 1)
        .bind(s.status.as_ref())
        .bind(s.note.is_some())
        .bind(s.note.clone().flatten())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    let mut loaded = load_sections(pool, &[stay_id]).await?;
    Ok(Some(loaded.remove(&stay_id).unwrap_or_default()))
}
