use std::collections::HashMap;

use chrono::{DateTime, Utc};
use river_gauge::{FetchRequest, build_registry};
use sqlx::PgPool;

// Re-export the public types so existing code that imports from this module
// continues to work without changes.
pub use river_gauge::{BoxFuture, GaugeReader};

/// Start background polling. A supervisor reconciles one task per provider
/// that has active gauges - re-checking periodically so a provider that gains
/// its first gauge (e.g. a freshly linked catalog station) starts polling
/// without an app restart. Fire-and-forget.
///
/// `wake` is signalled after a gauge is linked so the supervisor reconciles at
/// once instead of waiting for its next tick; the periodic tick is the robust
/// fallback for anything that misses the signal (proposal approvals, direct DB
/// changes).
pub fn run_all(pool: PgPool, wake: std::sync::Arc<tokio::sync::Notify>) {
    // How often the supervisor re-checks which providers need a task.
    const SUPERVISOR_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

    tokio::spawn(async move {
        let readers = build_registry();
        // Providers that already have a running poll task; tasks are never
        // torn down (an idle one is cheap and self-heals when gauges return).
        let mut running: std::collections::HashSet<String> = std::collections::HashSet::new();

        loop {
            match crate::query::gauges::list_active_providers(&pool).await {
                Ok(providers) => {
                    for provider in providers {
                        if running.contains(&provider) {
                            continue;
                        }
                        let reader = match readers.iter().find(|r| r.provider_key() == provider) {
                            Some(r) => r.clone(),
                            None => {
                                tracing::warn!(
                                    "No reader registered for provider '{provider}', skipping"
                                );
                                continue;
                            }
                        };
                        running.insert(provider.clone());
                        spawn_provider_loop(pool.clone(), reader, provider, wake.clone());
                    }
                }
                Err(err) => tracing::error!("Poll supervisor: failed to list providers: {err}"),
            }

            tokio::select! {
                _ = tokio::time::sleep(SUPERVISOR_INTERVAL) => {}
                _ = wake.notified() => {}
            }
        }
    });
}

