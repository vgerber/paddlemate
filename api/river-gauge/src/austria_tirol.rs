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

            data.entry(station.to_string()).or_default().push((ts, value));
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
}

impl GaugeReader for AustriaTirolReader {
    fn provider_key(&self) -> &'static str {
        "tirol"
    }

    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::hours(24))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            Ok(vec![
                StationInfo {
                    station_id: "201038".to_owned(),
                    name: Some("Grießau".to_owned()),
                    river: Some("Lech".to_owned()),
                    latitude: Some(47.298),
                    longitude: Some(10.4631),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201053".to_owned(),
                    name: Some("Vorderhornbach (Brücke)".to_owned()),
                    river: Some("Hornbach".to_owned()),
                    latitude: Some(47.368599),
                    longitude: Some(10.538),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201095".to_owned(),
                    name: Some("Scharnitz (Weidach)".to_owned()),
                    river: Some("Isar".to_owned()),
                    latitude: Some(47.389599),
                    longitude: Some(11.264),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201293".to_owned(),
                    name: Some("Landeck Perjen".to_owned()),
                    river: Some("Inn".to_owned()),
                    latitude: Some(47.146999),
                    longitude: Some(10.5714),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201376".to_owned(),
                    name: Some("Obergurgl".to_owned()),
                    river: Some("Gurgler Ache".to_owned()),
                    latitude: Some(46.8689),
                    longitude: Some(11.0222),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201392".to_owned(),
                    name: Some("Huben".to_owned()),
                    river: Some("Ötztaler Ache".to_owned()),
                    latitude: Some(47.04378),
                    longitude: Some(10.971798),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201434".to_owned(),
                    name: Some("Tumpen".to_owned()),
                    river: Some("Ötztaler Ache".to_owned()),
                    latitude: Some(47.163101),
                    longitude: Some(10.9105),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201459".to_owned(),
                    name: Some("Magerbach".to_owned()),
                    river: Some("Inn".to_owned()),
                    latitude: Some(47.2593),
                    longitude: Some(10.8759),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201566".to_owned(),
                    name: Some("Steinach am Brenner".to_owned()),
                    river: Some("Gschnitzbach".to_owned()),
                    latitude: Some(47.092899),
                    longitude: Some(11.4651),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201574".to_owned(),
                    name: Some("Puig (Matrei am Brenner)".to_owned()),
                    river: Some("Sill".to_owned()),
                    latitude: Some(47.113098),
                    longitude: Some(11.4524),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201624".to_owned(),
                    name: Some("Innsbruck Reichenau".to_owned()),
                    river: Some("Sill".to_owned()),
                    latitude: Some(47.2729),
                    longitude: Some(11.4115),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201822".to_owned(),
                    name: Some("Mariathal".to_owned()),
                    river: Some("Brandenberger Ache".to_owned()),
                    latitude: Some(47.4543),
                    longitude: Some(11.865),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201848".to_owned(),
                    name: Some("Hörbrunn".to_owned()),
                    river: Some("Kelchsauer Ache".to_owned()),
                    latitude: Some(47.420601),
                    longitude: Some(12.1397),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "201897".to_owned(),
                    name: Some("Kaiserwerk".to_owned()),
                    river: Some("Weissache".to_owned()),
                    latitude: Some(47.542198),
                    longitude: Some(12.1777),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "201913".to_owned(),
                    name: Some("Kitzbühel (Bahnhofsbrücke)".to_owned()),
                    river: Some("Kitzbüheler Ache".to_owned()),
                    latitude: Some(47.454899),
                    longitude: Some(12.3894),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "201947".to_owned(),
                    name: Some("Almdorf".to_owned()),
                    river: Some("Fieberbrunner Ache".to_owned()),
                    latitude: Some(47.5196),
                    longitude: Some(12.4412),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "202036".to_owned(),
                    name: Some("Landeck Bruggen".to_owned()),
                    river: Some("Sanna".to_owned()),
                    latitude: Some(47.143398),
                    longitude: Some(10.5628),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "202127".to_owned(),
                    name: Some("Leutasch (Klamm)".to_owned()),
                    river: Some("Leutascher Ache".to_owned()),
                    latitude: Some(47.3634),
                    longitude: Some(11.1126),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "202218".to_owned(),
                    name: Some("Unterwindau".to_owned()),
                    river: Some("Windauer Ache".to_owned()),
                    latitude: Some(47.4342),
                    longitude: Some(12.176),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "202226".to_owned(),
                    name: Some("Stanzach".to_owned()),
                    river: Some("Namlosbach".to_owned()),
                    latitude: Some(47.383499),
                    longitude: Some(10.5631),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "202283".to_owned(),
                    name: Some("Krössbach".to_owned()),
                    river: Some("Ruetz".to_owned()),
                    latitude: Some(47.080299),
                    longitude: Some(11.2661),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "202523".to_owned(),
                    name: Some("Arnbach".to_owned()),
                    river: Some("Drau".to_owned()),
                    latitude: Some(46.7411),
                    longitude: Some(12.3726),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "202564".to_owned(),
                    name: Some("St Anton am Arlberg-Salzhütte".to_owned()),
                    river: Some("Rosanna".to_owned()),
                    latitude: Some(47.096401),
                    longitude: Some(10.2129),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "202622".to_owned(),
                    name: Some("Kirchberg in Tirol".to_owned()),
                    river: Some("Aschauer Ache".to_owned()),
                    latitude: Some(47.446499),
                    longitude: Some(12.3143),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "202754".to_owned(),
                    name: Some("Heinfels".to_owned()),
                    river: Some("Villgratenbach".to_owned()),
                    latitude: Some(46.7542),
                    longitude: Some(12.4359),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "212043".to_owned(),
                    name: Some("Hinterbichl".to_owned()),
                    river: Some("Isel".to_owned()),
                    latitude: Some(47.015301),
                    longitude: Some(12.337),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "212084".to_owned(),
                    name: Some("Prossegg".to_owned()),
                    river: Some("Tauernbach".to_owned()),
                    latitude: Some(47.014999),
                    longitude: Some(12.5304),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "212100".to_owned(),
                    name: Some("Hopfgarten in Defereggen-Zwenewald".to_owned()),
                    river: Some("Schwarzach".to_owned()),
                    latitude: Some(46.917599),
                    longitude: Some(12.5115),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "212142".to_owned(),
                    name: Some("Staniska".to_owned()),
                    river: Some("Kalserbach".to_owned()),
                    latitude: Some(46.953999),
                    longitude: Some(12.6159),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "230706".to_owned(),
                    name: Some("In der Au".to_owned()),
                    river: Some("Melach".to_owned()),
                    latitude: Some(47.225201),
                    longitude: Some(11.2327),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "231092".to_owned(),
                    name: Some("Lienz Falkensteinsteg".to_owned()),
                    river: Some("Drau".to_owned()),
                    latitude: Some(46.817902),
                    longitude: Some(12.7596),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "297005".to_owned(),
                    name: Some("Wasserfassung Wenns".to_owned()),
                    river: Some("Pitze".to_owned()),
                    latitude: Some(47.158298),
                    longitude: Some(10.7374),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "297069".to_owned(),
                    name: Some("Kundl".to_owned()),
                    river: Some("Wildschönauer Ache".to_owned()),
                    latitude: Some(47.4669),
                    longitude: Some(11.9886),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "297087".to_owned(),
                    name: Some("Ischgl Platt".to_owned()),
                    river: Some("Trisanna".to_owned()),
                    latitude: Some(47.028301),
                    longitude: Some(10.3145),
                    params: vec!["W".to_owned()],
                },
            ])
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
                                    if let Some(r) =
                                        Self::extract_reading(&stations, station, "W")
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
            }

            // --- Q / WT readings: snapshot ---
            if !snapshot_reqs.is_empty() {
                let param_keys: HashSet<&str> =
                    snapshot_reqs.iter().map(|(_, p, _)| *p).collect();
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
