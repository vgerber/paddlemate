//! Bases put up for the group to vote on, before any of them is a base.
//!
//! Every query here takes the trip as well as the candidate and filters on
//! both. A candidate id alone is not enough: ids are sequential, so a query
//! keyed on the id would let a member of one trip reach another trip's
//! candidates through their own trip's URL.

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::trip::*;

use super::stays::row_to_stay;
use super::{Outcome, missed};

const CANDIDATE_COLS: &str = "c.id, c.trip_id, c.kind, c.name, c.description, \
     ST_AsGeoJSON(c.location) AS location, c.arrival, c.departure, \
     c.proposed_by, u.username AS proposed_by_username, c.created_at, c.updated_at, \
     (SELECT COUNT(*) FROM trip_stay_candidate_votes v \
       WHERE v.candidate_id = c.id AND v.vote = 1) AS upvotes, \
     (SELECT COUNT(*) FROM trip_stay_candidate_votes v \
       WHERE v.candidate_id = c.id AND v.vote = -1) AS downvotes, \
     (SELECT json_agg(json_build_object('user_id', v.user_id, \
                                        'username', vu.username, \
                                        'vote', v.vote) \
                      ORDER BY v.vote DESC, vu.username) \
        FROM trip_stay_candidate_votes v \
        JOIN users vu ON vu.id = v.user_id \
       WHERE v.candidate_id = c.id) AS voters";

fn row_to_candidate(row: &PgRow) -> Result<TripStayCandidate, sqlx::Error> {
    Ok(TripStayCandidate {
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
        proposed_by: row.try_get("proposed_by")?,
        proposed_by_username: row.try_get("proposed_by_username")?,
        upvotes: row.try_get::<Option<i64>, _>("upvotes")?.unwrap_or(0),
        downvotes: row.try_get::<Option<i64>, _>("downvotes")?.unwrap_or(0),
        voters: row
            .try_get::<Option<serde_json::Value>, _>("voters")?
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default(),
        viewer_vote: row.try_get::<Option<i16>, _>("viewer_vote")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// Best supported first, because the list is the argument: a candidate three
/// people want sits above one nobody has looked at.
pub async fn list_candidates(
    pool: &PgPool,
    trip_id: TripId,
    viewer_id: &str,
) -> Result<Vec<TripStayCandidate>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {CANDIDATE_COLS}, \
                (SELECT v.vote FROM trip_stay_candidate_votes v \
                  WHERE v.candidate_id = c.id AND v.user_id = $2) AS viewer_vote \
           FROM trip_stay_candidates c \
           JOIN users u ON u.id = c.proposed_by \
          WHERE c.trip_id = $1 \
          ORDER BY (SELECT COUNT(*) FROM trip_stay_candidate_votes v \
                     WHERE v.candidate_id = c.id AND v.vote = 1) \
                 - (SELECT COUNT(*) FROM trip_stay_candidate_votes v \
                     WHERE v.candidate_id = c.id AND v.vote = -1) DESC, \
                 c.created_at"
    ))
    .bind(trip_id)
    .bind(viewer_id)
    .fetch_all(pool)
    .await?;
    rows.iter().map(row_to_candidate).collect()
}

pub async fn get_candidate(
    pool: &PgPool,
    trip_id: TripId,
    candidate_id: TripStayCandidateId,
    viewer_id: &str,
) -> Result<Option<TripStayCandidate>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "SELECT {CANDIDATE_COLS}, \
                (SELECT v.vote FROM trip_stay_candidate_votes v \
                  WHERE v.candidate_id = c.id AND v.user_id = $3) AS viewer_vote \
           FROM trip_stay_candidates c \
           JOIN users u ON u.id = c.proposed_by \
          WHERE c.trip_id = $1 AND c.id = $2"
    ))
    .bind(trip_id)
    .bind(candidate_id)
    .bind(viewer_id)
    .fetch_optional(pool)
    .await?;
    row.as_ref().map(row_to_candidate).transpose()
}

pub async fn create_candidate(
    pool: &PgPool,
    trip_id: TripId,
    user_id: &str,
    req: &CreateTripStayCandidateRequest,
) -> Result<Option<TripStayCandidate>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        "INSERT INTO trip_stay_candidates \
             (trip_id, kind, name, description, location, arrival, departure, proposed_by) \
         VALUES ($1, $2, $3, $4, \
                 CASE WHEN $5::text IS NULL THEN NULL \
                      ELSE ST_SetSRID(ST_GeomFromGeoJSON($5::text), 4326) END, \
                 $6, $7, $8) \
         RETURNING id",
    )
    .bind(trip_id)
    .bind(&req.kind)
    .bind(&req.name)
    .bind(req.description.as_deref())
    .bind(
        req.location
            .as_ref()
            .map(|g| serde_json::to_string(g).unwrap_or_default()),
    )
    .bind(req.arrival)
    .bind(req.departure)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    let id: TripStayCandidateId = row.try_get("id")?;

    // The proposer is for it, which saves everybody a click and makes the
    // count read as "three of us want this" rather than "three others do".
    // Same transaction, so a proposal never exists without its first vote.
    sqlx::query(
        "INSERT INTO trip_stay_candidate_votes (candidate_id, trip_id, user_id, vote) \
         VALUES ($1, $2, $3, 1)",
    )
    .bind(id)
    .bind(trip_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    get_candidate(pool, trip_id, id, user_id).await
}

