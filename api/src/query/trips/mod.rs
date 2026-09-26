//! The trip itself. The tables below it - members, bases, candidates - get a
//! module each, mirroring the routes that serve them, and are re-exported
//! here so callers keep saying `trips::list_stays` rather than learning the
//! layout.

pub mod candidates;
pub mod invites;
pub mod members;
pub mod stays;

pub use candidates::*;
pub use invites::*;
pub use members::*;
pub use stays::*;

use stays::insert_stay;

use sqlx::{PgPool, Row, postgres::PgRow};

use chrono::{DateTime, Utc};

use crate::models::{
    trip::{CreateTripRequest, PatchTripRequest, Trip, TripId, TripMemberRole},
    waterway::PaginatedResponse,
};

/// What a guarded or versioned write came to. Routes map each arm to one
/// status, so every trips endpoint answers the same situation the same way.
#[derive(Debug)]
pub enum Outcome<T> {
    Done(T),
    NotFound,
    /// The row changed since the caller read it: their `If-Match` is stale.
    Stale,
    /// Refused to break a rule the trip depends on - its last admin, its
    /// last base. Carries the sentence to show.
    Refused(&'static str),
}

/// Serialises the writes that guard a trip-wide rule ("at least one admin",
/// "at least one base"): each takes this lock before counting, so two of them
/// can no longer both pass the check and both land. NO KEY UPDATE, so
/// ordinary inserts that only reference the trip are not held up.
pub(super) async fn lock_trip(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    trip_id: TripId,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query("SELECT 1 FROM trips WHERE id = $1 FOR NO KEY UPDATE")
        .bind(trip_id)
        .fetch_optional(&mut **tx)
        .await?;
    Ok(row.is_some())
}

/// A trip is visible to the people in it, and to nobody else. `viewer` is
/// the placeholder holding their id, so one predicate serves every query.
fn member_clause(viewer: &str) -> String {
    format!(
        "EXISTS (SELECT 1 FROM trip_members tm WHERE tm.trip_id = trips.id AND tm.user_id = {viewer})"
    )
}

/// Counts ride along as subqueries so a listing stays one round trip. The
/// descent count is logs, not runs: every paddler keeps their own.
fn trip_cols(viewer: &str) -> String {
    format!(
        "trips.id, trips.name, trips.description, trips.start_date, trips.end_date, \
         trips.created_by, trips.created_at, trips.updated_at, \
         (SELECT COUNT(*) FROM trip_members tm WHERE tm.trip_id = trips.id) AS member_count, \
         (SELECT COUNT(*) FROM descents d WHERE d.trip_id = trips.id) AS descent_count, \
         (SELECT tm.role FROM trip_members tm \
          WHERE tm.trip_id = trips.id AND tm.user_id = {viewer}) AS viewer_role"
    )
}

fn row_to_trip(row: &PgRow) -> Result<Trip, sqlx::Error> {
    // Decoded as the enum, not matched from text: a role this build does not
    // know must fail rather than quietly read as `member`.
    let viewer_role: Option<TripMemberRole> = row.try_get("viewer_role")?;
    Ok(Trip {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        start_date: row.try_get("start_date")?,
        end_date: row.try_get("end_date")?,
        created_by: row.try_get("created_by")?,
        viewer_role,
        member_count: row.try_get::<Option<i64>, _>("member_count")?.unwrap_or(0),
        descent_count: row.try_get::<Option<i64>, _>("descent_count")?.unwrap_or(0),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub async fn member_role(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
) -> Result<Option<TripMemberRole>, sqlx::Error> {
    let row = sqlx::query("SELECT role FROM trip_members WHERE trip_id = $1 AND user_id = $2")
        .bind(trip_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    row.map(|r| r.try_get("role")).transpose()
}

pub async fn create_trip(
    pool: &PgPool,
    user_id: &str,
    req: &CreateTripRequest,
) -> Result<Trip, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        "INSERT INTO trips (name, description, start_date, end_date, created_by) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, name, description, start_date, end_date, created_by, \
                   created_at, updated_at, \
                   0::bigint AS member_count, 0::bigint AS descent_count, \
                   NULL::trip_member_role AS viewer_role",
    )
    .bind(&req.name)
    .bind(req.description.as_deref())
    .bind(req.start_date)
    .bind(req.end_date)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;

    let mut trip = row_to_trip(&row)?;

    // The creator is the first admin: ownership is a membership row, so it can
    // be handed over without touching the trip.
    sqlx::query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'admin')")
        .bind(trip.id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    insert_stay(&mut tx, trip.id, user_id, &req.stay).await?;

    tx.commit().await?;

    // Counted before the creator's own membership row existed.
    trip.member_count = 1;
    trip.viewer_role = Some(TripMemberRole::Admin);
    Ok(trip)
}

pub async fn get_trip_for_viewer(
    pool: &PgPool,
    trip_id: TripId,
    vid: &str,
) -> Result<Option<Trip>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "SELECT {} FROM trips WHERE trips.id = $1 AND {}",
        trip_cols("$2"),
        member_clause("$2")
    ))
    .bind(trip_id)
    .bind(vid)
    .fetch_optional(pool)
    .await?;

