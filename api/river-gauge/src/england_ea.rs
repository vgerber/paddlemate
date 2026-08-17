use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer};

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for England's Environment Agency (EA) real-time flood-monitoring API.
///
/// Source: https://environment.data.gov.uk/flood-monitoring/doc/reference
///
/// Fully open: no API key, no documented rate limit, OGL v3 licensed
/// ("this uses Environment Agency flood and river level data from the
/// real-time data API (Beta)"). Covers England only - `nrw`/`sepa`/`opw`
/// cover Wales/Scotland/Ireland.
///
/// `list_stations` uses the server-side `?parameter=level` / `?parameter=flow`
/// filters (two requests) to discover every gauge with either measure.
///
/// Each measurement is its own "measure" resource whose id is not
/// reconstructable from the station reference alone - each station's bulk
/// list entry already embeds its `measures[]`, though, so `fetch_all` reuses
/// the same two bulk requests (not one lookup per station) to resolve them
/// before requesting readings. The per-measure `readings` endpoint only
/// retains ~28-30 days; deeper history would need the separate daily archive
/// CSVs, not implemented here.
///
/// `source_id` format: `"{stationReference}:{param}"`
///   e.g. `"1029TH:W"` (water level, converted to cm)
///        `"4036:Q"`   (discharge, m³/s - already this app's unit)
pub struct EnglandEaReader;

const STATIONS_URL: &str = "https://environment.data.gov.uk/flood-monitoring/id/stations";

/// A tiny number of stations carry `label` (and, separately, `lat`/`long`) as
/// a single-element array instead of a plain value (e.g. station `0018`);
/// take the first element either way.
fn de_flexible_label<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Flexible {
        One(String),
        Many(Vec<String>),
    }
    Ok(match Option::<Flexible>::deserialize(deserializer)? {
        Some(Flexible::One(s)) => Some(s),
        Some(Flexible::Many(v)) => v.into_iter().next(),
        None => None,
    })
}

fn de_flexible_f64<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Flexible {
        One(f64),
        Many(Vec<f64>),
    }
    Ok(match Option::<Flexible>::deserialize(deserializer)? {
        Some(Flexible::One(v)) => Some(v),
        Some(Flexible::Many(v)) => v.into_iter().next(),
        None => None,
    })
}

#[derive(Deserialize)]
struct StationsResponse {
    items: Vec<StationItem>,
}

#[derive(Deserialize)]
struct StationItem {
    #[serde(rename = "stationReference")]
    station_reference: String,
    #[serde(default, deserialize_with = "de_flexible_label")]
    label: Option<String>,
    #[serde(rename = "riverName")]
    river_name: Option<String>,
    #[serde(default, deserialize_with = "de_flexible_f64")]
    lat: Option<f64>,
    #[serde(default, deserialize_with = "de_flexible_f64")]
    long: Option<f64>,
    #[serde(default)]
    measures: Vec<Measure>,
}

#[derive(Deserialize)]
struct Measure {
    parameter: String,
    /// The measure resource URL; its last path segment is the notation used
    /// in `/id/measures/{notation}/readings`.
    #[serde(rename = "@id")]
    id: String,
}

impl Measure {
    fn notation(&self) -> &str {
        self.id.rsplit('/').next().unwrap_or(&self.id)
    }
}

#[derive(Deserialize)]
struct ReadingsResponse {
    items: Vec<Reading>,
}

#[derive(Deserialize)]
struct Reading {
    #[serde(rename = "dateTime")]
    date_time: String,
    value: f64,
}

const M_TO_CM: f64 = 100.0;

