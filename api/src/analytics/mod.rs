//! Per-request analytics: one event per API call, shipped to ClickHouse.
//!
//! The tower layer lives in `metrics::track_requests` (same route and client
//! kind as the Prometheus series); this module builds the event and hands it
//! to a bounded channel that `jobs::analytics` drains. A full channel drops
//! the event: requests never wait. Privacy rules are in `event.rs`.
//!
//! The ingest client is plain reqwest (`INSERT ... FORMAT JSONEachRow`):
//! the `clickhouse` crate would bring its own row types and client for one
//! insert statement, and cannot express the schema file we apply at start.

pub mod event;
pub mod salt;

use std::sync::Arc;

use axum::{body::Body, http::Request};
use chrono::Utc;
use tokio::sync::mpsc;

pub use event::Event;
use salt::DailySalt;

use crate::{config::Config, layers::limit::RateLimits, metrics::ClientKind};

/// Events waiting for the batch task; beyond this they are dropped.
pub const QUEUE: usize = 10_000;

/// What is known before the handler runs.
pub struct Seen {
    started: std::time::Instant,
    ts: chrono::DateTime<Utc>,
    method: String,
    caller: String,
    ua_family: &'static str,
    query: std::collections::BTreeMap<String, String>,
}

#[derive(Clone)]
pub struct Sink {
    tx: mpsc::Sender<Event>,
    salt: Arc<DailySalt>,
    limits: RateLimits,
}

impl Sink {
    pub fn new(tx: mpsc::Sender<Event>, limits: RateLimits) -> Self {
        Self {
            tx,
            salt: Arc::new(DailySalt::new()),
            limits,
        }
    }

    /// Reads the request before it is handed on. The address and user agent
    /// are hashed here and go no further.
    pub fn see(&self, req: &Request<Body>, method: &str) -> Seen {
        let ts = Utc::now();
        let ip = self.limits.client_ip(req);
        let ua = req
            .headers()
            .get(axum::http::header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        Seen {
            started: std::time::Instant::now(),
            ts,
            method: method.to_string(),
            caller: self.salt.caller(ts.date_naive(), ip, ua),
            ua_family: event::ua_family(ua),
            query: event::allowed_query(req.uri().query().unwrap_or("")),
        }
    }

    /// Queues the finished event; a full queue drops it and counts that.
    pub fn record(&self, seen: Seen, route: &str, status: u16, client: ClientKind, bytes: u64) {
        let event = Event {
            ts: seen.ts.format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
            route: route.to_string(),
            method: seen.method,
            status,
            latency_ms: seen.started.elapsed().as_millis().min(u32::MAX as u128) as u32,
            client: client.as_str(),
            caller: seen.caller,
            ua_family: seen.ua_family,
            query: seen.query,
            bytes: bytes.min(u32::MAX as u64) as u32,
        };
        if self.tx.try_send(event).is_err() {
            dropped(1);
        }
    }
}

/// Counts events that never reached ClickHouse.
pub fn dropped(count: u64) {
    metrics::counter!("analytics_events_dropped_total").increment(count);
}

/// Starts the ingest task and returns the sink, or None when analytics is
/// off (no task, no channel, nothing sent).
pub fn start(config: &Config, limits: &RateLimits) -> Option<Sink> {
    let settings = config.analytics.clone()?;
    let (tx, rx) = mpsc::channel(QUEUE);
    tracing::info!("Request analytics on, database {}", settings.database);
    crate::jobs::analytics::run(settings, rx);
    Some(Sink::new(tx, limits.clone()))
}
