use std::collections::HashMap;

use chrono::{DateTime, Utc};
use river_gauge::{FetchRequest, build_registry};
use sqlx::PgPool;

// Re-export the public types so existing code that imports from this module
// continues to work without changes.
pub use river_gauge::{BoxFuture, GaugeReader};

/// Start background polling loops, one task per provider. Fire-and-forget.
pub fn run_all(pool: PgPool) {
    tokio::spawn(async move {
        let readers = build_registry();

        let gauges = match crate::query::gauges::list_gauges(&pool, true).await {
            Ok(g) => g,
            Err(err) => {
                tracing::error!("Failed to load gauges for background readers: {}", err);
                return;
            }
        };

        // Group gauges by provider so each provider gets one polling task.
        let mut by_provider: HashMap<String, Vec<_>> = HashMap::new();
        for gauge in gauges {
            by_provider
                .entry(gauge.provider.clone())
                .or_default()
                .push(gauge);
        }

        for (provider, gauges) in by_provider {
            let reader = match readers.iter().find(|r| r.provider_key() == provider) {
                Some(r) => r.clone(),
                None => {
                    tracing::warn!(
                        "No reader registered for provider '{provider}', skipping {} gauge(s)",
                        gauges.len()
                    );
                    continue;
                }
            };

            // Use the shortest interval across all gauges of this provider.
            let fetch_interval = gauges
                .iter()
                .map(|g| g.fetch_interval_secs as u64)
                .min()
                .unwrap_or(900);

            let pool_clone = pool.clone();
            tokio::spawn(async move {
                loop {
                    // Build one FetchRequest per source_id, using the earliest
                    // `from` across all series that share that source_id.
                    // source_id -> (earliest_from, [series_ids])
                    let mut source_map: HashMap<String, (DateTime<Utc>, Vec<i64>)> = HashMap::new();

                    for gauge in &gauges {
                        let gauge_data = match crate::query::gauges::fetch_gauge_with_series(
                            &pool_clone,
                            gauge.id,
                        )
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

                    tokio::time::sleep(tokio::time::Duration::from_secs(fetch_interval)).await;
                }
            });
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
        .ok_or_else(|| anyhow::anyhow!("Gauge {} not found", gauge_id))?;

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
