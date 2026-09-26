//! Links that let people join a trip without an admin adding them by name.
//!
//! Tokens are looked up by their hash only; the plain token exists once, in
//! the response that created it.

use sqlx::{PgPool, Row, postgres::PgRow};

use crate::{
    models::trip::*,
    query::tokens::{generate_token, hash_token},
};

use super::{Outcome, get_member};

const INVITE_COLS: &str = "i.id, i.trip_id, i.created_by, u.username AS created_by_username, \
     i.created_at, i.expires_at, i.uses";

fn row_to_invite(row: &PgRow) -> Result<TripInvite, sqlx::Error> {
    Ok(TripInvite {
        id: row.try_get("id")?,
        trip_id: row.try_get("trip_id")?,
        created_by: row.try_get("created_by")?,
        created_by_username: row.try_get("created_by_username")?,
        created_at: row.try_get("created_at")?,
        expires_at: row.try_get("expires_at")?,
        uses: row.try_get("uses")?,
    })
}

/// The links still working, newest first. Expired ones are not listed: they
/// can do nothing, and deleting them is not worth a job.
pub async fn list_invites(pool: &PgPool, trip_id: TripId) -> Result<Vec<TripInvite>, sqlx::Error> {
    sqlx::query(&format!(
        "SELECT {INVITE_COLS} FROM trip_invites i JOIN users u ON u.id = i.created_by \
          WHERE i.trip_id = $1 AND i.expires_at > NOW() \
          ORDER BY i.created_at DESC"
    ))
    .bind(trip_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(row_to_invite)
    .collect()
}

pub async fn create_invite(
    pool: &PgPool,
    trip_id: TripId,
    created_by: &str,
    days: i64,
) -> Result<TripInviteCreated, sqlx::Error> {
    let token = generate_token();
    let row = sqlx::query(&format!(
        "WITH i AS ( \
             INSERT INTO trip_invites (trip_id, token_hash, created_by, expires_at) \
             VALUES ($1, $2, $3, NOW() + make_interval(days => $4)) RETURNING * \
         ) SELECT {INVITE_COLS} FROM i JOIN users u ON u.id = i.created_by"
    ))
    .bind(trip_id)
    .bind(hash_token(&token))
    .bind(created_by)
    .bind(days as i32)
    .fetch_one(pool)
    .await?;
    Ok(TripInviteCreated {
        invite: row_to_invite(&row)?,
        token,
    })
}

pub async fn delete_invite(
    pool: &PgPool,
    trip_id: TripId,
    invite_id: TripInviteId,
) -> Result<bool, sqlx::Error> {
    let r = sqlx::query("DELETE FROM trip_invites WHERE trip_id = $1 AND id = $2")
        .bind(trip_id)
        .bind(invite_id)
        .execute(pool)
        .await?;
    Ok(r.rows_affected() > 0)
}

/// What a live link shows. `None` for a token that is unknown, expired or
/// withdrawn - one answer for all three, so a probe learns nothing.
pub async fn preview_invite(
    pool: &PgPool,
    token: &str,
    viewer_id: Option<&str>,
) -> Result<Option<TripInvitePreview>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT t.id, t.name, t.start_date, t.end_date, i.expires_at, \
                u.username AS invited_by, \
                EXISTS (SELECT 1 FROM trip_members tm \
                         WHERE tm.trip_id = t.id AND tm.user_id = $2) AS viewer_is_member \
           FROM trip_invites i \
           JOIN trips t ON t.id = i.trip_id \
           JOIN users u ON u.id = i.created_by \
          WHERE i.token_hash = $1 AND i.expires_at > NOW()",
    )
    .bind(hash_token(token))
    .bind(viewer_id)
    .fetch_optional(pool)
    .await?;

    row.map(|r| {
        Ok(TripInvitePreview {
            trip_id: r.try_get("id")?,
            name: r.try_get("name")?,
            start_date: r.try_get("start_date")?,
            end_date: r.try_get("end_date")?,
            invited_by: r.try_get("invited_by")?,
            expires_at: r.try_get("expires_at")?,
            viewer_is_member: r.try_get("viewer_is_member")?,
        })
    })
    .transpose()
}

/// Joins `user_id` to the trip through a link, reporting whether they are
/// new to it. The link must be live and
/// belong to *this* trip - a token for one trip is no key to another. Joining
/// again is not an error and does not count as another use.
pub async fn join_by_invite(
    pool: &PgPool,
    trip_id: TripId,
    token: &str,
    user_id: &str,
) -> Result<Outcome<(TripMember, bool)>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    // Locked, so a withdrawal that lands mid-join either wins or waits.
    let invite: Option<TripInviteId> = sqlx::query_scalar(
        "SELECT id FROM trip_invites \
          WHERE trip_id = $1 AND token_hash = $2 AND expires_at > NOW() \
          FOR UPDATE",
    )
    .bind(trip_id)
    .bind(hash_token(token))
    .fetch_optional(&mut *tx)
    .await?;
    let Some(invite_id) = invite else {
        return Ok(Outcome::NotFound);
    };

    let joined = sqlx::query(
        "INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'member') \
         ON CONFLICT (trip_id, user_id) DO NOTHING",
    )
    .bind(trip_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?
    .rows_affected()
        > 0;

    if joined {
        sqlx::query("UPDATE trip_invites SET uses = uses + 1 WHERE id = $1")
            .bind(invite_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    Ok(match get_member(pool, trip_id, user_id).await? {
        Some(member) => Outcome::Done((member, joined)),
        None => Outcome::NotFound,
    })
}
