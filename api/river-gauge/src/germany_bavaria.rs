use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Berlin;
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for the Bavarian flood information service (HND Bayern / BLfU).
///
/// Source: https://www.hnd.bayern.de/
///
/// The site exposes a snapshot JSON endpoint used by the map overlay, updated
/// approximately every 15 minutes, that contains the latest reading for all
/// ~818 Bavarian gauge stations. There is no documented public REST API.
///
/// Because the snapshot covers all stations at once, the reader caches it for
/// [`CACHE_TTL_SECS`] seconds so the entire poll cycle issues one HTTP call.
///
/// Timestamps in the snapshot are in German local time (Europe/Berlin) and
/// are converted to UTC on ingestion.
///
/// `source_id` format: `"{station_id}:{param}"`
///   e.g. `"11418250:w"` (Breitach @ Tiefenbach, water level cm)
///        `"11418250:q"` (Breitach @ Tiefenbach, discharge m³/s)
///
/// Supported params: `w` (Wasserstand, water level), `q` (Abfluss, discharge)
pub struct GermanyBavariaReader {
    cache: Arc<Mutex<Option<SnapshotCache>>>,
}

const SNAPSHOT_URL: &str = "https://www.hnd.bayern.de/ajax/karte/pegel.json";
const CACHE_TTL_SECS: i64 = 60;

struct SnapshotCache {
    fetched_at: DateTime<Utc>,
    stations: HashMap<String, StationData>,
}

struct StationData {
    /// Water level in cm, if available.
    level_cm: Option<f64>,
    /// Discharge in m³/s, if available.
    flow_m3s: Option<f64>,
    /// Timestamp of the reading in UTC.
    timestamp: DateTime<Utc>,
    /// River name from the snapshot (`zeile2`).
    river: Option<String>,
}

#[derive(Deserialize)]
struct SnapshotResponse {
    pointer: HashMap<String, PointerEntry>,
}

#[derive(Deserialize)]
struct PointerEntry {
    d: PointerData,
}

#[derive(Deserialize)]
struct PointerData {
    /// Water level string (German decimal comma), e.g. "28" or null.
    wert: Option<String>,
    /// Discharge string (German decimal comma), e.g. "7,82" or null.
    wert2: Option<String>,
    /// Timestamp in German local time: "DD.MM.YYYY, HH:MM".
    datum: String,
    /// River name, e.g. "Isar".
    zeile2: Option<String>,
}

impl Default for GermanyBavariaReader {
    fn default() -> Self {
        Self {
            cache: Arc::new(Mutex::new(None)),
        }
    }
}

fn parse_german_float(s: &str) -> Option<f64> {
    s.replace(',', ".").parse::<f64>().ok()
}

/// Parse "DD.MM.YYYY, HH:MM" in Europe/Berlin local time and return UTC.
fn parse_datum(datum: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(datum, "%d.%m.%Y, %H:%M").ok()?;
    Berlin
        .from_local_datetime(&naive)
        .earliest()
        .map(|dt| dt.with_timezone(&Utc))
}

