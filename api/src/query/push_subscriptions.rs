//! Where to push: one row per browser or phone that allowed notifications.

use sqlx::{PgPool, Row};

use crate::models::{
    notification::{PushSubscription, PushSubscriptionId},
    trip::TripId,
};

/// A subscription as the push sender needs it, keys included.
pub struct PushTarget {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// Devices one user may have push on. Every change is pushed to each, so the
/// count is what one account can make the server send.
pub const MAX_PER_USER: i64 = 10;

/// Saves a browser's subscription. The endpoint names the browser, so if it
/// signs in as someone else it moves to them rather than notifying both. Past
/// `MAX_PER_USER` the oldest of the user's devices makes way.
pub async fn upsert(
    pool: &PgPool,
    user_id: &str,
    endpoint: &str,
    p256dh: &str,
    auth: &str,
) -> Result<PushSubscription, sqlx::Error> {
    let mut tx = pool.begin().await?;
    // Two subscribes at once would each count the other's row as absent.
    sqlx::query("SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let row = sqlx::query(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4) \
         ON CONFLICT (endpoint) DO UPDATE \
             SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth \
         RETURNING id, endpoint, created_at",
    )
    .bind(user_id)
    .bind(endpoint)
    .bind(p256dh)
    .bind(auth)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN ( \
             SELECT id FROM push_subscriptions WHERE user_id = $1 \
             ORDER BY created_at DESC, id DESC LIMIT $2)",
    )
    .bind(user_id)
    .bind(MAX_PER_USER)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(PushSubscription {
        id: row.try_get("id")?,
        endpoint: row.try_get("endpoint")?,
        created_at: row.try_get("created_at")?,
    })
}

pub async fn list(pool: &PgPool, user_id: &str) -> Result<Vec<PushSubscription>, sqlx::Error> {
    sqlx::query("SELECT id, endpoint, created_at FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at")
        .bind(user_id)
        .fetch_all(pool)
        .await?
        .iter()
        .map(|r| {
            Ok(PushSubscription {
                id: r.try_get("id")?,
                endpoint: r.try_get("endpoint")?,
                created_at: r.try_get("created_at")?,
            })
        })
        .collect()
}

/// Only the caller's own: the id is looked up inside their subscriptions.
pub async fn delete(
    pool: &PgPool,
    user_id: &str,
    id: PushSubscriptionId,
) -> Result<bool, sqlx::Error> {
    let r = sqlx::query("DELETE FROM push_subscriptions WHERE user_id = $1 AND id = $2")
        .bind(user_id)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(r.rows_affected() > 0)
}

/// A subscription the push service no longer knows: the browser dropped it.
pub async fn forget(pool: &PgPool, endpoint: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM push_subscriptions WHERE endpoint = $1")
        .bind(endpoint)
        .execute(pool)
        .await?;
    Ok(())
}

/// Everyone on the trip except whoever made the change, on every device they
/// allowed.
pub async fn trip_targets(
    pool: &PgPool,
    trip_id: TripId,
    except: Option<&str>,
) -> Result<Vec<PushTarget>, sqlx::Error> {
    sqlx::query(
        "SELECT ps.endpoint, ps.p256dh, ps.auth FROM push_subscriptions ps \
           JOIN trip_members tm ON tm.user_id = ps.user_id AND tm.trip_id = $1 \
          WHERE ps.user_id IS DISTINCT FROM $2",
    )
    .bind(trip_id)
    .bind(except)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|r| {
        Ok(PushTarget {
            endpoint: r.try_get("endpoint")?,
            p256dh: r.try_get("p256dh")?,
            auth: r.try_get("auth")?,
        })
    })
    .collect()
}
