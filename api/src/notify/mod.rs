//! Telling the people on a trip what changed.
//!
//! A change is recorded as a `trip_events` row. Its insert trigger NOTIFYs on
//! commit; every API instance LISTENs and hands the event to its open live
//! streams. Kinds that matter also go out as web push, from the instance that
//! recorded them, so a phone buzzes once however many instances are running.

pub mod push;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use sqlx::{PgPool, postgres::PgListener};
use tokio::sync::broadcast;

use crate::{
    models::{
        notification::{EventSummary, LiveEvent, TripEventKind, describe},
        trip::TripId,
    },
    query::{notifications, push_subscriptions},
    state::AppState,
};

use push::{Delivery, PushService};

/// The NOTIFY channel the `trip_events` trigger announces on.
const CHANNEL: &str = "trip_events";

/// How many live events a slow stream may fall behind before it is told to
/// refetch everything instead.
pub const LIVE_BUFFER: usize = 256;

/// Live streams one user may hold open on one instance: a phone, a laptop and
/// a few tabs. Each is a connection and a broadcast receiver the server keeps.
pub const MAX_STREAMS_PER_USER: usize = 10;

/// Who holds how many live streams on this instance.
#[derive(Default)]
pub struct LiveStreams(Mutex<HashMap<String, usize>>);

/// One held stream; dropping it gives the slot back.
pub struct StreamSlot {
    streams: Arc<LiveStreams>,
    user_id: String,
}

impl LiveStreams {
    /// A slot for `user_id`, or `None` when they already hold the maximum.
    pub fn open(self: &Arc<Self>, user_id: &str) -> Option<StreamSlot> {
        let mut held = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let n = held.entry(user_id.to_string()).or_default();
        if *n >= MAX_STREAMS_PER_USER {
            return None;
        }
        *n += 1;
        Some(StreamSlot {
            streams: self.clone(),
            user_id: user_id.to_string(),
        })
    }
}

impl Drop for StreamSlot {
    fn drop(&mut self) {
        let mut held = self.streams.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(n) = held.get_mut(&self.user_id) {
            *n -= 1;
            if *n == 0 {
                held.remove(&self.user_id);
            }
        }
    }
}

/// Records a change after it happened. Never fails the request that made the
/// change: the change stands either way, and a lost notification is logged.
pub async fn record(
    app: &AppState,
    trip_id: TripId,
    actor_id: &str,
    kind: TripEventKind,
    summary: EventSummary,
) {
    if let Err(err) =
        notifications::insert_event(&app.pg_pool, trip_id, actor_id, kind, &summary).await
    {
        tracing::error!("Could not record trip {} {:?}: {}", trip_id, kind, err);
        return;
    }
    if !kind.pushes() {
        return;
    }
    let Some(push) = app.push.clone() else { return };
    let pool = app.pg_pool.clone();
    let actor_id = actor_id.to_string();
    tokio::spawn(async move {
        fan_out(&pool, &push, trip_id, &actor_id, kind, &summary).await;
    });
}

/// Pushes one change to every device of everyone else on the trip.
async fn fan_out(
    pool: &PgPool,
    push: &PushService,
    trip_id: TripId,
    actor_id: &str,
    kind: TripEventKind,
    summary: &EventSummary,
) {
    let (trip, actor, targets) = match tokio::try_join!(
        notifications::trip_name(pool, trip_id),
        sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id = $1")
            .bind(actor_id)
            .fetch_optional(pool),
        push_subscriptions::trip_targets(pool, trip_id, Some(actor_id)),
    ) {
        Ok(found) => found,
        Err(err) => {
            tracing::error!(
                "Could not gather push targets for trip {}: {}",
                trip_id,
                err
            );
            return;
        }
    };
    let Some(trip) = trip else { return };
    let payload = serde_json::json!({
        "title": trip,
        "body": describe(kind, actor.as_deref().unwrap_or("Someone"), summary),
        "url": format!("/trips/{trip_id}"),
        // One notification per trip on the lock screen, replaced by the next.
        "tag": format!("trip-{trip_id}"),
    })
    .to_string();

    for target in targets {
        match push.send(&target, payload.as_bytes()).await {
            Delivery::Sent => {}
            Delivery::Gone => {
                tracing::info!("Dropping a push subscription its push service no longer knows");
                if let Err(err) = push_subscriptions::forget(pool, &target.endpoint).await {
                    tracing::warn!("Could not drop a dead push subscription: {}", err);
                }
            }
            Delivery::Failed(err) => tracing::warn!("Push for trip {} failed: {}", trip_id, err),
        }
    }
}

/// LISTENs for recorded events and hands each to this instance's live
/// streams. Runs for the life of the server; a lost connection is retried,
/// and streams that missed events meanwhile are told to refetch.
pub async fn run_listener(pool: PgPool, live: broadcast::Sender<LiveEvent>) {
    let mut backoff = Duration::from_secs(1);
    loop {
        match listen(&pool, &live).await {
            Ok(()) => backoff = Duration::from_secs(1),
            Err(err) => {
                tracing::warn!("Live events listener lost its connection: {}", err);
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(Duration::from_secs(60));
            }
        }
    }
}

async fn listen(pool: &PgPool, live: &broadcast::Sender<LiveEvent>) -> Result<(), sqlx::Error> {
    let mut listener = PgListener::connect_with(pool).await?;
    listener.listen(CHANNEL).await?;
    loop {
        let note = listener.recv().await?;
        let Ok(id) = note.payload().parse() else {
            continue;
        };
        if let Some(event) = notifications::live_event(pool, id).await? {
            // No receivers is fine: nobody has the app open.
            let _ = live.send(event);
        }
    }
}

/// How long a change is kept, and so how far back the bell reaches.
pub const KEEP_DAYS: i32 = 180;

/// Prunes old events once a day, for the life of the server.
pub async fn run_pruner(pool: PgPool) {
    let mut daily = tokio::time::interval(Duration::from_secs(24 * 60 * 60));
    loop {
        daily.tick().await;
        match notifications::prune(&pool, KEEP_DAYS).await {
            Ok(0) => {}
            Ok(n) => tracing::info!("Pruned {} trip events older than {} days", n, KEEP_DAYS),
            Err(err) => tracing::warn!("Could not prune trip events: {}", err),
        }
    }
}

/// Starts push when configured. Kept here so `main` and the tests build the
/// same way.
pub fn push_from_env() -> Option<Arc<PushService>> {
    let push = PushService::from_env().map(Arc::new);
    if push.is_none() {
        tracing::info!("VAPID_PRIVATE_KEY/VAPID_SUBJECT not set: web push is off");
    }
    push
}
