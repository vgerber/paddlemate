//! The caller's notifications: the live stream, the bell's list and read
//! mark, and the devices they allowed push on. All "me" routes - none of it
//! can describe another user.

use std::{collections::HashSet, convert::Infallible, time::Duration};

use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::{HeaderValue, StatusCode},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
};
use futures_util::stream::{self, Stream, StreamExt};
use schemars::JsonSchema;
use serde::Deserialize;
use sqlx::PgPool;
use tokio::sync::broadcast::{self, error::RecvError};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        notification::{
            CreatePushSubscriptionRequest, LiveEvent, MarkReadRequest, NotificationState,
            PushSubscription, PushSubscriptionId, TripEvent,
        },
        trip::TripId,
        waterway::{PaginatedResponse, page_bounds},
    },
    notify::{StreamSlot, push},
    query::{notifications, push_subscriptions},
    state::AppState,
};

/// Everything a live stream can say.
enum Said {
    Event(LiveEvent),
    /// The stream fell behind and dropped events: refetch everything.
    Resync,
}

/// How long one stream lives at most. It also ends when the caller's token
/// does, so a revoked API key or a signed-out session stops listening within
/// this time; the client reconnects with a fresh token.
const STREAM_LIFETIME: Duration = Duration::from_secs(15 * 60);

/// How long a stream may run for a token with `token_left` seconds to go.
fn lifetime(token_left: i64) -> Duration {
    STREAM_LIFETIME.min(Duration::from_secs(token_left.max(0) as u64))
}

/// One open stream: what it listens to, and which trips it may pass on.
struct Listening {
    rx: broadcast::Receiver<LiveEvent>,
    pool: PgPool,
    user_id: String,
    trips: HashSet<TripId>,
    _slot: StreamSlot,
}

impl Listening {
    /// The next event this caller may hear. Membership is held per stream and
    /// reloaded whenever anyone's membership changes, so somebody removed
    /// from a trip stops hearing about it at once, not at their next
    /// reconnect - without a query per event per stream.
    async fn next(&mut self) -> Option<Said> {
        loop {
            let event = match self.rx.recv().await {
                Ok(event) => event,
                Err(RecvError::Lagged(_)) => {
                    self.reload().await;
                    return Some(Said::Resync);
                }
                Err(RecvError::Closed) => return None,
            };
            if event.kind.changes_membership() {
                self.reload().await;
            }
            if self.trips.contains(&event.trip_id) {
                return Some(Said::Event(event));
            }
        }
    }

    async fn reload(&mut self) {
        match notifications::member_trips(&self.pool, &self.user_id).await {
            Ok(trips) => self.trips = trips,
            // Failing closed: better a missed refresh than another trip's.
            Err(err) => {
                tracing::warn!("Live stream membership reload failed: {}", err);
                self.trips.clear();
            }
        }
    }
}

/// Trip changes as they happen, as server-sent events: `trip_event` with a
/// `LiveEvent`, or `resync` when the stream fell behind.
pub async fn stream_events(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> Response {
    let user_id = token.user_id().to_string();
    let Some(slot) = app.live_streams.open(&user_id) else {
        return ApiError::too_many_requests("Too many live streams open").into_response();
    };
    // Subscribed before the trips are read, so a join in between is heard.
    let rx = app.live_events.subscribe();
    let trips = match notifications::member_trips(&app.pg_pool, &user_id).await {
        Ok(trips) => trips,
        Err(err) => return ApiError::from_db("opening a live stream", err).into_response(),
    };
    let lifetime = lifetime((token.0.expires_at - time::OffsetDateTime::now_utc()).whole_seconds());

    let listening = Listening {
        rx,
        pool: app.pg_pool.clone(),
        user_id,
        trips,
        _slot: slot,
    };
    let events = stream::unfold(listening, |mut l| async move {
        let said = l.next().await?;
        Some((said, l))
    })
    .map(|said| {
        Ok::<_, Infallible>(match said {
            Said::Event(event) => Event::default()
                .event("trip_event")
                .json_data(&event)
                .unwrap_or_else(|_| Event::default().event("resync")),
            Said::Resync => Event::default().event("resync"),
        })
    });

    // Says the stream is open, so the client knows it is live before the
    // first change arrives.
    let opened = stream::once(async { Ok::<_, Infallible>(Event::default().event("connected")) });
    let body: std::pin::Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>> = Box::pin(
        opened
            .chain(events)
            .take_until(tokio::time::sleep(lifetime)),
    );

    let mut res = Sse::new(body)
        // Proxies drop idle connections; a comment every 20s keeps it open.
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(20)))
        .into_response();
    // nginx and friends buffer responses by default, which holds events back
    // until the buffer fills. This asks them not to.
    res.headers_mut()
        .insert("X-Accel-Buffering", HeaderValue::from_static("no"));
    res
}

