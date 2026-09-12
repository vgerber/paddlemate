//! The bases a trip moves between, and the runs watched from each.

use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::trip::*;

pub(super) fn row_to_stay(row: &PgRow) -> Result<TripStay, sqlx::Error> {
    Ok(TripStay {
        id: row.try_get("id")?,
        trip_id: row.try_get("trip_id")?,
        kind: stay_kind_from_str(&row.try_get::<String, _>("kind")?),
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

const STAY_COLS: &str = "id, trip_id, kind::text AS kind, name, description, \
    ST_AsGeoJSON(location) AS location, arrival, departure, created_by, created_at, updated_at";

pub(super) async fn insert_stay(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    trip_id: TripId,
    user_id: &str,
    req: &crate::models::trip::CreateTripStayRequest,
) -> Result<TripStay, sqlx::Error> {
    let row = sqlx::query(&format!(
        "INSERT INTO trip_stays (trip_id, kind, name, description, location, arrival, departure, created_by) \
         VALUES ($1, $2::trip_stay_kind, $3, $4, \
                 CASE WHEN $5::double precision IS NULL OR $6::double precision IS NULL THEN NULL \
                      ELSE ST_SetSRID(ST_MakePoint($6, $5), 4326) END, \
                 $7, $8, $9) \
         RETURNING {STAY_COLS}"
    ))
    .bind(trip_id)
    .bind(stay_kind_str(&req.kind))
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

pub(super) fn stay_kind_str(kind: &TripStayKind) -> &'static str {
    match kind {
        TripStayKind::Camp => "camp",
        TripStayKind::Hotel => "hotel",
        TripStayKind::Bivouac => "bivouac",
        TripStayKind::HolidayHome => "holiday_home",
        TripStayKind::Other => "other",
    }
}

/// The inverse, kept beside it: a new kind needs both arms, and the fallback
/// here means the compiler cannot ask for the second one. A kind missing from
/// this match reads back as `other` and the write silently loses it.
pub(super) fn stay_kind_from_str(kind: &str) -> TripStayKind {
    match kind {
        "camp" => TripStayKind::Camp,
        "hotel" => TripStayKind::Hotel,
        "bivouac" => TripStayKind::Bivouac,
        "holiday_home" => TripStayKind::HolidayHome,
        _ => TripStayKind::Other,
    }
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
) -> Result<std::collections::HashMap<TripStayId, Vec<TripSection>>, sqlx::Error> {
    let mut out: std::collections::HashMap<TripStayId, Vec<TripSection>> =
        std::collections::HashMap::new();
    if stay_ids.is_empty() {
        return Ok(out);
    }

    let rows = sqlx::query(
        "SELECT ts.id, ts.stay_id, ts.section_id, ts.sort_order, ts.status::text AS status, ts.note, \
                ws.name AS section_name, w.name AS waterway_name, ws.waterway_id, \
                ST_AsGeoJSON(ws.location) AS section_location \
         FROM trip_sections ts \
         LEFT JOIN water_sections ws ON ws.id = ts.section_id \
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
            status: match r.try_get::<String, _>("status")?.as_str() {
                "optional" => TripSectionStatus::Optional,
                "done" => TripSectionStatus::Done,
                "skipped" => TripSectionStatus::Skipped,
                _ => TripSectionStatus::Planned,
            },
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
    req: &crate::models::trip::CreateTripStayRequest,
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
    req: &PatchTripStayRequest,
) -> Result<Option<TripStay>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "UPDATE trip_stays SET \
             kind        = COALESCE($3::trip_stay_kind, kind), \
             name        = COALESCE($4, name), \
             description = CASE WHEN $5 THEN $6 ELSE description END, \
             location    = CASE WHEN $7 THEN \
                                CASE WHEN $8::double precision IS NULL OR $9::double precision IS NULL \
                                     THEN NULL ELSE ST_SetSRID(ST_MakePoint($9, $8), 4326) END \
                           ELSE location END, \
             arrival     = CASE WHEN $10 THEN $11 ELSE arrival END, \
             departure   = CASE WHEN $12 THEN $13 ELSE departure END, \
             updated_at  = NOW() \
         WHERE trip_id = $1 AND id = $2 RETURNING {STAY_COLS}"
    ))
    .bind(trip_id)
    .bind(stay_id)
    .bind(req.kind.as_ref().map(stay_kind_str))
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
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };
    let mut stay = row_to_stay(&row)?;
    let mut sections = load_sections(pool, &[stay.id]).await?;
    stay.sections = sections.remove(&stay.id).unwrap_or_default();
    Ok(Some(stay))
}

pub async fn stay_count(pool: &PgPool, trip_id: TripId) -> Result<i64, sqlx::Error> {
    let row = sqlx::query("SELECT COUNT(*) AS n FROM trip_stays WHERE trip_id = $1")
        .bind(trip_id)
        .fetch_one(pool)
        .await?;
    row.try_get("n")
}

pub async fn delete_stay(
    pool: &PgPool,
    trip_id: TripId,
    stay_id: TripStayId,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM trip_stays WHERE trip_id = $1 AND id = $2")
        .bind(trip_id)
        .bind(stay_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn replace_stay_sections(
    pool: &PgPool,
    trip_id: TripId,
    stay_id: TripStayId,
    sections: &[TripSectionInput],
) -> Result<Option<Vec<TripSection>>, sqlx::Error> {
    let exists = sqlx::query("SELECT 1 FROM trip_stays WHERE trip_id = $1 AND id = $2")
        .bind(trip_id)
        .bind(stay_id)
        .fetch_optional(pool)
        .await?;
    if exists.is_none() {
        return Ok(None);
    }

    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM trip_sections WHERE stay_id = $1")
        .bind(stay_id)
        .execute(&mut *tx)
        .await?;

    for s in sections {
        sqlx::query(
            "INSERT INTO trip_sections (stay_id, section_id, sort_order, status, note) \
             VALUES ($1, $2, $3, COALESCE($4::trip_section_status, 'planned'), $5)",
        )
        .bind(stay_id)
        .bind(s.section_id)
        .bind(s.sort_order)
        .bind(s.status.as_ref().map(section_status_str))
        .bind(s.note.as_deref())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    let mut loaded = load_sections(pool, &[stay_id]).await?;
    Ok(Some(loaded.remove(&stay_id).unwrap_or_default()))
}

fn section_status_str(status: &TripSectionStatus) -> &'static str {
    match status {
        TripSectionStatus::Planned => "planned",
        TripSectionStatus::Optional => "optional",
        TripSectionStatus::Done => "done",
        TripSectionStatus::Skipped => "skipped",
    }
}
