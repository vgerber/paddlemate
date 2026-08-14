use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;

use crate::{BoxFuture, FetchRequest, GaugeReader, ReadingsBySource, SnapshotCache, StationInfo};

/// Reader for Nepal's national river-watch network, via the Department of
/// Hydrology and Meteorology (DHM).
///
/// Source: `POST https://dhm.gov.np/site/riverWatchTableViewData`
///
/// No auth, no body required. One JSON array with the latest reading for
/// all 337 monitored stations (verified live: 203 currently reporting a
/// value; the rest carry a blank `waterLevel` and are skipped). Latest
/// values only - no history endpoint found - so this is a snapshot provider
/// (`history_depth` = `None`).
///
/// No stated license; Government of Nepal service - attribute DHM.
///
/// **No coordinates in this endpoint** (same situation as `wales_nrw`): the
/// site's map view implies a separate coordinate-bearing endpoint exists
/// (triggered by a serialized filter form, `getRiverWatchMapFilterData`),
/// but its exact request shape wasn't cracked - `list_stations` ships
/// without lat/lon for now, revisit if that endpoint gets found.
///
/// **Unit not independently confirmed**: `waterLevel.value` is stored as-is
/// with no conversion. Station names cover major whitewater rivers/put-ins
/// (Kali Gandaki at Jomsom, Karnali at Chisapani, Bhote Koshi at Kodari,
/// Trishuli/Narayani at Narayanghat) but the reported magnitude (e.g. ~20
/// for Bhote Koshi at Kodari, against a `warning_level` of 4.0) doesn't
/// obviously read as plain metres against its own thresholds - treat the
/// value as the provider's native, uninterpreted unit until confirmed
/// against a known station.
///
/// `source_id` format: `"{id}:W"`, e.g. `"4903:W"`.
#[derive(Default)]
pub struct NepalDhmReader {
    cache: SnapshotCache<Vec<Station>>,
}

const SNAPSHOT_URL: &str = "https://dhm.gov.np/site/riverWatchTableViewData";
const CACHE_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, Clone)]
struct Station {
    id: i64,
    name: Option<String>,
    basin: Option<String>,
    timestamp: DateTime<Utc>,
    value: f64,
}

#[derive(Deserialize)]
struct RiverWatchResponse {
    #[serde(default)]
    data: Vec<Row>,
}

#[derive(Deserialize)]
struct Row {
    id: i64,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    basin: Option<String>,
    /// Either `{"datetime": "...", "value": ...}` when the station has a
    /// current reading, or a blank string (`" "`) when it doesn't.
    #[serde(rename = "waterLevel", default)]
    water_level: Value,
}

/// Extract `(timestamp, value)` from the `waterLevel` field's object shape;
/// `None` for the blank-string "no current reading" case.
fn extract_reading(v: &Value) -> Option<(DateTime<Utc>, f64)> {
    let obj = v.as_object()?;
    let datetime = obj.get("datetime")?.as_str()?;
    let value = obj.get("value")?.as_f64()?;
    let ts = DateTime::parse_from_rfc3339(datetime)
        .ok()?
        .with_timezone(&Utc);
    Some((ts, value))
}

fn parse_snapshot(json: &str) -> anyhow::Result<Vec<Station>> {
    let resp: RiverWatchResponse = serde_json::from_str(json)
        .map_err(|e| anyhow::anyhow!("NepalDhmReader: JSON parse error: {e}"))?;

    Ok(resp
        .data
        .into_iter()
        .filter_map(|row| {
            let (timestamp, value) = extract_reading(&row.water_level)?;
            Some(Station {
                id: row.id,
                name: row.name.filter(|s| !s.trim().is_empty()),
                basin: row.basin.filter(|s| !s.trim().is_empty()),
                timestamp,
                value,
            })
        })
        .collect())
}

impl NepalDhmReader {
    async fn get_snapshot(&self) -> anyhow::Result<Vec<Station>> {
        let mut guard = self.cache.lock().await;

        if let Some((fetched_at, ref stations)) = *guard {
            if fetched_at.elapsed() < CACHE_TTL {
                return Ok(stations.clone());
            }
        }

        let client = reqwest::Client::new();
        let json = client
            .post(SNAPSHOT_URL)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("NepalDhmReader: HTTP error: {e}"))?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("NepalDhmReader: server error: {e}"))?
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("NepalDhmReader: read error: {e}"))?;

        let stations = parse_snapshot(&json)?;

        *guard = Some((Instant::now(), stations.clone()));
        Ok(stations)
    }
}