/// Casts or replaces the caller's vote. Reports whether the candidate is in
/// this trip at all, so the route can answer 404 rather than write nothing.
pub async fn cast_vote(
    pool: &PgPool,
    trip_id: TripId,
    candidate_id: TripStayCandidateId,
    user_id: &str,
    vote: i16,
) -> Result<bool, sqlx::Error> {
    // Selecting from the candidate scopes the vote to this trip: an id from
    // another trip matches nothing and inserts nothing.
    let r = sqlx::query(
        "INSERT INTO trip_stay_candidate_votes (candidate_id, trip_id, user_id, vote) \
         SELECT c.id, c.trip_id, $3, $4 FROM trip_stay_candidates c \
          WHERE c.trip_id = $1 AND c.id = $2 \
         ON CONFLICT (candidate_id, user_id) DO UPDATE SET vote = EXCLUDED.vote",
    )
    .bind(trip_id)
    .bind(candidate_id)
    .bind(user_id)
    .bind(vote)
    .execute(pool)
    .await?;
    Ok(r.rows_affected() > 0)
}

pub async fn clear_vote(
    pool: &PgPool,
    trip_id: TripId,
    candidate_id: TripStayCandidateId,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "DELETE FROM trip_stay_candidate_votes \
          WHERE trip_id = $1 AND candidate_id = $2 AND user_id = $3",
    )
    .bind(trip_id)
    .bind(candidate_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_candidate(
    pool: &PgPool,
    trip_id: TripId,
    candidate_id: TripStayCandidateId,
) -> Result<bool, sqlx::Error> {
    let r = sqlx::query("DELETE FROM trip_stay_candidates WHERE trip_id = $1 AND id = $2")
        .bind(trip_id)
        .bind(candidate_id)
        .execute(pool)
        .await?;
    Ok(r.rows_affected() > 0)
}

/// Accepting is the whole point: the candidate becomes a base and stops being
/// a suggestion, in one transaction so the trip is never briefly holding both
/// or neither. With a version given, it accepts only the version the admin
/// was looking at - not one somebody reworded while they decided.
pub async fn accept_candidate(
    pool: &PgPool,
    trip_id: TripId,
    candidate_id: TripStayCandidateId,
    actor_id: &str,
    expected: Option<DateTime<Utc>>,
) -> Result<Outcome<TripStay>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        "INSERT INTO trip_stays \
             (trip_id, kind, name, description, location, arrival, departure, created_by) \
         SELECT c.trip_id, c.kind, c.name, c.description, c.location, c.arrival, c.departure, $3 \
           FROM trip_stay_candidates c \
          WHERE c.trip_id = $1 AND c.id = $2 \
            AND ($4::timestamptz IS NULL OR c.updated_at = $4) \
         RETURNING id, trip_id, kind, name, description, \
                   ST_AsGeoJSON(location) AS location, arrival, departure, \
                   created_by, created_at, updated_at",
    )
    .bind(trip_id)
    .bind(candidate_id)
    .bind(actor_id)
    .bind(expected)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(row) = row else {
        return missed(
            pool,
            "trip_stay_candidates",
            "trip_id = $1 AND id = $2",
            &[trip_id, candidate_id],
            expected,
        )
        .await;
    };

    sqlx::query("DELETE FROM trip_stay_candidates WHERE trip_id = $1 AND id = $2")
        .bind(trip_id)
        .bind(candidate_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(Outcome::Done(row_to_stay(&row)?))
}

/// Correcting somebody's suggestion. A candidate belongs to the trip rather
/// than to whoever typed it, so this takes no author check - the route only
/// asks for membership.
pub async fn update_candidate(
    pool: &PgPool,
    trip_id: TripId,
    candidate_id: TripStayCandidateId,
    viewer_id: &str,
    expected: Option<DateTime<Utc>>,
    req: &PatchTripStayCandidateRequest,
) -> Result<Outcome<TripStayCandidate>, sqlx::Error> {
    let row = sqlx::query(
        "UPDATE trip_stay_candidates SET \
             kind        = COALESCE($3, kind), \
             name        = COALESCE($4, name), \
             description = CASE WHEN $5 THEN $6 ELSE description END, \
             location    = CASE WHEN $7 \
                                THEN CASE WHEN $8::text IS NULL THEN NULL \
                                          ELSE ST_SetSRID(ST_GeomFromGeoJSON($8::text), 4326) END \
                                ELSE location END, \
             arrival     = CASE WHEN $9 THEN $10 ELSE arrival END, \
             departure   = CASE WHEN $11 THEN $12 ELSE departure END, \
             updated_at  = NOW() \
         WHERE trip_id = $1 AND id = $2 AND ($13::timestamptz IS NULL OR updated_at = $13) \
         RETURNING id",
    )
    .bind(trip_id)
    .bind(candidate_id)
    .bind(req.kind.as_ref())
    .bind(req.name.as_deref())
    .bind(req.description.is_some())
    .bind(req.description.clone().flatten())
    .bind(req.location.is_some())
    .bind(
        req.location
            .clone()
            .flatten()
            .map(|g| serde_json::to_string(&g).unwrap_or_default()),
    )
    .bind(req.arrival.is_some())
    .bind(req.arrival.flatten())
    .bind(req.departure.is_some())
    .bind(req.departure.flatten())
    .bind(expected)
    .fetch_optional(pool)
    .await?;

    if row.is_none() {
        return missed(
            pool,
            "trip_stay_candidates",
            "trip_id = $1 AND id = $2",
            &[trip_id, candidate_id],
            expected,
        )
        .await;
    }
    Ok(
        match get_candidate(pool, trip_id, candidate_id, viewer_id).await? {
            Some(c) => Outcome::Done(c),
            None => Outcome::NotFound,
        },
    )
}
