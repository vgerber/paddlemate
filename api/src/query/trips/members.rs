//! Who is on a trip, their role, and the days each of them can make.

use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::trip::*;

use super::{Outcome, lock_trip};

const LAST_ADMIN: &str = "A trip must keep at least one admin";

const MEMBER_SELECT: &str = "SELECT tm.trip_id, tm.user_id, u.username, tm.role, \
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
        role: row.try_get("role")?,
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
    let row = sqlx::query(&format!(
        "{MEMBER_SELECT} WHERE tm.trip_id = $1 AND tm.user_id = $2"
    ))
    .bind(trip_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    row.as_ref().map(row_to_member).transpose()
}

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

/// Counts admins and reads the target's role inside the locked transaction,
/// so the "at least one admin" check and the write it guards cannot be split
/// by another admin leaving at the same moment.
async fn target_role(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    trip_id: TripId,
    user_id: &str,
) -> Result<Option<(TripMemberRole, i64)>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT tm.role, \
                (SELECT COUNT(*) FROM trip_members a \
                  WHERE a.trip_id = $1 AND a.role = 'admin') AS admins \
           FROM trip_members tm WHERE tm.trip_id = $1 AND tm.user_id = $2",
    )
    .bind(trip_id)
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await?;
    row.map(|r| Ok((r.try_get("role")?, r.try_get("admins")?)))
        .transpose()
}

/// Leaving, or being removed. Their attendance and their votes go with the
/// membership (the schema cascades both), their logs are unlinked from the
/// trip, and the last admin cannot go.
pub async fn remove_member(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
) -> Result<Outcome<()>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    if !lock_trip(&mut tx, trip_id).await? {
        return Ok(Outcome::NotFound);
    }
    match target_role(&mut tx, trip_id, user_id).await? {
        None => return Ok(Outcome::NotFound),
        Some((TripMemberRole::Admin, admins)) if admins <= 1 => {
            return Ok(Outcome::Refused(LAST_ADMIN));
        }
        Some(_) => {}
    }

    sqlx::query("DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2")
        .bind(trip_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Outcome::Done(()))
}

pub async fn patch_member(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
    req: &PatchTripMemberRequest,
) -> Result<Outcome<TripMember>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    if !lock_trip(&mut tx, trip_id).await? {
        return Ok(Outcome::NotFound);
    }
    let Some((current, admins)) = target_role(&mut tx, trip_id, user_id).await? else {
        return Ok(Outcome::NotFound);
    };

    if let Some(role) = &req.role {
        if current == TripMemberRole::Admin && *role == TripMemberRole::Member && admins <= 1 {
            return Ok(Outcome::Refused(LAST_ADMIN));
        }
        sqlx::query(
            "UPDATE trip_members SET role = $3, updated_at = NOW() \
             WHERE trip_id = $1 AND user_id = $2",
        )
        .bind(trip_id)
        .bind(user_id)
        .bind(role)
        .execute(&mut *tx)
        .await?;
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
    Ok(match get_member(pool, trip_id, user_id).await? {
        Some(m) => Outcome::Done(m),
        None => Outcome::NotFound,
    })
}
