// Provider coverage checklist
// ──────────────────────────────────────────────────────────────
// ✅ austria_tirol      "tirol"   218 gauges  Tirol eGovernment API
// ✅ austria_ehyd       "ehyd"    ~34 gauges  Austrian federal eHYD portal
//                                             (NÖ, Salzburg, Steiermark, OÖ,
//                                              Kärnten 4/6)
// ✅ austria_vorarlberg "vbg"     14 gauges   Vorarlberg GeoServer WFS
// ✅ germany_bavaria    "by"      40 gauges   BLfU HND Bayern snapshot
// ✅ switzerland_bafu   "bafu"    ~87 gauges  BAFU via existenz.ch
// ✅ france_hubeau      "hubeau"  ~133 gauges Hub'Eau v2 API
// ✅ norway_nve         "nve"     32 gauges   NVE HydAPI (needs NVE_API_KEY)
// ❌ rz                           580 gauges  Riverzone (needs API key)
// ❌ rdbrmc                        51 gauges  Unknown provider
// ❌ cz                            26 gauges  Czech CHMI
// ❌ bw                            12 gauges  Baden-Württemberg (no public API)
// ❌ pl                             9 gauges  Poland
// ❌ sx                             7 gauges  Saxony
// ❌ anu/be/bw-x/ba/ebs            14 gauges  Various (uninvestigated)
// –  synthetic/visual              36 gauges  Not real gauges, skip
// ──────────────────────────────────────────────────────────────

mod austria_ehyd;
mod austria_tirol;
mod austria_vorarlberg;
mod france_hubeau;
mod germany_bavaria;
mod norway_nve;
mod switzerland_bafu;

use std::{collections::HashMap, future::Future, pin::Pin, sync::Arc};

use chrono::{DateTime, Utc};
use sqlx::PgPool;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// One entry in a batch fetch request.
pub struct FetchRequest {
    pub source_id: String,
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

/// Trait implemented by each regional data source.
///
/// `fetch_all` receives *all* gauges for this provider at once so the
/// implementation can share a single HTTP round-trip across them.
pub trait GaugeReader: Send + Sync {
    /// Unique key that matches the `provider` column in the `gauges` table.
    fn provider_key(&self) -> &'static str;

    /// Fetch readings for multiple source IDs in one call.
    /// Returns a map of `source_id → readings`.
    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>>;
}

fn build_registry() -> Vec<Arc<dyn GaugeReader>> {
    vec![
        Arc::new(austria_tirol::AustriaTirolReader::default()),
        Arc::new(switzerland_bafu::SwitzerlandBafuReader),
        Arc::new(france_hubeau::FranceHubeauReader),
        Arc::new(norway_nve::NorwayNveReader::default()),
        Arc::new(germany_bavaria::GermanyBavariaReader::default()),
        Arc::new(austria_ehyd::AustriaEhydReader::default()),
        Arc::new(austria_vorarlberg::AustriaVorarlbergReader::default()),
    ]
}

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
                    // source_id → (earliest_from, [series_ids])
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
                            let from =
                                match crate::query::gauges::fetch_latest_reading(&pool_clone, s.id)
                                    .await
                                {
                                    Ok(Some(r)) => r.measured_at,
                                    _ => {
                                        Utc::now()
                                            - chrono::Duration::seconds(fetch_interval as i64 * 2)
                                    }
                                };

                            let entry = source_map
                                .entry(gauge.source_id.clone())
                                .or_insert((from, vec![]));
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
                                    "Error fetching readings for provider '{provider}': {err}"
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

    let requests = vec![FetchRequest {
        source_id: gauge_with_series.source_id.clone(),
        from,
        to,
    }];
    let results = reader.fetch_all(&requests).await?;

    if let Some(readings) = results.get(&gauge_with_series.source_id) {
        for s in &gauge_with_series.series {
            crate::query::gauges::insert_readings_batch(&pool, s.id, readings).await?;
        }
    }

    Ok(())
}
