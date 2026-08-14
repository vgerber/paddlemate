use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, ReadingsBySource, SnapshotCache, StationInfo};

/// Reader for Sri Lanka's river gauge network, via a third-party aggregator
/// that proxies the Irrigation Department's telemetry as a hosted ArcGIS
/// feature layer.
///
/// Source: https://slwaterlevel.mevinu.com/api/data
///
/// No auth, no key. One JSON array with the latest reading for all active
/// gauges (verified live: 40 stations, one row per station - `objectid`
/// increments as the underlying Online table gets recreated, but `gauge`
/// names don't repeat within a snapshot). Latest values only - no history
/// endpoint found - so this is a snapshot provider (`history_depth` =
/// `None`).
///
/// No stated license; data ultimately sourced from Sri Lanka's Irrigation
/// Department - attribute the Department plus the aggregator.
///
/// Water level only (`water_level`, metres, converted to **cm**); the feed
/// has no discharge field. `EditDate` (Unix milliseconds) is the reading
/// timestamp.
///
/// `source_id` format: `"{gauge}:W"`, e.g. `"Deraniyagala:W"`.
/// `gauge` names are unique within a snapshot but not guaranteed globally
/// stable identifiers - if the aggregator ever exposes a real station code,
/// switch to that.
#[derive(Default)]
pub struct SriLankaMevinuReader {
    cache: SnapshotCache<Vec<Station>>,
}

const SNAPSHOT_URL: &str = "https://slwaterlevel.mevinu.com/api/data";
const CACHE_TTL: Duration = Duration::from_secs(300);
const M_TO_CM: f64 = 100.0;

#[derive(Debug, Clone)]
struct Station {
    gauge: String,
    basin: Option<String>,
    latitude: f64,
    longitude: f64,
    level_cm: f64,
    timestamp: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
struct Feature {
    attributes: Attributes,
    geometry: Option<Geometry>,
}

#[derive(Deserialize)]
struct Attributes {
    gauge: Option<String>,
    basin: Option<String>,
    water_level: Option<f64>,
    /// Unix milliseconds; last write to this row, which is how the
    /// aggregator surfaces the reading time (no separate reading-time field).
    #[serde(rename = "EditDate")]
    edit_date: Option<i64>,
}

#[derive(Deserialize)]
struct Geometry {
    x: f64,
    y: f64,
}

fn parse_snapshot(json: &str) -> anyhow::Result<Vec<Station>> {
    let features: Vec<Feature> = serde_json::from_str(json)
        .map_err(|e| anyhow::anyhow!("SriLankaMevinuReader: JSON parse error: {e}"))?;

    Ok(features
        .into_iter()
        .filter_map(|f| {
            let gauge = f.attributes.gauge.filter(|s| !s.trim().is_empty())?;
            let geom = f.geometry?;
            let level_cm = f.attributes.water_level? * M_TO_CM;
            Some(Station {
                gauge,
                basin: f.attributes.basin.filter(|s| !s.trim().is_empty()),
                latitude: geom.y,
                longitude: geom.x,
                level_cm,
                timestamp: f
                    .attributes
                    .edit_date
                    .and_then(DateTime::from_timestamp_millis),
            })
        })
        .collect())
}

impl SriLankaMevinuReader {
    async fn get_snapshot(&self) -> anyhow::Result<Vec<Station>> {
        let mut guard = self.cache.lock().await;

        if let Some((fetched_at, ref stations)) = *guard {
            if fetched_at.elapsed() < CACHE_TTL {
                return Ok(stations.clone());
            }
        }

        let json = reqwest::get(SNAPSHOT_URL)
            .await
            .map_err(|e| anyhow::anyhow!("SriLankaMevinuReader: HTTP error: {e}"))?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("SriLankaMevinuReader: server error: {e}"))?
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("SriLankaMevinuReader: read error: {e}"))?;

        let stations = parse_snapshot(&json)?;

        *guard = Some((Instant::now(), stations.clone()));
        Ok(stations)
    }
}

