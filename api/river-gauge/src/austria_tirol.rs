use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

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
    /// Cached parsed OGD CSV (W readings for last 24 h, all stations).
    ogd_cache: Arc<Mutex<Option<OgdCache>>>,
}

impl Default for AustriaTirolReader {
    fn default() -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
            ogd_cache: Arc::new(Mutex::new(None)),
        }
    }
}

const BASE_URL: &str = "https://hydro.tirol.gv.at/stationdata/data.json";
/// OGD CSV: 24 h of 15-min W readings for all public Tirol stations.
const OGD_CSV_URL: &str = "https://hydro.tirol.gv.at/ogd/OGD_W.csv";
/// Snapshots older than this are re-fetched from the network.
const CACHE_TTL_SECS: i64 = 60;
/// OGD CSV is re-fetched at most every 5 minutes.
const OGD_CACHE_TTL_SECS: i64 = 300;

#[derive(Deserialize, Clone)]
struct StationEntry {
    number: String,
    /// Human-readable station name (present in the data.json snapshot).
    #[serde(default)]
    name: Option<String>,
    /// Station coordinates as `[latitude, longitude]` (present in data.json).
    #[serde(default)]
    latlng: Option<Vec<f64>>,
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

/// Parsed OGD CSV: maps station_number -> chronologically sorted readings.
struct OgdCache {
    fetched_at: DateTime<Utc>,
    data: HashMap<String, Vec<(DateTime<Utc>, f64)>>,
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

    /// Fetch and cache the OGD CSV, returning a map of
    /// station_number -> chronologically sorted (timestamp, value) pairs.
    async fn get_ogd_data(&self) -> anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>> {
        {
            let cache = self.ogd_cache.lock().await;
            if let Some(entry) = cache.as_ref() {
                if (Utc::now() - entry.fetched_at).num_seconds() < OGD_CACHE_TTL_SECS {
                    return Ok(entry.data.clone());
                }
            }
        }

        let text = reqwest::get(OGD_CSV_URL)
            .await
            .map_err(|e| anyhow::anyhow!("TirolReader: OGD CSV request failed: {e}"))?
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("TirolReader: OGD CSV read failed: {e}"))?;

        let mut data: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

        // CSV columns: name;number;river;param;timestamp_iso8601;value;unit;...
        for line in text.lines().skip(1) {
            let mut cols = line.splitn(11, ';');
            let _name = cols.next();
            let station = match cols.next() {
                Some(s) => s,
                None => continue,
            };
            let _river = cols.next();
            let _param = cols.next();
            let ts_str = match cols.next() {
                Some(s) => s,
                None => continue,
            };
            let val_str = match cols.next() {
                Some(s) => s,
                None => continue,
            };

            let ts = match chrono::DateTime::parse_from_str(ts_str, "%Y-%m-%dT%H:%M:%S%z") {
                Ok(dt) => dt.with_timezone(&Utc),
                Err(_) => continue,
            };
            let value = match val_str.parse::<f64>() {
                Ok(v) => v,
                Err(_) => continue,
            };

            data.entry(station.to_string())
                .or_default()
                .push((ts, value));
        }

        for readings in data.values_mut() {
            readings.sort_unstable_by_key(|(ts, _)| *ts);
        }

        let result = data.clone();
        *self.ogd_cache.lock().await = Some(OgdCache {
            fetched_at: Utc::now(),
            data,
        });
        Ok(result)
    }

    /// Derive the supported river-gauge param keys a station exposes, in display
    /// order (W, Q, WT), by inspecting the `values` object of a snapshot entry.
    /// A key is present when the snapshot carries a (non-null) sub-object for it.
    fn gauge_params(values: &serde_json::Value) -> Vec<String> {
        ["W", "Q", "WT"]
            .iter()
            .filter(|key| values.get(**key).is_some_and(|v| !v.is_null()))
            .map(|key| key.to_string())
            .collect()
    }

    /// Fetch the OGD CSV once and build a map of station number -> river name
    /// (the `Gewässer` column). Used to enrich `list_stations`; the snapshot
    /// JSON itself carries no river name.
    ///
    /// The CSV is ISO-8859-1 encoded and served without a charset, so decode it
    /// byte-wise (each byte maps directly to the matching Unicode code point) to
    /// preserve umlauts in river names.
    async fn fetch_station_rivers(&self) -> anyhow::Result<HashMap<String, String>> {
        let bytes = reqwest::get(OGD_CSV_URL)
            .await
            .map_err(|e| anyhow::anyhow!("TirolReader: OGD CSV request failed: {e}"))?
            .bytes()
            .await
            .map_err(|e| anyhow::anyhow!("TirolReader: OGD CSV read failed: {e}"))?;
        let text: String = bytes.iter().map(|&b| b as char).collect();

        let mut rivers: HashMap<String, String> = HashMap::new();
        // Columns: Stationsname;Stationsnummer;Gewässer;Parameter;timestamp;value;...
        for line in text.lines().skip(1) {
            let mut cols = line.split(';');
            let _name = cols.next();
            let number = match cols.next() {
                Some(s) if !s.is_empty() => s,
                _ => continue,
            };
            let river = match cols.next() {
                Some(s) if !s.is_empty() => s,
                _ => continue,
            };
            rivers
                .entry(number.to_string())
                .or_insert_with(|| river.to_string());
        }
        Ok(rivers)
    }
}