    match row {
        None => Ok(None),
        Some(r) => Ok(Some(row_to_trip(&r)?)),
    }
}

pub struct ListFilters {
    pub from: Option<chrono::NaiveDate>,
    pub to: Option<chrono::NaiveDate>,
    pub page: i64,
    pub per_page: i64,
}

pub async fn list_trips_for_viewer(
    pool: &PgPool,
    vid: &str,
    filters: ListFilters,
) -> Result<PaginatedResponse<Trip>, sqlx::Error> {
    let offset = filters.page.saturating_sub(1) * filters.per_page;

    let rows = sqlx::query(&format!(
        "SELECT {}, COUNT(*) OVER() AS total_count FROM trips \
         WHERE {} \
           AND ($2::date IS NULL OR COALESCE(trips.end_date, trips.start_date) >= $2) \
           AND ($3::date IS NULL OR trips.start_date <= $3) \
         ORDER BY trips.start_date DESC, trips.id DESC \
         LIMIT $4 OFFSET $5",
        trip_cols("$1"),
        member_clause("$1")
    ))
    .bind(vid)
    .bind(filters.from)
    .bind(filters.to)
    .bind(filters.per_page)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    finish_list(rows, filters)
}

/// Nothing here touches the database any more - the page is assembled from
/// rows the listing already fetched.
fn finish_list(
    rows: Vec<PgRow>,
    filters: ListFilters,
) -> Result<PaginatedResponse<Trip>, sqlx::Error> {
    let total: i64 = rows
        .first()
        .and_then(|r| r.try_get::<Option<i64>, _>("total_count").ok().flatten())
        .unwrap_or(0);

    let mut items = Vec::with_capacity(rows.len());
    for r in &rows {
        items.push(row_to_trip(r)?);
    }

    Ok(PaginatedResponse {
        items,
        total,
        page: filters.page,
        per_page: filters.per_page,
        total_pages: (total + filters.per_page - 1) / filters.per_page,
    })
}

pub async fn patch_trip(
    pool: &PgPool,
    trip_id: TripId,
    actor_id: &str,
    expected: Option<DateTime<Utc>>,
    req: &PatchTripRequest,
) -> Result<Outcome<Trip>, sqlx::Error> {
    let row = sqlx::query(
        "UPDATE trips SET \
             name         = COALESCE($2, name), \
             description  = CASE WHEN $3 THEN $4 ELSE description END, \
             start_date   = COALESCE($5, start_date), \
             end_date     = CASE WHEN $6 THEN $7 ELSE end_date END, \
             updated_at   = NOW() \
         WHERE id = $1 AND ($8::timestamptz IS NULL OR updated_at = $8) \
         RETURNING id",
    )
    .bind(trip_id)
    .bind(req.name.as_deref())
    .bind(req.description.is_some())
    .bind(req.description.clone().flatten())
    .bind(req.start_date)
    .bind(req.end_date.is_some())
    .bind(req.end_date.flatten())
    .bind(expected)
    .fetch_optional(pool)
    .await?;

    if row.is_none() {
        return missed(pool, "trips", "id = $1", &[trip_id], expected).await;
    }
    Ok(match get_trip_for_viewer(pool, trip_id, actor_id).await? {
        Some(trip) => Outcome::Done(trip),
        None => Outcome::NotFound,
    })
}

/// Why a versioned UPDATE touched nothing: the row is gone, or it is there
/// but at another version. Only worth asking when a version was given.
/// `key` is a fixed predicate over `$1..$n`, bound from `ids` in order - it
/// must scope by trip as the UPDATE did, or another trip's row would read as
/// "stale" and give its existence away.
pub(super) async fn missed<T>(
    pool: &PgPool,
    table: &'static str,
    key: &'static str,
    ids: &[i64],
    expected: Option<DateTime<Utc>>,
) -> Result<Outcome<T>, sqlx::Error> {
    if expected.is_none() {
        return Ok(Outcome::NotFound);
    }
    let sql = format!("SELECT 1 FROM {table} WHERE {key}");
    let mut q = sqlx::query(&sql);
    for id in ids {
        q = q.bind(*id);
    }
    let exists = q.fetch_optional(pool).await?;
    Ok(if exists.is_some() {
        Outcome::Stale
    } else {
        Outcome::NotFound
    })
}

pub async fn delete_trip(pool: &PgPool, trip_id: TripId) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM trips WHERE id = $1")
        .bind(trip_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