impl GaugeReader for SriLankaMevinuReader {
    fn provider_key(&self) -> &'static str {
        "lk"
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let snapshot = self.get_snapshot().await?;
            Ok(snapshot
                .into_iter()
                .map(|s| StationInfo {
                    station_id: s.gauge,
                    name: None,
                    river: s.basin,
                    latitude: Some(s.latitude),
                    longitude: Some(s.longitude),
                    params: vec!["W".to_owned()],
                })
                .collect())
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<ReadingsBySource>> {
        Box::pin(async move {
            if requests.is_empty() {
                return Ok(HashMap::new());
            }

            let snapshot = match self.get_snapshot().await {
                Ok(s) => s,
                Err(err) => {
                    tracing::error!("SriLankaMevinuReader: failed to fetch snapshot: {err}");
                    return Ok(HashMap::new());
                }
            };
            let by_gauge: HashMap<&str, &Station> =
                snapshot.iter().map(|s| (s.gauge.as_str(), s)).collect();

            let mut results: ReadingsBySource = HashMap::new();

            for req in requests {
                let Some((gauge, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!(
                        "SriLankaMevinuReader: malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                };
                if param != "W" {
                    tracing::warn!("SriLankaMevinuReader: unknown param in '{}'", req.source_id);
                    continue;
                }
                let Some(station) = by_gauge.get(gauge) else {
                    tracing::warn!("SriLankaMevinuReader: unknown station '{gauge}'");
                    continue;
                };
                let Some(ts) = station.timestamp else {
                    continue;
                };
                if ts > req.from && ts <= req.to {
                    results
                        .entry(req.source_id.clone())
                        .or_default()
                        .push((ts, station.level_cm));
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Trimmed straight from the live feed (2026-08-15): one full station,
    /// one with a null geometry (should be skipped), one with null
    /// water_level (should be skipped).
    const SAMPLE_JSON: &str = r#"[
        {"attributes":{"objectid":1476823,"globalid":"be500a61","basin":"Kelani Ganga",
         "gauge":"Deraniyagala","water_level":2.78,"rain_fall":0,
         "CreationDate":1786740495538,"EditDate":1786740495538,
         "alertpull":4.8,"minorpull":5.8,"majorpull":7,"rate_of_rise":1.127},
         "geometry":{"x":80.339475,"y":6.925716666666666}},
        {"attributes":{"objectid":1,"globalid":"x","basin":"Nowhere","gauge":"NoGeom",
         "water_level":1.0,"EditDate":1786740000000},"geometry":null},
        {"attributes":{"objectid":2,"globalid":"y","basin":"Nowhere","gauge":"NoLevel",
         "water_level":null,"EditDate":1786740000000},
         "geometry":{"x":80.0,"y":7.0}}
    ]"#;

    #[test]
    fn parse_snapshot_extracts_valid_stations_only() {
        let stations = parse_snapshot(SAMPLE_JSON).expect("should parse");
        assert_eq!(stations.len(), 1);
        let s = &stations[0];
        assert_eq!(s.gauge, "Deraniyagala");
        assert_eq!(s.basin.as_deref(), Some("Kelani Ganga"));
        assert!((s.latitude - 6.925716666666666).abs() < 1e-9);
        assert!((s.longitude - 80.339475).abs() < 1e-9);
        assert!((s.level_cm - 278.0).abs() < 1e-9);
    }

    #[test]
    fn parse_snapshot_converts_edit_date_to_utc() {
        let stations = parse_snapshot(SAMPLE_JSON).unwrap();
        // 1786740495538 ms -> 2026-08-14T20:48:15Z
        assert_eq!(
            stations[0]
                .timestamp
                .unwrap()
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string(),
            "2026-08-14T20:48:15Z"
        );
    }

    #[test]
    fn parse_snapshot_invalid_json_returns_err() {
        assert!(parse_snapshot("not json").is_err());
    }

    /// Live smoke test - hits the real feed. Run explicitly with
    /// `cargo test -p river-gauge srilanka -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "live network access"]
    async fn live_smoke() {
        let reader = SriLankaMevinuReader::default();
        let stations = reader.list_stations().await.expect("list_stations");
        println!("Sri Lanka: {} stations", stations.len());
        assert!(stations.len() > 10, "expected >10 stations");
        assert!(
            stations
                .iter()
                .all(|s| s.latitude.is_some() && s.longitude.is_some())
        );

        let now = Utc::now();
        let requests: Vec<FetchRequest> = stations
            .iter()
            .map(|s| FetchRequest {
                source_id: format!("{}:W", s.station_id),
                from: now - chrono::Duration::hours(6),
                to: now,
            })
            .collect();
        let readings = reader.fetch_all(&requests).await.expect("fetch_all");
        let total: usize = readings.values().map(Vec::len).sum();
        println!(
            "Sri Lanka: {total} readings across {} stations",
            readings.len()
        );
        assert!(!readings.is_empty());
    }
}