impl GermanyBavariaReader {
    async fn get_snapshot(&self) -> anyhow::Result<HashMap<String, StationData>> {
        {
            let cache = self.cache.lock().await;
            if let Some(ref entry) = *cache {
                if (Utc::now() - entry.fetched_at).num_seconds() < CACHE_TTL_SECS {
                    // Return a new HashMap cloning the cached entries.
                    return Ok(rebuild_map(&entry.stations));
                }
            }
        }

        let resp: SnapshotResponse = reqwest::get(SNAPSHOT_URL)
            .await
            .map_err(|e| anyhow::anyhow!("BlfuReader: HTTP error: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("BlfuReader: JSON parse error: {e}"))?;

        let mut stations: HashMap<String, StationData> = HashMap::new();
        for (id, entry) in &resp.pointer {
            let Some(ts) = parse_datum(&entry.d.datum) else {
                continue;
            };
            stations.insert(
                id.clone(),
                StationData {
                    level_cm: entry.d.wert.as_deref().and_then(parse_german_float),
                    flow_m3s: entry.d.wert2.as_deref().and_then(parse_german_float),
                    timestamp: ts,
                    river: entry.d.zeile2.clone(),
                },
            );
        }

        let mut cache = self.cache.lock().await;
        *cache = Some(SnapshotCache {
            fetched_at: Utc::now(),
            stations,
        });

        Ok(rebuild_map(&cache.as_ref().unwrap().stations))
    }
}

fn rebuild_map(stations: &HashMap<String, StationData>) -> HashMap<String, StationData> {
    stations
        .iter()
        .map(|(k, v)| {
            (
                k.clone(),
                StationData {
                    level_cm: v.level_cm,
                    flow_m3s: v.flow_m3s,
                    timestamp: v.timestamp,
                    river: v.river.clone(),
                },
            )
        })
        .collect()
}

/// Pegelnummer -> WGS84, scraped once from the HND stammdaten UTM coordinates
/// (pegel.json has none). Ids not listed get no coordinates.
const STATION_COORDS: &str = include_str!("../data/germany_bavaria_coords.csv");

/// Parse the embedded coordinate table into a Pegelnummer -> (lat, lon) map.
fn coord_lookup() -> HashMap<&'static str, (f64, f64)> {
    STATION_COORDS
        .lines()
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .filter_map(|l| {
            let mut it = l.split(',');
            let id = it.next()?;
            let lat = it.next()?.trim().parse().ok()?;
            let lon = it.next()?.trim().parse().ok()?;
            Some((id, (lat, lon)))
        })
        .collect()
}

impl GaugeReader for GermanyBavariaReader {
    fn provider_key(&self) -> &'static str {
        "by"
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async move {
            let snapshot = self.get_snapshot().await?;
            let coords = coord_lookup();
            let mut stations: Vec<StationInfo> = snapshot
                .into_iter()
                .map(|(id, data)| {
                    let mut params = Vec::new();
                    if data.level_cm.is_some() {
                        params.push("w".to_owned());
                    }
                    if data.flow_m3s.is_some() {
                        params.push("q".to_owned());
                    }
                    let (latitude, longitude) = coords
                        .get(id.as_str())
                        .map_or((None, None), |&(lat, lon)| (Some(lat), Some(lon)));
                    StationInfo {
                        station_id: id,
                        name: None,
                        river: data.river,
                        latitude,
                        longitude,
                        params,
                    }
                })
                .collect();
            stations.sort_by(|a, b| a.station_id.cmp(&b.station_id));
            Ok(stations)
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            // Parse and validate all source_ids.
            let parsed: Vec<(&str, &str, &FetchRequest)> = requests
                .iter()
                .filter_map(|req| {
                    match req.source_id.split_once(':') {
                        Some((station_id, param)) => Some((station_id, param, req)),
                        None => {
                            tracing::warn!(
                                "BlfuReader: ignoring malformed source_id '{}' (expected '{{station_id}}:{{param}}')",
                                req.source_id
                            );
                            None
                        }
                    }
                })
                .collect();

            if parsed.is_empty() {
                return Ok(HashMap::new());
            }

            // Fetch or return cached snapshot.
            let stations = match self.get_snapshot().await {
                Ok(s) => s,
                Err(err) => {
                    tracing::error!("BlfuReader: failed to fetch snapshot: {err}");
                    return Ok(HashMap::new());
                }
            };

            // Extract and filter one reading per request.
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
            let requested_ids: HashSet<&str> = parsed.iter().map(|(id, _, _)| *id).collect();
            let _ = requested_ids; // used for potential future filtering

            for (station_id, param, req) in &parsed {
                let Some(data) = stations.get(*station_id) else {
                    continue;
                };
                let value = match *param {
                    "w" => data.level_cm,
                    "q" => data.flow_m3s,
                    other => {
                        tracing::warn!(
                            "BlfuReader: unknown param '{}' for station {}",
                            other,
                            station_id
                        );
                        continue;
                    }
                };
                let Some(val) = value else {
                    continue;
                };
                if data.timestamp > req.from && data.timestamp <= req.to {
                    results
                        .entry(req.source_id.clone())
                        .or_default()
                        .push((data.timestamp, val));
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_german_float ---

    #[test]
    fn parse_german_float_plain() {
        assert_eq!(parse_german_float("28"), Some(28.0));
    }

    #[test]
    fn parse_german_float_comma_decimal() {
        assert_eq!(parse_german_float("7,82"), Some(7.82));
    }

    #[test]
    fn parse_german_float_dot_decimal() {
        assert_eq!(parse_german_float("7.82"), Some(7.82));
    }

    #[test]
    fn parse_german_float_non_numeric_returns_none() {
        assert!(parse_german_float("---").is_none());
        assert!(parse_german_float("").is_none());
    }

    // --- parse_datum ---

    #[test]
    fn parse_datum_valid_converts_to_utc() {
        // "12.05.2026, 12:00" in Berlin CEST (UTC+2) = 10:00 UTC
        let utc = parse_datum("12.05.2026, 12:00").expect("should parse");
        assert_eq!(utc.timestamp(), 1778580000);
    }

    #[test]
    fn parse_datum_winter_time_uses_cet() {
        // "12.01.2026, 12:00" in Berlin CET (UTC+1) = 11:00 UTC
        let utc = parse_datum("12.01.2026, 12:00").expect("should parse winter");
        assert_eq!(utc.timestamp(), 1768215600);
    }

    #[test]
    fn parse_datum_invalid_returns_none() {
        assert!(parse_datum("not-a-date").is_none());
        assert!(parse_datum("").is_none());
    }
}