impl GaugeReader for AustriaTirolReader {
    fn provider_key(&self) -> &'static str {
        "tirol"
    }

    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::hours(24))
    }

    /// Discover the full HD Tirol catalog live and return every real river gauge
    /// (stations exposing water level and/or discharge).
    ///
    /// The `data.json` snapshot returns the whole station catalog (~580 entries)
    /// regardless of the `parameter` query, including non-gauge stations such as
    /// groundwater, precipitation, air temperature and snow. Each station's
    /// `values` object names the measured quantities, so a station is kept only
    /// when it carries a `W` (water level) or `Q` (discharge) series. River names
    /// are enriched from the OGD CSV where available (the snapshot has none).
    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async move {
            // The water-level snapshot is the full station catalog. Union it with
            // the discharge snapshot so discharge-only stations are still covered
            // if the provider ever starts filtering the catalog per parameter.
            let mut entries = self.get_stations("W").await?;
            match self.get_stations("Q").await {
                Ok(mut q) => entries.append(&mut q),
                Err(e) => {
                    tracing::warn!(
                        "TirolReader: discharge snapshot unavailable for list_stations: {e}"
                    );
                }
            }

            // Best-effort river lookup; stations absent from the CSV keep river = None.
            let rivers = self.fetch_station_rivers().await.unwrap_or_else(|e| {
                tracing::warn!("TirolReader: river lookup unavailable for list_stations: {e}");
                HashMap::new()
            });

            // Union entries by station number, keeping only real river gauges.
            let mut by_number: HashMap<String, StationInfo> = HashMap::new();
            for entry in entries {
                let params = Self::gauge_params(&entry.values);
                if !params.iter().any(|p| p == "W" || p == "Q") {
                    continue;
                }
                match by_number.get_mut(&entry.number) {
                    Some(existing) => {
                        for p in params {
                            if !existing.params.contains(&p) {
                                existing.params.push(p);
                            }
                        }
                        if existing.name.is_none() {
                            existing.name = entry.name;
                        }
                        if existing.latitude.is_none() {
                            if let Some([lat, lon]) = entry.latlng.as_deref() {
                                existing.latitude = Some(*lat);
                                existing.longitude = Some(*lon);
                            }
                        }
                    }
                    None => {
                        let (latitude, longitude) = match entry.latlng.as_deref() {
                            Some([lat, lon]) => (Some(*lat), Some(*lon)),
                            _ => (None, None),
                        };
                        let river = rivers.get(&entry.number).cloned();
                        by_number.insert(
                            entry.number.clone(),
                            StationInfo {
                                station_id: entry.number,
                                name: entry.name,
                                river,
                                latitude,
                                longitude,
                                params,
                            },
                        );
                    }
                }
            }

            Ok(by_number.into_values().collect())
        })
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

            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

            // Separate W requests (OGD CSV, 24 h history) from Q/WT (snapshot only).
            let (w_reqs, snapshot_reqs): (Vec<_>, Vec<_>) =
                parsed.iter().partition(|(_, p, _)| *p == "W");

            // --- W readings: OGD CSV with snapshot fallback ---
            if !w_reqs.is_empty() {
                match self.get_ogd_data().await {
                    Ok(ogd) => {
                        let mut missing: Vec<&(&str, &str, &FetchRequest)> = Vec::new();
                        for item @ (station, _, req) in &w_reqs {
                            if let Some(readings) = ogd.get(*station) {
                                let filtered: Vec<_> = readings
                                    .iter()
                                    .filter(|(ts, _)| *ts > req.from && *ts <= req.to)
                                    .copied()
                                    .collect();
                                if !filtered.is_empty() {
                                    results.insert(req.source_id.clone(), filtered);
                                    continue;
                                }
                            }
                            missing.push(item);
                        }
                        // Stations absent from OGD (e.g. smaller gauges): fall back to snapshot.
                        if !missing.is_empty() {
                            if let Ok(stations) = self.get_stations("W").await {
                                for (station, _, req) in missing {
                                    if let Some(r) = Self::extract_reading(&stations, station, "W")
                                    {
                                        if r.0 > req.from && r.0 <= req.to {
                                            results
                                                .entry(req.source_id.clone())
                                                .or_default()
                                                .push(r);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(err) => {
                        tracing::error!(
                            "TirolReader: OGD CSV fetch failed: {err}; falling back to snapshot"
                        );
                        if let Ok(stations) = self.get_stations("W").await {
                            for (station, _, req) in &w_reqs {
                                if let Some(r) = Self::extract_reading(&stations, station, "W") {
                                    if r.0 > req.from && r.0 <= req.to {
                                        results.entry(req.source_id.clone()).or_default().push(r);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // --- Q / WT readings: snapshot ---
            if !snapshot_reqs.is_empty() {
                let param_keys: HashSet<&str> = snapshot_reqs.iter().map(|(_, p, _)| *p).collect();
                let mut snapshots: HashMap<&str, Vec<StationEntry>> = HashMap::new();
                for param_key in param_keys {
                    match self.get_stations(param_key).await {
                        Ok(stations) => {
                            snapshots.insert(param_key, stations);
                        }
                        Err(err) => {
                            tracing::error!(
                                "TirolReader: snapshot fetch failed for '{param_key}': {err}"
                            );
                        }
                    }
                }
                for (station, param_key, req) in &snapshot_reqs {
                    if let Some(stations) = snapshots.get(param_key) {
                        if let Some(r) = Self::extract_reading(stations, station, param_key) {
                            if r.0 > req.from && r.0 <= req.to {
                                results.entry(req.source_id.clone()).or_default().push(r);
                            }
                        }
                    }
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_stations(json: serde_json::Value) -> Vec<StationEntry> {
        serde_json::from_value(json).expect("test fixture invalid")
    }

    // --- extract_reading ---

    #[test]
    fn extract_reading_water_level_ok() {
        // dt is milliseconds since epoch: 1_747_000_000_000 ms = 2025-05-12 ...
        let stations = make_stations(serde_json::json!([
            {
                "number": "201525",
                "values": {
                    "W": { "Cmd": { "v": 123.4, "dt": 1_747_000_000_000_u64 } }
                }
            }
        ]));

        let (ts, v) = AustriaTirolReader::extract_reading(&stations, "201525", "W")
            .expect("should find a reading");

        assert!((v - 123.4).abs() < 1e-9);
        // epoch 1747000000 sec = 2025-05-12T02:06:40Z
        assert_eq!(ts.timestamp(), 1_747_000_000);
    }

    #[test]
    fn extract_reading_discharge_ok() {
        let stations = make_stations(serde_json::json!([
            {
                "number": "201525",
                "values": {
                    "Q": { "15m.Cmd.HD": { "v": 55.0, "dt": 1_747_000_000_000_u64 } }
                }
            }
        ]));

        let (_, v) = AustriaTirolReader::extract_reading(&stations, "201525", "Q")
            .expect("should find discharge");
        assert!((v - 55.0).abs() < 1e-9);
    }

    #[test]
    fn extract_reading_unknown_station_returns_none() {
        let stations = make_stations(serde_json::json!([
            { "number": "999999", "values": {} }
        ]));
        assert!(AustriaTirolReader::extract_reading(&stations, "111111", "W").is_none());
    }

    #[test]
    fn extract_reading_unknown_param_returns_none() {
        let stations = make_stations(serde_json::json!([
            {
                "number": "201525",
                "values": { "W": { "Cmd": { "v": 1.0, "dt": 1_000_000_000_000_u64 } } }
            }
        ]));
        // "XX" is not a valid param key
        assert!(AustriaTirolReader::extract_reading(&stations, "201525", "XX").is_none());
    }

    #[test]
    fn extract_reading_missing_value_key_returns_none() {
        // Station exists but has no W entry in values
        let stations = make_stations(serde_json::json!([
            { "number": "201525", "values": {} }
        ]));
        assert!(AustriaTirolReader::extract_reading(&stations, "201525", "W").is_none());
    }

    // --- snapshot_url ---

    #[test]
    fn snapshot_url_discharge() {
        let url = AustriaTirolReader::snapshot_url("Q");
        assert!(url.contains("Durchfluss"), "expected Durchfluss in URL");
    }

    #[test]
    fn snapshot_url_temperature() {
        let url = AustriaTirolReader::snapshot_url("WT");
        assert!(
            url.contains("Wassertemperatur"),
            "expected Wassertemperatur in URL"
        );
    }

    #[test]
    fn snapshot_url_default_is_water_level() {
        let url = AustriaTirolReader::snapshot_url("W");
        assert!(url.contains("Wasserstand"), "expected Wasserstand in URL");
    }
}