impl GaugeReader for NepalDhmReader {
    fn provider_key(&self) -> &'static str {
        "np"
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let snapshot = self.get_snapshot().await?;
            Ok(snapshot
                .into_iter()
                .map(|s| StationInfo {
                    station_id: s.id.to_string(),
                    name: s.name,
                    river: s.basin,
                    latitude: None,
                    longitude: None,
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
                    tracing::error!("NepalDhmReader: failed to fetch snapshot: {err}");
                    return Ok(HashMap::new());
                }
            };
            let by_id: HashMap<String, &Station> =
                snapshot.iter().map(|s| (s.id.to_string(), s)).collect();

            let mut results: ReadingsBySource = HashMap::new();

            for req in requests {
                let Some((id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!("NepalDhmReader: malformed source_id '{}'", req.source_id);
                    continue;
                };
                if param != "W" {
                    tracing::warn!("NepalDhmReader: unknown param in '{}'", req.source_id);
                    continue;
                }
                let Some(station) = by_id.get(id) else {
                    tracing::warn!("NepalDhmReader: unknown station '{id}'");
                    continue;
                };
                if station.timestamp > req.from && station.timestamp <= req.to {
                    results
                        .entry(req.source_id.clone())
                        .or_default()
                        .push((station.timestamp, station.value));
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
    /// one with a blank waterLevel (should be skipped).
    const SAMPLE_JSON: &str = r#"{"status":"success","data":[
        {"basin":"Koshi","id":4903,"stationIndex":"608","name":"Bhote Koshi at Kodari",
         "district":"Sindhupalchok","waterLevel":{"datetime":"2026-08-14T21:15:00+00:00","value":20.294},
         "warning_level":"4.0","danger_level":"","steady":"STEADY","status":"WARNING"},
        {"basin":"","id":4694,"stationIndex":"","name":"kokhajor khola at hariharpurgadi",
         "district":"","waterLevel":" ","warning_level":" ","danger_level":"","steady":"",
         "status":"BELOW WARNING LEVEL"}
    ]}"#;

    #[test]
    fn parse_snapshot_extracts_reporting_stations_only() {
        let stations = parse_snapshot(SAMPLE_JSON).expect("should parse");
        assert_eq!(stations.len(), 1);
        let s = &stations[0];
        assert_eq!(s.id, 4903);
        assert_eq!(s.name.as_deref(), Some("Bhote Koshi at Kodari"));
        assert_eq!(s.basin.as_deref(), Some("Koshi"));
        assert!((s.value - 20.294).abs() < 1e-9);
        assert_eq!(
            s.timestamp.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-08-14T21:15:00Z"
        );
    }

    #[test]
    fn extract_reading_handles_blank_string() {
        assert_eq!(extract_reading(&Value::String(" ".to_owned())), None);
    }

    #[test]
    fn parse_snapshot_invalid_json_returns_err() {
        assert!(parse_snapshot("not json").is_err());
    }

    /// Live smoke test - hits the real feed. Run explicitly with
    /// `cargo test -p river-gauge nepal -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "live network access"]
    async fn live_smoke() {
        let reader = NepalDhmReader::default();
        let stations = reader.list_stations().await.expect("list_stations");
        println!("Nepal: {} reporting stations", stations.len());
        assert!(stations.len() > 100, "expected >100 reporting stations");

        let now = Utc::now();
        let requests: Vec<FetchRequest> = stations
            .iter()
            .take(20)
            .map(|s| FetchRequest {
                source_id: format!("{}:W", s.station_id),
                from: now - chrono::Duration::hours(6),
                to: now,
            })
            .collect();
        let readings = reader.fetch_all(&requests).await.expect("fetch_all");
        let total: usize = readings.values().map(Vec::len).sum();
        println!("Nepal: {total} readings across {} stations", readings.len());
        assert!(!readings.is_empty());
    }
}