impl GaugeReader for EnglandEaReader {
    fn provider_key(&self) -> &'static str {
        "ea"
    }

    /// The per-measure readings endpoint only retains ~28-30 days.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(28))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            struct Accum {
                name: Option<String>,
                river: Option<String>,
                lat: Option<f64>,
                lon: Option<f64>,
                has_w: bool,
                has_q: bool,
            }
            let mut stations: HashMap<String, Accum> = HashMap::new();

            for (ea_param, key) in [("level", "W"), ("flow", "Q")] {
                let url = format!("{STATIONS_URL}?parameter={ea_param}&_limit=100000");
                let resp: StationsResponse = reqwest::get(&url)
                    .await
                    .map_err(|e| anyhow::anyhow!("EnglandEaReader: HTTP error: {e}"))?
                    .error_for_status()
                    .map_err(|e| anyhow::anyhow!("EnglandEaReader: server error: {e}"))?
                    .json()
                    .await
                    .map_err(|e| anyhow::anyhow!("EnglandEaReader: JSON parse error: {e}"))?;

                for s in resp.items {
                    // `parameter=level` also matches the national tide-gauge
                    // network EA hosts (Shetland, Stornoway, ...), which
                    // shares the same "level" parameter type as river stage
                    // but sits far outside England. Drop those coordinates.
                    let (lat, lon) = match (s.lat, s.long) {
                        (Some(lat), Some(lon))
                            if (49.5..=56.0).contains(&lat) && (-6.5..=2.0).contains(&lon) =>
                        {
                            (Some(lat), Some(lon))
                        }
                        _ => (None, None),
                    };
                    let entry = stations
                        .entry(s.station_reference)
                        .or_insert_with(|| Accum {
                            name: s.label,
                            river: s.river_name,
                            lat,
                            lon,
                            has_w: false,
                            has_q: false,
                        });
                    match key {
                        "W" => entry.has_w = true,
                        "Q" => entry.has_q = true,
                        _ => {}
                    }
                }
            }

            Ok(stations
                .into_iter()
                .map(|(station_id, a)| {
                    let mut params = Vec::new();
                    if a.has_w {
                        params.push("W".to_owned());
                    }
                    if a.has_q {
                        params.push("Q".to_owned());
                    }
                    StationInfo {
                        station_id,
                        name: a.name,
                        river: a.river,
                        latitude: a.lat,
                        longitude: a.lon,
                        params,
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

            let mut wanted: HashMap<&str, Vec<&FetchRequest>> = HashMap::new();
            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!("EnglandEaReader: malformed source_id '{}'", req.source_id);
                    continue;
                };
                if param != "W" && param != "Q" {
                    tracing::warn!("EnglandEaReader: unknown param in '{}'", req.source_id);
                    continue;
                }
                wanted.entry(station_id).or_default().push(req);
            }
            if wanted.is_empty() {
                return Ok(results);
            }

            // Resolve station -> measure notation via the same two bulk lists
            // `list_stations` uses, instead of one lookup per station.
            let mut notation_for: HashMap<(String, &'static str), String> = HashMap::new();
            for (ea_param, key) in [("level", "W"), ("flow", "Q")] {
                let url = format!("{STATIONS_URL}?parameter={ea_param}&_limit=100000");
                let resp: StationsResponse = match reqwest::get(&url).await {
                    Ok(r) if r.status().is_success() => match r.json().await {
                        Ok(v) => v,
                        Err(e) => {
                            tracing::error!("EnglandEaReader: JSON parse error: {e}");
                            continue;
                        }
                    },
                    Ok(r) => {
                        tracing::error!("EnglandEaReader: HTTP {}", r.status());
                        continue;
                    }
                    Err(e) => {
                        tracing::error!("EnglandEaReader: request error: {e}");
                        continue;
                    }
                };
                for s in resp.items {
                    if !wanted.contains_key(s.station_reference.as_str()) {
                        continue;
                    }
                    if let Some(m) = s.measures.iter().find(|m| m.parameter == ea_param) {
                        notation_for
                            .entry((s.station_reference.clone(), key))
                            .or_insert_with(|| m.notation().to_owned());
                    }
                }
            }

            for (station_id, reqs) in &wanted {
                for req in reqs {
                    let Some((_, param)) = req.source_id.rsplit_once(':') else {
                        continue;
                    };
                    let Some(notation) = notation_for.get(&(station_id.to_string(), param)) else {
                        continue;
                    };

                    let url = format!(
                        "https://environment.data.gov.uk/flood-monitoring/id/measures/{notation}/readings\
                         ?startdate={}&enddate={}&_sorted",
                        req.from.format("%Y-%m-%d"),
                        req.to.format("%Y-%m-%d"),
                    );
                    let readings: ReadingsResponse = match reqwest::get(&url).await {
                        Ok(r) if r.status().is_success() => match r.json().await {
                            Ok(v) => v,
                            Err(e) => {
                                tracing::warn!(
                                    "EnglandEaReader: JSON parse error for {notation}: {e}"
                                );
                                continue;
                            }
                        },
                        Ok(r) => {
                            tracing::warn!("EnglandEaReader: HTTP {} for {notation}", r.status());
                            continue;
                        }
                        Err(e) => {
                            tracing::warn!("EnglandEaReader: request error for {notation}: {e}");
                            continue;
                        }
                    };

                    let series = results.entry(req.source_id.clone()).or_default();
                    for r in readings.items {
                        let Ok(ts) = DateTime::parse_from_rfc3339(&r.date_time) else {
                            continue;
                        };
                        let ts = ts.with_timezone(&Utc);
                        if ts <= req.from || ts > req.to {
                            continue;
                        }
                        let value = if param == "W" {
                            r.value * M_TO_CM
                        } else {
                            r.value
                        };
                        series.push((ts, value));
                    }
                    series.sort_by_key(|(ts, _)| *ts);
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use serde::de::IntoDeserializer;

    use super::*;

    #[test]
    fn level_converts_metres_to_cm() {
        assert!((0.28_f64 * M_TO_CM - 28.0).abs() < 1e-9);
    }

    #[test]
    fn flexible_label_accepts_plain_string() {
        let val = serde_json::json!("Bourton Dickler");
        let v: Option<String> = de_flexible_label(val.into_deserializer()).unwrap();
        assert_eq!(v.as_deref(), Some("Bourton Dickler"));
    }

    #[test]
    fn flexible_label_accepts_array_and_takes_first() {
        let val = serde_json::json!(["Erith Deep Wharf", "Erith Deep Wharf TL"]);
        let v: Option<String> = de_flexible_label(val.into_deserializer()).unwrap();
        assert_eq!(v.as_deref(), Some("Erith Deep Wharf"));
    }

    #[test]
    fn flexible_f64_accepts_plain_number() {
        let val = serde_json::json!(51.874767);
        let v: Option<f64> = de_flexible_f64(val.into_deserializer()).unwrap();
        assert_eq!(v, Some(51.874767));
    }

    #[test]
    fn flexible_f64_accepts_array_and_takes_first() {
        let val = serde_json::json!([51.874767, 51.874768]);
        let v: Option<f64> = de_flexible_f64(val.into_deserializer()).unwrap();
        assert_eq!(v, Some(51.874767));
    }
}