doc_fn!(stream_events_docs, op =>
    op.description("Server-sent events for the caller's trips. `event: trip_event` carries a `LiveEvent` (what changed, on which trip); `event: resync` means events were missed and everything should be refetched; `event: connected` opens the stream. Only trips the caller is on, re-checked whenever membership changes. The stream ends after 15 minutes or when the token expires, whichever is first: reconnect with a fresh token. At most 10 streams per user; 429 beyond.")
        .response_with::<200, Json<LiveEvent>, _>(|res| res.description("A text/event-stream of LiveEvent objects"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<429, Json<ErrorResponse>, _>(|res| res.description("Too many streams open"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Notifications")
);

#[derive(Debug, Deserialize, JsonSchema)]
pub struct NotificationsQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

pub async fn list_notifications(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Query(q): Query<NotificationsQuery>,
) -> impl IntoApiResponse {
    let (page, per_page) = page_bounds(q.page, q.per_page, 25);
    match notifications::list_notifications(&app.pg_pool, token.user_id(), page, per_page).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => ApiError::from_db("listing notifications", err).into_response(),
    }
}

doc_fn!(list_notifications_docs, op =>
    op.input::<Query<NotificationsQuery>>()
        .description("What changed on the caller's trips while they were away, newest first: changes by others, on trips they are on now, since they joined each. `unread` marks what is newer than their read mark. Votes are left out - they only refresh live.")
        .response::<200, Json<PaginatedResponse<TripEvent>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Notifications")
);

async fn state_for(app: &AppState, user_id: &str) -> Result<NotificationState, sqlx::Error> {
    let (unread_count, read_until) = notifications::unread_state(&app.pg_pool, user_id).await?;
    Ok(NotificationState {
        unread_count,
        read_until,
        push_public_key: app.push.as_ref().map(|p| p.public_key().to_string()),
    })
}

pub async fn get_notification_state(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    match state_for(&app, token.user_id()).await {
        Ok(state) => Json(state).into_response(),
        Err(err) => ApiError::from_db("reading notification state", err).into_response(),
    }
}

doc_fn!(get_notification_state_docs, op =>
    op.description("The bell: how many unread changes, the caller's read mark, and the server's push key (absent when this server does not send push).")
        .response::<200, Json<NotificationState>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Notifications")
);

pub async fn put_notification_state(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Json(body): Json<MarkReadRequest>,
) -> impl IntoApiResponse {
    let user_id = token.user_id();
    if let Err(err) = notifications::mark_read(&app.pg_pool, user_id, body.read_until).await {
        return ApiError::from_db("marking notifications read", err).into_response();
    }
    match state_for(&app, user_id).await {
        Ok(state) => Json(state).into_response(),
        Err(err) => ApiError::from_db("reading notification state", err).into_response(),
    }
}

doc_fn!(put_notification_state_docs, op =>
    op.description("Marks everything up to `read_until` read. The mark only moves forward and never past now.")
        .response::<200, Json<NotificationState>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Notifications")
);

pub async fn list_push_subscriptions(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    match push_subscriptions::list(&app.pg_pool, token.user_id()).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => ApiError::from_db("listing push subscriptions", err).into_response(),
    }
}

doc_fn!(list_push_subscriptions_docs, op =>
    op.description("The devices the caller allowed notifications on.")
        .response::<200, Json<Vec<PushSubscription>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Notifications")
);

pub async fn create_push_subscription(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Json(body): Json<CreatePushSubscriptionRequest>,
) -> impl IntoApiResponse {
    if app.push.is_none() {
        return ApiError::conflict("This server does not send push notifications").into_response();
    }
    if !push::is_push_endpoint(&body.endpoint) {
        return ApiError::validation(
            "endpoint must be a push service URL from PushManager.subscribe",
        )
        .with_target("endpoint")
        .into_response();
    }
    if !push::are_push_keys(&body.keys.p256dh, &body.keys.auth) {
        return ApiError::validation("keys.p256dh and keys.auth must be the browser's push keys")
            .with_target("keys")
            .into_response();
    }

    match push_subscriptions::upsert(
        &app.pg_pool,
        token.user_id(),
        &body.endpoint,
        &body.keys.p256dh,
        &body.keys.auth,
    )
    .await
    {
        Ok(sub) => (StatusCode::CREATED, Json(sub)).into_response(),
        Err(err) => ApiError::from_db("saving a push subscription", err).into_response(),
    }
}

doc_fn!(create_push_subscription_docs, op =>
    op.description("Allows push on this device: send the browser's `PushSubscription.toJSON()`. The endpoint must be a known push service (FCM, Mozilla, Apple, Windows). The same browser subscribing again replaces its entry, also when it now belongs to another user. A user keeps at most 10 devices; the oldest makes way. 409 when this server does not send push.")
        .response_with::<201, Json<PushSubscription>, _>(|res| res.description("Saved"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<409, Json<ErrorResponse>, _>(|res| res.description("Push is not configured"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Notifications")
);

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PushSubscriptionPath {
    pub subscription_id: PushSubscriptionId,
}

pub async fn delete_push_subscription(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(PushSubscriptionPath { subscription_id }): Path<PushSubscriptionPath>,
) -> impl IntoApiResponse {
    match push_subscriptions::delete(&app.pg_pool, token.user_id(), subscription_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => ApiError::from_db("removing a push subscription", err).into_response(),
    }
}

doc_fn!(delete_push_subscription_docs, op =>
    op.input::<Path<PushSubscriptionPath>>()
        .description("Stops push on one of the caller's devices.")
        .response_with::<204, (), _>(|res| res.description("Removed"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Notifications")
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stream_ends_with_its_token() {
        assert_eq!(lifetime(60), Duration::from_secs(60));
        assert_eq!(lifetime(-5), Duration::ZERO);
        assert_eq!(lifetime(24 * 60 * 60), STREAM_LIFETIME);
    }
}
