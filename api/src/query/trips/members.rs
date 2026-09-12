//! Who is on a trip, their role, and the days each of them can make.

use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::trip::*;

const MEMBER_SELECT: &str = "SELECT tm.trip_id, tm.user_id, u.username, tm.role::text AS role, \
     a.arrival, a.arrival_time, a.departure, a.departure_time, tm.created_at \
     FROM trip_members tm \
     JOIN users u ON u.id = tm.user_id \
     LEFT JOIN trip_member_attendance a \
            ON a.trip_id = tm.trip_id AND a.user_id = tm.user_id";

fn row_to_member(row: &PgRow) -> Result<TripMember, sqlx::Error> {
    Ok(TripMember {
        trip_id: row.try_get("trip_id")?,
        user_id: row.try_get("user_id")?,
        username: row.try_get("username")?,
        role: match row.try_get::<String, _>("role")?.as_str() {
            "admin" => TripMemberRole::Admin,
            _ => TripMemberRole::Member,
        },
        arrival: row.try_get("arrival")?,
        arrival_time: row.try_get("arrival_time")?,
        departure: row.try_get("departure")?,
        departure_time: row.try_get("departure_time")?,
        created_at: row.try_get("created_at")?,
    })
}

pub async fn list_members(pool: &PgPool, trip_id: TripId) -> Result<Vec<TripMember>, sqlx::Error> {
    sqlx::query(&format!(
        "{MEMBER_SELECT} WHERE tm.trip_id = $1 ORDER BY tm.role, u.username"
    ))
    .bind(trip_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(row_to_member)
    .collect()
}

pub async fn get_member(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
) -> Result<Option<TripMember>, sqlx::Error> {
    let row = sqlx::query(&format!("{MEMBER_SELECT} WHERE tm.trip_id = $1 AND tm.user_id = $2"))
        .bind(trip_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    row.as_ref().map(row_to_member).transpose()
}

/// Open join: anyone who may see the trip may join it as a member.
/// Adds somebody to a trip. Idempotent: adding an existing member is not an
/// error, the caller gets the membership either way.
pub async fn add_member(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
) -> Result<Option<TripMember>, sqlx::Error> {
    sqlx::query(
        "INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'member') \
         ON CONFLICT (trip_id, user_id) DO NOTHING",
    )
    .bind(trip_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    get_member(pool, trip_id, user_id).await
}

pub async fn admin_count(pool: &PgPool, trip_id: TripId) -> Result<i64, sqlx::Error> {
    let row = sqlx::query("SELECT COUNT(*) AS n FROM trip_members WHERE trip_id = $1 AND role = 'admin'")
        .bind(trip_id)
        .fetch_one(pool)
        .await?;
    row.try_get("n")
}

pub async fn remove_member(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2")
        .bind(trip_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn patch_member(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
    req: &PatchTripMemberRequest,
) -> Result<Option<TripMember>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    if let Some(role) = &req.role {
        let updated = sqlx::query(
            "UPDATE trip_members SET role = $3::trip_member_role, updated_at = NOW() \
             WHERE trip_id = $1 AND user_id = $2 RETURNING user_id",
        )
        .bind(trip_id)
        .bind(user_id)
        .bind(match role {
            TripMemberRole::Admin => "admin",
            TripMemberRole::Member => "member",
        })
        .fetch_optional(&mut *tx)
        .await?;
        if updated.is_none() {
            return Ok(None);
        }
    }

    let touches_attendance = req.arrival.is_some()
        || req.arrival_time.is_some()
        || req.departure.is_some()
        || req.departure_time.is_some();

    if touches_attendance {
        sqlx::query(
            "INSERT INTO trip_member_attendance \
                 (trip_id, user_id, arrival, arrival_time, departure, departure_time) \
             VALUES ($1, $2, $4, $6, $8, $10) \
             ON CONFLICT (trip_id, user_id) DO UPDATE SET \
                 arrival        = CASE WHEN $3 THEN $4 ELSE trip_member_attendance.arrival END, \
                 arrival_time   = CASE WHEN $5 THEN $6 ELSE trip_member_attendance.arrival_time END, \
                 departure      = CASE WHEN $7 THEN $8 ELSE trip_member_attendance.departure END, \
                 departure_time = CASE WHEN $9 THEN $10 ELSE trip_member_attendance.departure_time END, \
                 updated_at = NOW()",
        )
        .bind(trip_id)
        .bind(user_id)
        .bind(req.arrival.is_some())
        .bind(req.arrival.flatten())
        .bind(req.arrival_time.is_some())
        .bind(req.arrival_time.flatten())
        .bind(req.departure.is_some())
        .bind(req.departure.flatten())
        .bind(req.departure_time.is_some())
        .bind(req.departure_time.flatten())
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    get_member(pool, trip_id, user_id).await
}
