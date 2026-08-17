use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, ReadingsBySource, StationInfo};

/// Reader for Swedish hydrological observations (SMHI hydroobs open data).
///
/// Source: https://opendata.smhi.se/ (hydroobs API)
/// License: CC BY 4.0, attribution "Källa: SMHI".
///
/// The API is effectively a discharge network: parameter 2 (Vattenföring,
/// 15 min, m3/s) covers 700+ stations, ~300 active. Parameter 3 (water
/// level) exists but covers only ~10 externally-owned stations reporting
/// absolute elevation, so it is not exposed here.
///
/// `list_stations` reads the full parameter-2 catalog and keeps active
/// stations. `fetch_all` pulls the `latest-day` window per station (the
/// bulk `station-set/all` endpoint only supports `latest-hour`, which is
/// too short to bridge missed polls). Responses are served from a 10-minute
/// server-side cache, so polling more often than that returns nothing new.
///
/// `source_id` format: `"{station_id}:Q"` e.g. `"2357:Q"`.
pub struct SwedenSmhiReader;

const BASE_URL: &str = "https://opendata-download-hydroobs.smhi.se/api/version/1.0/parameter/2";

#[derive(Deserialize)]
struct Catalog {
    #[serde(default)]
    station: Vec<CatalogStation>,
}

#[derive(Deserialize)]
struct CatalogStation {
    key: String,
    name: Option<String>,
    active: bool,
    latitude: Option<f64>,
    longitude: Option<f64>,
    /// Main river basin name (e.g. "TORNEÄLVEN"), the closest thing the
    /// catalog has to a river name.
    #[serde(rename = "catchmentName")]
    catchment_name: Option<String>,
}

#[derive(Deserialize)]
struct DataResponse {
    #[serde(default)]
    value: Vec<Value>,
}

#[derive(Deserialize)]
struct Value {
    /// Unix epoch milliseconds, UTC, marking the start of the time step.
    date: i64,
    /// Discharge in m3/s; null for gaps.
    value: Option<f64>,
}

impl SwedenSmhiReader {
    fn parse_readings(raw: &str) -> anyhow::Result<Vec<(DateTime<Utc>, f64)>> {
        let resp: DataResponse = serde_json::from_str(raw)
            .map_err(|e| anyhow::anyhow!("SwedenSmhiReader: JSON parse error: {e}"))?;
        Ok(resp
            .value
            .into_iter()
            .filter_map(|v| {
                let ts = DateTime::from_timestamp_millis(v.date)?;
                Some((ts, v.value?))
            })
            .collect())
    }

    async fn fetch_station(station_id: &str) -> anyhow::Result<Vec<(DateTime<Utc>, f64)>> {
        let url = format!("{BASE_URL}/station/{station_id}/period/latest-day/data.json");
        let resp = reqwest::get(&url)
            .await
            .map_err(|e| anyhow::anyhow!("SwedenSmhiReader: HTTP error for {station_id}: {e}"))?;
        // The API answers 404 both for unknown stations and for stations
        // without data in the period - either way there is nothing to store.
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(vec![]);
        }
        let body = resp
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("SwedenSmhiReader: server error for {station_id}: {e}"))?
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("SwedenSmhiReader: body error for {station_id}: {e}"))?;
        Self::parse_readings(&body)
    }
}