/// Poll one provider forever. Its gauge set is re-read from the DB every cycle
/// (not captured once), so newly linked gauges are fetched on the next tick and
/// a provider that loses all its gauges simply idles. `wake` cuts the
/// inter-cycle sleep short when a gauge is linked, so a station added to a
/// provider that is mid-sleep is fetched at once instead of on its next cycle.
fn spawn_provider_loop(
    pool: PgPool,
    reader: std::sync::Arc<dyn GaugeReader>,
    provider: String,
    wake: std::sync::Arc<tokio::sync::Notify>,
) {
    let pool_clone = pool;
    tokio::spawn(async move {
        loop {
            let gauges =
                match crate::query::gauges::list_active_gauges_by_provider(&pool_clone, &provider)
                    .await
                {
                    Ok(g) => g,
                    Err(err) => {
                        tracing::error!(provider = %provider, "failed to load gauges: {err}");
                        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                        continue;
                    }
                };
            // Shortest interval across this provider's current gauges.
            let fetch_interval = gauges
                .iter()
                .map(|g| g.fetch_interval_secs as u64)
                .min()
                .unwrap_or(900);

            {
                // Build one FetchRequest per source_id, using the earliest
                // `from` across all series that share that source_id.
                // source_id -> (earliest_from, [series_ids])
                let mut source_map: HashMap<String, (DateTime<Utc>, Vec<i64>)> = HashMap::new();

                for gauge in &gauges {
                    let gauge_data =
                        match crate::query::gauges::fetch_gauge_with_series(&pool_clone, gauge.id)
                            .await
                        {
                            Ok(Some(g)) => g,
                            Ok(None) => {
                                tracing::warn!("Gauge {} no longer exists", gauge.id);
                                continue;
                            }
                            Err(err) => {
                                tracing::error!("Failed to load gauge {}: {}", gauge.id, err);
                                continue;
                            }
                        };

                    for s in &gauge_data.series {
                        // Use the series-level source_id when available;
                        // fall back to gauge.source_id for backwards compat.
                        let sid = s
                            .source_id
                            .as_deref()
                            .filter(|s| !s.is_empty())
                            .unwrap_or(&gauge.source_id)
                            .to_string();

                        let from =
                            match crate::query::gauges::fetch_latest_reading(&pool_clone, s.id)
                                .await
                            {
                                Ok(Some(r)) => r.measured_at,
                                _ => {
                                    // On cold start use the provider's history window so that
                                    // history-capable providers (PEGELONLINE, BAFU, Hub'Eau,
                                    // NVE…) pre-fill data. Cap at 30 days to avoid massive
                                    // requests for providers like NVE that support 10 years.
                                    let max_history = chrono::Duration::days(30);
                                    let cold_start_window = reader
                                        .history_depth()
                                        .map(|d| d.min(max_history))
                                        .unwrap_or_else(|| {
                                            chrono::Duration::seconds(fetch_interval as i64 * 2)
                                        });
                                    Utc::now() - cold_start_window
                                }
                            };

                        let entry = source_map.entry(sid).or_insert((from, vec![]));
                        if from < entry.0 {
                            entry.0 = from;
                        }
                        entry.1.push(s.id);
                    }
                }

                if !source_map.is_empty() {
                    let to = Utc::now();
                    let requests: Vec<FetchRequest> = source_map
                        .iter()
                        .map(|(sid, (from, _))| FetchRequest {
                            source_id: sid.clone(),
                            from: *from,
                            to,
                        })
                        .collect();

                    match reader.fetch_all(&requests).await {
                        Ok(results) => {
                            let total_readings: usize = results.values().map(|r| r.len()).sum();
                            tracing::info!(
                                provider = %provider,
                                sources = results.len(),
                                readings = total_readings,
                                "fetch complete"
                            );
                            for (source_id, readings) in results {
                                if let Some((_, series_ids)) = source_map.get(&source_id) {
                                    for &series_id in series_ids {
                                        if let Err(err) =
                                            crate::query::gauges::insert_readings_batch(
                                                &pool_clone,
                                                series_id,
                                                &readings,
                                            )
                                            .await
                                        {
                                            tracing::error!(
                                                "Error inserting readings for series {series_id}: {err}"
                                            );
                                        }
                                    }
                                }
                            }
                        }
                        Err(err) => {
                            tracing::error!(
                                provider = %provider,
                                "fetch failed: {err}"
                            );
                        }
                    }
                }
            }

            // Sleep until the next cycle, but wake early if a gauge is linked.
            tokio::select! {
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(fetch_interval)) => {}
                _ = wake.notified() => {}
            }
        }
    });
}

/// Fetch and store historical readings for a single gauge. Called by the backfill endpoint.
pub async fn backfill(
    pool: PgPool,
    gauge_id: i64,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> anyhow::Result<()> {
    let readers = build_registry();

    let gauge_with_series = crate::query::gauges::fetch_gauge_with_series(&pool, gauge_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Gauge {gauge_id} not found"))?;

    let reader = readers
        .iter()
        .find(|r| r.provider_key() == gauge_with_series.provider)
        .ok_or_else(|| {
            anyhow::anyhow!("No reader for provider '{}'", gauge_with_series.provider)
        })?;

    let requests: Vec<FetchRequest> = gauge_with_series
        .series
        .iter()
        .map(|s| {
            let sid = s
                .source_id
                .as_deref()
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| gauge_with_series.source_id.clone());
            FetchRequest {
                source_id: sid,
                from,
                to,
            }
        })
        .collect();
    let results = reader.fetch_all(&requests).await?;

    for s in &gauge_with_series.series {
        let sid = s
            .source_id
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(&gauge_with_series.source_id);
        if let Some(readings) = results.get(sid) {
            crate::query::gauges::insert_readings_batch(&pool, s.id, readings).await?;
        }
    }

    Ok(())
}
