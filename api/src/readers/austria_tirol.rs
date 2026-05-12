use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;
use tokio::sync::Mutex;

use super::{BoxFuture, FetchRequest, GaugeReader};

/// Reader for the Tyrolean hydrographic service (HD Tirol).
///
/// Source: https://hydro.tirol.gv.at
///
/// The site exposes a snapshot JSON file that is regenerated every ~minute with
/// the current reading of every station. There is no public timeseries REST API;
/// history is accumulated by repeated polling.
///
/// Because a single snapshot contains *all* stations, the reader caches each
/// fetched response for [`CACHE_TTL_SECS`] seconds. All gauge polling tasks
/// share the same `Arc<TirolReader>` instance, so an entire poll cycle only
/// issues one HTTP request per param key (W / Q / WT) regardless of how many
/// gauges are configured.
///
/// `source_id` format: `"{station_number}:{param_key}"`
///   e.g. `"201525:W"`  (Innsbruck Inn, water level)
///        `"201525:Q"`  (Innsbruck Inn, discharge)
///        `"201525:WT"` (Innsbruck Inn, water temperature)
///
/// Supported param keys and their data-snapshot URL parameters:
///   `W`  — Wasserstand      (water level, unit cm)
///   `Q`  — Durchfluss       (discharge, unit m³/s)
///   `WT` — Wassertemperatur (temperature, unit °C)
pub struct AustriaTirolReader {
    /// param_key ("W", "Q", "WT") → most recently fetched snapshot.
    cache: Arc<Mutex<HashMap<String, SnapshotCache>>>,
}

impl Default for AustriaTirolReader {
    fn default() -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

const BASE_URL: &str = "https://hydro.tirol.gv.at/stationdata/data.json";
/// Snapshots older than this are re-fetched from the network.
const CACHE_TTL_SECS: i64 = 60;

#[derive(Deserialize, Clone)]
struct StationEntry {
    number: String,
    #[serde(default)]
    values: serde_json::Value,
}

#[derive(Deserialize)]
struct Reading {
    v: f64,
    dt: f64,
}

struct SnapshotCache {
    fetched_at: DateTime<Utc>,
    stations: Vec<StationEntry>,
}

impl AustriaTirolReader {
    fn snapshot_url(param_key: &str) -> String {
        let parameter = match param_key {
            "Q" => "Durchfluss",
            "WT" => "Wassertemperatur",
            _ => "Wasserstand",
        };
        format!("{BASE_URL}?parameter={parameter}")
    }

    /// Return the cached snapshot for `param_key`, fetching from the network
    /// if the cache is missing or older than [`CACHE_TTL_SECS`].
    async fn get_stations(&self, param_key: &str) -> anyhow::Result<Vec<StationEntry>> {
        {
            let cache = self.cache.lock().await;
            if let Some(entry) = cache.get(param_key) {
                if (Utc::now() - entry.fetched_at).num_seconds() < CACHE_TTL_SECS {
                    return Ok(entry.stations.clone());
                }
            }
        }

        // Cache miss or stale — fetch from network.
        let url = Self::snapshot_url(param_key);
        let stations: Vec<StationEntry> = reqwest::get(&url)
            .await
            .map_err(|e| anyhow::anyhow!("TirolReader: HTTP error fetching {url}: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("TirolReader: JSON parse error: {e}"))?;

        {
            let mut cache = self.cache.lock().await;
            cache.insert(
                param_key.to_string(),
                SnapshotCache {
                    fetched_at: Utc::now(),
                    stations: stations.clone(),
                },
            );
        }

        Ok(stations)
    }

    /// Return the current reading for `station_number` and `param_key` from a
    /// parsed station-list response. Returns `None` when the station or the
    /// specific value key is absent.
    fn extract_reading(
        stations: &[StationEntry],
        station_number: &str,
        param_key: &str,
    ) -> Option<(DateTime<Utc>, f64)> {
        let station = stations.iter().find(|s| s.number == station_number)?;

        // Value paths per parameter key:
        //   W  → values.W.Cmd
        //   Q  → values.Q.15m.Cmd.HD
        //   WT → values.WT.15m.Cmd.HD
        let reading: Reading = match param_key {
            "W" => serde_json::from_value(station.values["W"]["Cmd"].clone()).ok()?,
            "Q" => serde_json::from_value(station.values["Q"]["15m.Cmd.HD"].clone()).ok()?,
            "WT" => serde_json::from_value(station.values["WT"]["15m.Cmd.HD"].clone()).ok()?,
            other => {
                tracing::warn!("TirolReader: unknown param_key '{}'", other);
                return None;
            }
        };

        // `dt` is milliseconds since Unix epoch stored as f64.
        let millis = reading.dt as i64;
        let ts = Utc.timestamp_millis_opt(millis).single()?;
        Some((ts, reading.v))
    }
}

impl GaugeReader for AustriaTirolReader {
    fn provider_key(&self) -> &'static str {
        "tirol"
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            // Parse and validate all source_ids up front.
            let parsed: Vec<(&str, &str, &FetchRequest)> = requests
                .iter()
                .filter_map(|req| {
                    match req.source_id.split_once(':') {
                        Some((num, param)) => Some((num, param, req)),
                        None => {
                            tracing::warn!(
                                "TirolReader: ignoring malformed source_id '{}' (expected '{{number}}:{{param}}')",
                                req.source_id
                            );
                            None
                        }
                    }
                })
                .collect();

            // Fetch each unique param_key snapshot exactly once.
            let param_keys: HashSet<&str> = parsed.iter().map(|(_, p, _)| *p).collect();
            let mut snapshots: HashMap<&str, Vec<StationEntry>> = HashMap::new();
            for param_key in param_keys {
                match self.get_stations(param_key).await {
                    Ok(stations) => {
                        snapshots.insert(param_key, stations);
                    }
                    Err(err) => {
                        tracing::error!(
                            "TirolReader: failed to fetch snapshot for param '{param_key}': {err}"
                        );
                    }
                }
            }

            // Extract and filter one reading per request.
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
            for (station_number, param_key, req) in parsed {
                if let Some(stations) = snapshots.get(param_key) {
                    if let Some(reading) =
                        Self::extract_reading(stations, station_number, param_key)
                    {
                        if reading.0 > req.from && reading.0 <= req.to {
                            results
                                .entry(req.source_id.clone())
                                .or_default()
                                .push(reading);
                        }
                    }
                }
            }

            Ok(results)
        })
    }
}
