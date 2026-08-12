use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Ireland's OPW (Office of Public Works) hydrometric network via
/// the public waterlevel.ie GeoJSON snapshot.
///
/// Source: https://waterlevel.ie/
///
/// No auth, no key. Data is **CC-BY 4.0** - attribute "Contains Irish Public
/// Sector Information licensed under CC BY 4.0 (source http://waterlevel.ie -
/// provided by the Office of Public Works.)".
///
/// The feed carries one entry per station per sensor; this reader keeps only
/// `sensor_ref == "0001"`, the primary staff-gauge water level (no
/// discharge/flow sensor exists on this feed - see `ireland_riverspy` for a
/// handful of dam-release flow gauges). Station code is the last 5 digits of
/// `station_ref` (e.g. `"0000001041"` -> `"01041"`), matching the monthly
/// history CSV's filename.
///
/// `source_id` format: `"{5-digit station code}:W"` (water level, converted
/// to cm) - there is no `Q`.
pub struct IrelandOpwReader;

const LATEST_URL: &str = "https://waterlevel.ie/geojson/latest/";
const PRIMARY_SENSOR: &str = "0001";
const M_TO_CM: f64 = 100.0;

#[derive(Deserialize)]
struct FeatureCollection {
    features: Vec<Feature>,
}

#[derive(Deserialize)]
struct Feature {
    properties: Properties,
    geometry: Option<Geometry>,
}

#[derive(Deserialize)]
struct Properties {
    station_ref: String,
    station_name: Option<String>,
    sensor_ref: String,
}

#[derive(Deserialize)]
struct Geometry {
    /// `[lon, lat]`.
    coordinates: Vec<f64>,
}

/// Last 5 digits of a station_ref, e.g. `"0000001041"` -> `"01041"`.
fn station_code(station_ref: &str) -> &str {
    let len = station_ref.len();
    &station_ref[len.saturating_sub(5)..]
}

impl GaugeReader for IrelandOpwReader {
    fn provider_key(&self) -> &'static str {
        "opw"
    }

    /// The monthly history CSV holds a rolling ~5-week window.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::weeks(5))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let fc: FeatureCollection = reqwest::get(LATEST_URL)
                .await
                .map_err(|e| anyhow::anyhow!("IrelandOpwReader: HTTP error: {e}"))?
                .error_for_status()
                .map_err(|e| anyhow::anyhow!("IrelandOpwReader: server error: {e}"))?
                .json()
                .await
                .map_err(|e| anyhow::anyhow!("IrelandOpwReader: JSON parse error: {e}"))?;

            Ok(fc
                .features
                .into_iter()
                .filter(|f| f.properties.sensor_ref == PRIMARY_SENSOR)
                .map(|f| {
                    let (lat, lon) = match f.geometry.as_ref().map(|g| g.coordinates.as_slice()) {
                        Some([lon, lat]) => (Some(*lat), Some(*lon)),
                        _ => (None, None),
                    };
                    StationInfo {
                        station_id: station_code(&f.properties.station_ref).to_owned(),
                        name: f.properties.station_name,
                        river: None,
                        latitude: lat,
                        longitude: lon,
                        params: vec!["W".to_owned()],
                    }
                })
                .collect())
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!("IrelandOpwReader: malformed source_id '{}'", req.source_id);
                    continue;
                };
                if param != "W" {
                    tracing::warn!("IrelandOpwReader: unknown param in '{}'", req.source_id);
                    continue;
                }

                let url = format!("https://waterlevel.ie/data/month/{station_id}_{PRIMARY_SENSOR}.csv");
                let body = match reqwest::get(&url).await {
                    Ok(r) if r.status().is_success() => match r.text().await {
                        Ok(t) => t,
                        Err(e) => {
                            tracing::warn!("IrelandOpwReader: read error for {station_id}: {e}");
                            continue;
                        }
                    },
                    Ok(r) => {
                        tracing::warn!("IrelandOpwReader: HTTP {} for {station_id}", r.status());
                        continue;
                    }
                    Err(e) => {
                        tracing::warn!("IrelandOpwReader: request error for {station_id}: {e}");
                        continue;
                    }
                };

                let series = results.entry(req.source_id.clone()).or_default();
                for line in body.lines() {
                    let Some((ts_str, val_str)) = line.split_once(',') else {
                        continue;
                    };
                    // "2026-07-08 16:00" - space-separated, no seconds, no
                    // offset; the site's own docs say timestamps are UTC/GMT.
                    let Ok(naive) = NaiveDateTime::parse_from_str(ts_str.trim(), "%Y-%m-%d %H:%M")
                    else {
                        continue; // also skips a header row, if present
                    };
                    let Ok(value) = val_str.trim().parse::<f64>() else {
                        continue;
                    };
                    let ts = naive.and_utc();
                    if ts <= req.from || ts > req.to {
                        continue;
                    }
                    series.push((ts, value * M_TO_CM));
                }
                series.sort_by_key(|(ts, _)| *ts);
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn station_code_takes_last_5_digits() {
        assert_eq!(station_code("0000001041"), "01041");
        assert_eq!(station_code("01041"), "01041");
    }

    #[test]
    fn level_converts_metres_to_cm() {
        assert!((0.212_f64 * M_TO_CM - 21.2).abs() < 1e-9);
    }
}