impl GaugeReader for SwedenSmhiReader {
    fn provider_key(&self) -> &'static str {
        "smhi"
    }

    /// The per-station `latest-day` period serves about one day back.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(1))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async {
            let url = format!("{BASE_URL}.json");
            let catalog: Catalog = reqwest::get(&url)
                .await
                .map_err(|e| anyhow::anyhow!("SwedenSmhiReader: HTTP error listing stations: {e}"))?
                .error_for_status()
                .map_err(|e| {
                    anyhow::anyhow!("SwedenSmhiReader: server error listing stations: {e}")
                })?
                .json()
                .await
                .map_err(|e| {
                    anyhow::anyhow!("SwedenSmhiReader: JSON parse error listing stations: {e}")
                })?;
            Ok(catalog
                .station
                .into_iter()
                .filter(|s| s.active)
                .map(|s| StationInfo {
                    station_id: s.key,
                    name: s.name,
                    river: s.catchment_name,
                    latitude: s.latitude,
                    longitude: s.longitude,
                    params: vec!["Q".to_owned()],
                })
                .collect())
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<ReadingsBySource>> {
        Box::pin(async move {
            // One request per station; Q is the only parameter, so a station
            // maps to exactly one source_id.
            let mut results: ReadingsBySource = HashMap::new();
            for req in requests {
                let Some((station_id, "Q")) = req.source_id.split_once(':') else {
                    tracing::warn!(
                        "SwedenSmhiReader: ignoring malformed source_id '{}' (expected '{{station_id}}:Q')",
                        req.source_id
                    );
                    continue;
                };
                match Self::fetch_station(station_id).await {
                    Ok(readings) => {
                        let in_window: Vec<_> = readings
                            .into_iter()
                            .filter(|(ts, _)| *ts > req.from && *ts <= req.to)
                            .collect();
                        if !in_window.is_empty() {
                            results.insert(req.source_id.clone(), in_window);
                        }
                    }
                    Err(err) => {
                        tracing::error!("SwedenSmhiReader: station {station_id} failed: {err}");
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
    use crate::GaugeReader;

    // Trimmed from a live parameter/2.json response (2026-08-15).
    const SAMPLE_CATALOG: &str = r#"{
        "key": "2",
        "title": "Vattenföring (15 min)",
        "station": [
            {"key":"2357","updated":1786802400000,"title":"Vattenföring (15 min) - ABISKO",
             "name":"ABISKO","id":2357,"owner":"SMHI","measuringStations":"CORE",
             "active":true,"from":461495700000,"to":1786803300000,
             "latitude":68.1936,"longitude":19.9859,"region":1,
             "catchmentName":"TORNEÄLVEN","catchmentNumber":1000,"catchmentSize":3345.5},
            {"key":"9999","name":"CLOSED STATION","active":false,
             "latitude":60.0,"longitude":15.0,"catchmentName":"TESTÄLVEN"}
        ]
    }"#;

    // Trimmed from a live station/2357/period/latest-day/data.json response.
    const SAMPLE_DATA: &str = r#"{
        "updated": 1786802400000,
        "parameter": {"key":"2","name":"Vattenföring (15 min)","unit":"m³/s"},
        "station": {"key":"2357","name":"ABISKO","owner":"SMHI","measuringStations":"CORE"},
        "period": {"key":"latest-day","from":1786658400000,"to":1786802400000},
        "value": [
            {"date":1786658400000,"value":99.2,"quality":"O"},
            {"date":1786659300000,"value":99.1,"quality":"O"},
            {"date":1786802400000,"value":96.6,"quality":"O"},
            {"date":1786803300000,"value":null,"quality":"O"}
        ]
    }"#;

    #[test]
    fn parses_catalog_and_filters_active() {
        let catalog: Catalog = serde_json::from_str(SAMPLE_CATALOG).expect("catalog parses");
        assert_eq!(catalog.station.len(), 2);
        let active: Vec<_> = catalog.station.iter().filter(|s| s.active).collect();
        assert_eq!(active.len(), 1);
        let s = active[0];
        assert_eq!(s.key, "2357");
        assert_eq!(s.name.as_deref(), Some("ABISKO"));
        assert_eq!(s.catchment_name.as_deref(), Some("TORNEÄLVEN"));
        assert_eq!(s.latitude, Some(68.1936));
        assert_eq!(s.longitude, Some(19.9859));
    }

    #[test]
    fn parses_readings_and_drops_null_values() {
        let readings = SwedenSmhiReader::parse_readings(SAMPLE_DATA).expect("data parses");
        assert_eq!(readings.len(), 3);
        let (ts, value) = readings[0];
        assert_eq!(ts.to_rfc3339(), "2026-08-13T22:00:00+00:00");
        assert_eq!(value, 99.2);
        let (last_ts, last_value) = readings[2];
        assert_eq!(last_ts.to_rfc3339(), "2026-08-15T14:00:00+00:00");
        assert_eq!(last_value, 96.6);
    }

    #[test]
    fn source_id_station_is_first_segment() {
        let (station, param) = "2357:Q".split_once(':').expect("should split");
        assert_eq!(station, "2357");
        assert_eq!(param, "Q");
    }

    #[tokio::test]
    #[ignore = "live network access"]
    async fn live_smoke() {
        let reader = SwedenSmhiReader;
        let stations = reader.list_stations().await.expect("list_stations works");
        assert!(
            stations.len() > 200,
            "expected 200+ active stations, got {}",
            stations.len()
        );
        assert!(stations.iter().all(|s| s.latitude.is_some()));

        let now = Utc::now();
        let requests: Vec<FetchRequest> = stations
            .iter()
            .take(5)
            .map(|s| FetchRequest {
                source_id: format!("{}:Q", s.station_id),
                from: now - chrono::Duration::hours(24),
                to: now,
            })
            .collect();
        let results = reader.fetch_all(&requests).await.expect("fetch_all works");
        assert!(
            results.values().any(|r| !r.is_empty()),
            "expected at least one station with readings"
        );
    }
}
