//! Trip changes as the people on the trip hear about them: the rows behind
//! the bell, and how far each person has read.

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow, types::Json};

use crate::models::{
    notification::{EventSummary, LiveEvent, TripEvent, TripEventId, TripEventKind},
    trip::TripId,
    waterway::PaginatedResponse,
};

/// Every kind the bell lists; the rest only refresh open apps.
fn inbox_kinds() -> Vec<TripEventKind> {
    use TripEventKind::*;
    [
        TripChanged,
        MemberJoined,
        MemberLeft,
        MemberRemoved,
        AttendanceChanged,
        StayAdded,
        StayChanged,
        StayRemoved,
        WatchListChanged,
        CandidateProposed,
        CandidateChanged,
        CandidateVoted,
        CandidateAccepted,
        CandidateWithdrawn,
        LogLinked,
    ]
    .into_iter()
    .filter(|k| k.in_inbox())
    .collect()
}

pub async fn insert_event(
    pool: &PgPool,
    trip_id: TripId,
    actor_id: &str,
    kind: TripEventKind,
    summary: &EventSummary,
) -> Result<TripEventId, sqlx::Error> {
    sqlx::query_scalar(
        "INSERT INTO trip_events (trip_id, actor_id, kind, summary) \
         VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(trip_id)
    .bind(actor_id)
    .bind(kind)
    .bind(Json(summary))
    .fetch_one(pool)
    .await
}

/// The live-stream form of an event, read back after its NOTIFY.
pub async fn live_event(pool: &PgPool, id: TripEventId) -> Result<Option<LiveEvent>, sqlx::Error> {
    let row = sqlx::query("SELECT id, trip_id, kind, actor_id FROM trip_events WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    row.map(|r| {
        Ok(LiveEvent {
            id: r.try_get("id")?,
            trip_id: r.try_get("trip_id")?,
            kind: r.try_get("kind")?,
            actor_id: r.try_get("actor_id")?,
        })
    })
    .transpose()
}

/// A trip's name, for a push notification's title.
pub async fn trip_name(pool: &PgPool, trip_id: TripId) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT name FROM trips WHERE id = $1")
        .bind(trip_id)
        .fetch_optional(pool)
        .await
}

/// The events a person hears about: on trips they are on *now*, since they
/// joined each one, and not their own. Leaving a trip takes its history out
/// of the bell with it.
const VISIBLE: &str = "FROM trip_events e \
     JOIN trip_members tm ON tm.trip_id = e.trip_id AND tm.user_id = $1 \
     JOIN trips t ON t.id = e.trip_id \
     LEFT JOIN users u ON u.id = e.actor_id \
     LEFT JOIN notification_reads nr ON nr.user_id = $1 \
     WHERE e.created_at >= tm.created_at \
       AND e.actor_id IS DISTINCT FROM $1 \
       AND e.kind = ANY($2)";

fn row_to_event(row: &PgRow) -> Result<TripEvent, sqlx::Error> {
    Ok(TripEvent {
        id: row.try_get("id")?,
        trip_id: row.try_get("trip_id")?,
        trip_name: row.try_get("trip_name")?,
        actor_id: row.try_get("actor_id")?,
        actor_username: row.try_get("actor_username")?,
        kind: row.try_get("kind")?,
        summary: row.try_get::<Json<EventSummary>, _>("summary")?.0,
        created_at: row.try_get("created_at")?,
        unread: row.try_get("unread")?,
    })
}

pub async fn list_notifications(
    pool: &PgPool,
    user_id: &str,
    page: i64,
    per_page: i64,
) -> Result<PaginatedResponse<TripEvent>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT e.id, e.trip_id, t.name AS trip_name, e.actor_id, u.username AS actor_username, \
                e.kind, e.summary, e.created_at, \
                e.created_at > COALESCE(nr.read_until, '-infinity') AS unread, \
                COUNT(*) OVER () AS total_count \
         {VISIBLE} \
         ORDER BY e.created_at DESC, e.id DESC \
         LIMIT $3 OFFSET $4"
    ))
    .bind(user_id)
    .bind(inbox_kinds())
    .bind(per_page)
    .bind((page - 1) * per_page)
    .fetch_all(pool)
    .await?;

    let total: i64 = rows
        .first()
        .map(|r| r.try_get("total_count"))
        .transpose()?
        .unwrap_or(0);
    let items = rows.iter().map(row_to_event).collect::<Result<_, _>>()?;
    Ok(PaginatedResponse {
        items,
        total,
        page,
        per_page,
        total_pages: (total + per_page - 1) / per_page,
    })
}

pub async fn unread_state(
    pool: &PgPool,
    user_id: &str,
) -> Result<(i64, Option<DateTime<Utc>>), sqlx::Error> {
    let read_until: Option<DateTime<Utc>> =
        sqlx::query_scalar("SELECT read_until FROM notification_reads WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
    let unread: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) {VISIBLE} AND e.created_at > COALESCE(nr.read_until, '-infinity')"
    ))
    .bind(user_id)
    .bind(inbox_kinds())
    .fetch_one(pool)
    .await?;
    Ok((unread, read_until))
}

/// Moves the read mark forward, never back, and never past now - a mark in
/// the future would silently swallow changes that have not happened yet.
pub async fn mark_read(
    pool: &PgPool,
    user_id: &str,
    until: DateTime<Utc>,
) -> Result<DateTime<Utc>, sqlx::Error> {
    sqlx::query_scalar(
        "INSERT INTO notification_reads (user_id, read_until) VALUES ($1, LEAST($2, NOW())) \
         ON CONFLICT (user_id) DO UPDATE \
             SET read_until = GREATEST(notification_reads.read_until, EXCLUDED.read_until) \
         RETURNING read_until",
    )
    .bind(user_id)
    .bind(until)
    .fetch_one(pool)
    .await
}

/// Drops events older than `days`: what the bell shows, and all that is kept.
pub async fn prune(pool: &PgPool, days: i32) -> Result<u64, sqlx::Error> {
    let r =
        sqlx::query("DELETE FROM trip_events WHERE created_at < NOW() - make_interval(days => $1)")
            .bind(days)
            .execute(pool)
            .await?;
    Ok(r.rows_affected())
}

/// The trips `user_id` is on now: what a live stream may pass on.
pub async fn member_trips(pool: &PgPool, user_id: &str) -> Result<HashSet<TripId>, sqlx::Error> {
    let ids: Vec<TripId> =
        sqlx::query_scalar("SELECT trip_id FROM trip_members WHERE user_id = $1")
            .bind(user_id)
            .fetch_all(pool)
            .await?;
    Ok(ids.into_iter().collect())
}

/// Whether `user_id` is on the trip now - asked for every live event, so a
/// person removed mid-stream stops hearing about it at once.
pub async fn is_member(pool: &PgPool, trip_id: TripId, user_id: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2)",
    )
    .bind(trip_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
}
