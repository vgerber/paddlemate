//! Background tasks started once at boot.

use std::time::Duration;

use crate::{config::Config, layers::limit::RateLimits, state::AppState};

/// How often idle callers are dropped from the rate limiter.
const LIMITER_PRUNE_INTERVAL: Duration = Duration::from_secs(60);

/// Starts every background task. Each runs for the life of the server.
pub fn spawn_all(state: &AppState, config: &Config, limits: &RateLimits) {
    let db = state.pg_pool.clone();

    // Trip changes reach open apps through this instance's live streams.
    tokio::spawn(crate::notify::run_listener(
        db.clone(),
        state.live_events.clone(),
    ));
    tokio::spawn(crate::notify::run_pruner(db.clone()));
    tokio::spawn(crate::query::history::run_pruner(db.clone()));

    let limits = limits.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(LIMITER_PRUNE_INTERVAL);
        loop {
            tick.tick().await;
            limits.prune();
        }
    });

    if config.disable_gauge_readers {
        tracing::info!("Gauge readers disabled (DISABLE_GAUGE_READERS=true)");
    } else {
        tracing::info!("Starting gauge readers");
        crate::readers::run_all(db.clone(), state.gauge_wake.clone());
    }

    crate::regions::run_worker(db.clone(), state.region_wake.clone());
    crate::media::run_sweeper(db);
}
