//! Bases put up for the group to vote on, before any of them is a base.

use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::trip::*;

use super::stays::{row_to_stay, stay_kind_from_str, stay_kind_str};

const CANDIDATE_COLS: &str = "c.id, c.trip_id, c.kind::text AS kind, c.name, c.description, \
     ST_AsGeoJSON(c.location) AS location, c.arrival, c.departure, \
     c.proposed_by, u.username AS proposed_by_username, c.created_at, \
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
        kind: stay_kind_from_str(&row.try_get::<String, _>("kind")?),
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
    candidate_id: TripStayCandidateId,
    viewer_id: &str,
) -> Result<Option<TripStayCandidate>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "SELECT {CANDIDATE_COLS}, \
                (SELECT v.vote FROM trip_stay_candidate_votes v \
                  WHERE v.candidate_id = c.id AND v.user_id = $2) AS viewer_vote \
           FROM trip_stay_candidates c \
           JOIN users u ON u.id = c.proposed_by \
          WHERE c.id = $1"
    ))
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
    let row = sqlx::query(
        "INSERT INTO trip_stay_candidates \
             (trip_id, kind, name, description, location, arrival, departure, proposed_by) \
         VALUES ($1, $2::trip_stay_kind, $3, $4, \
                 CASE WHEN $5::text IS NULL THEN NULL \
                      ELSE ST_SetSRID(ST_GeomFromGeoJSON($5::text), 4326) END, \
                 $6, $7, $8) \
         RETURNING id",
    )
    .bind(trip_id)
    .bind(stay_kind_str(&req.kind))
    .bind(&req.name)
    .bind(req.description.as_deref())
    .bind(req.location.as_ref().map(|g| serde_json::to_string(g).unwrap_or_default()))
    .bind(req.arrival)
    .bind(req.departure)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    // The proposer is for it, which saves everybody a click and makes the
    // count read as "three of us want this" rather than "three others do".
    let id: TripStayCandidateId = row.try_get("id")?;
    cast_vote(pool, id, user_id, 1).await?;
    get_candidate(pool, id, user_id).await
}

pub async fn cast_vote(
    pool: &PgPool,
    candidate_id: TripStayCandidateId,
    user_id: &str,
    vote: i16,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO trip_stay_candidate_votes (candidate_id, user_id, vote) \
         VALUES ($1, $2, $3) \
         ON CONFLICT (candidate_id, user_id) DO UPDATE SET vote = EXCLUDED.vote",
    )
    .bind(candidate_id)
    .bind(user_id)
    .bind(vote)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn clear_vote(
    pool: &PgPool,
    candidate_id: TripStayCandidateId,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM trip_stay_candidate_votes WHERE candidate_id = $1 AND user_id = $2")
        .bind(candidate_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_candidate(
    pool: &PgPool,
    candidate_id: TripStayCandidateId,
) -> Result<bool, sqlx::Error> {
    let r = sqlx::query("DELETE FROM trip_stay_candidates WHERE id = $1")
        .bind(candidate_id)
        .execute(pool)
        .await?;
    Ok(r.rows_affected() > 0)
}

/// Accepting is the whole point: the candidate becomes a base and stops being
/// a suggestion, in one transaction so the trip is never briefly without it.
pub async fn accept_candidate(
    pool: &PgPool,
    candidate_id: TripStayCandidateId,
    actor_id: &str,
) -> Result<Option<TripStay>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        "INSERT INTO trip_stays \
             (trip_id, kind, name, description, location, arrival, departure, created_by) \
         SELECT c.trip_id, c.kind, c.name, c.description, c.location, c.arrival, c.departure, $2 \
           FROM trip_stay_candidates c WHERE c.id = $1 \
         RETURNING id, trip_id, kind::text AS kind, name, description, \
                   ST_AsGeoJSON(location) AS location, arrival, departure, \
                   created_by, created_at, updated_at",
    )
    .bind(candidate_id)
    .bind(actor_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    sqlx::query("DELETE FROM trip_stay_candidates WHERE id = $1")
        .bind(candidate_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(Some(row_to_stay(&row)?))
}

/// Correcting somebody's suggestion. A candidate belongs to the trip rather
/// than to whoever typed it, so this takes no author check - the route only
/// asks for membership.
pub async fn update_candidate(
    pool: &PgPool,
    candidate_id: TripStayCandidateId,
    viewer_id: &str,
    req: &PatchTripStayCandidateRequest,
) -> Result<Option<TripStayCandidate>, sqlx::Error> {
    let row = sqlx::query(
        "UPDATE trip_stay_candidates SET \
             kind        = COALESCE($2::trip_stay_kind, kind), \
             name        = COALESCE($3, name), \
             description = CASE WHEN $4 THEN $5 ELSE description END, \
             location    = CASE WHEN $6 \
                                THEN CASE WHEN $7::text IS NULL THEN NULL \
                                          ELSE ST_SetSRID(ST_GeomFromGeoJSON($7::text), 4326) END \
                                ELSE location END, \
             arrival     = CASE WHEN $8 THEN $9 ELSE arrival END, \
             departure   = CASE WHEN $10 THEN $11 ELSE departure END \
         WHERE id = $1 RETURNING id",
    )
    .bind(candidate_id)
    .bind(req.kind.as_ref().map(stay_kind_str))
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
    .fetch_optional(pool)
    .await?;

    if row.is_none() {
        return Ok(None);
    }
    get_candidate(pool, candidate_id, viewer_id).await
}
