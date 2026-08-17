use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Warsaw;
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Polish hydrological data (IMGW-PIB).
///
/// Source: https://danepubliczne.imgw.pl/
/// Documentation: https://danepubliczne.imgw.pl/apiinfo
///
/// The API returns only the most recent snapshot for each station; there is
/// no historical time-series endpoint. The single reading is returned as a
/// one-element series when it falls within the requested time window.
///
/// `source_id` format: `"{station_id}:{param}"`
///   e.g. `"149200080:W"` (water level, cm)
///        `"149200080:Q"` (discharge, m3/s)
///
/// `W` = stan_wody (water level, cm)
/// `Q` = przeplyw  (discharge, m3/s)
pub struct PolandImgwReader;

const BASE_URL: &str = "https://danepubliczne.imgw.pl/api/data/hydro/id";

/// Full hydrological catalog endpoint, used by `list_stations`.
///
/// Returns every IMGW hydro station in a single response, each with station
/// id, name, river, coordinates, and the latest water level / discharge
/// readings. (The `hydro2` variant currently returns an empty body, so this
/// classic endpoint is the reliable source of the full catalog.)
const CATALOG_URL: &str = "https://danepubliczne.imgw.pl/api/data/hydro";

/// One station entry from the full catalog endpoint.
///
/// Coordinates and readings arrive as strings, so they are parsed lazily.
#[derive(Deserialize)]
struct CatalogStation {
    id_stacji: String,
    #[serde(rename = "stacja")]
    name: Option<String>,
    #[serde(rename = "rzeka")]
    river: Option<String>,
    lat: Option<String>,
    lon: Option<String>,
    #[serde(rename = "stan_wody")]
    level_cm: Option<String>,
    #[serde(rename = "przeplyw")]
    flow: Option<String>,
}

/// Parse a coordinate string (e.g. `"51.5253"`) into an `f64`, treating
/// empty or unparseable values as absent.
fn parse_coord(s: &Option<String>) -> Option<f64> {
    s.as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .and_then(|v| v.replace(',', ".").parse::<f64>().ok())
        // IMGW uses "0" for a missing coordinate; treat zero as absent.
        .filter(|v| v.abs() > 0.001)
}

#[derive(Deserialize)]
struct Snapshot {
    #[serde(rename = "stan_wody")]
    level_cm: Option<String>,
    #[serde(rename = "stan_wody_data_pomiaru")]
    level_time: Option<String>,
    #[serde(rename = "przeplyw")]
    flow: Option<String>,
    #[serde(rename = "przeplyw_data")]
    flow_time: Option<String>,
}

/// Parse a Warsaw-local timestamp string `"YYYY-MM-DD HH:MM:SS"` to UTC.
fn parse_timestamp(s: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%d %H:%M:%S").ok()?;
    Warsaw
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.with_timezone(&Utc))
}

impl GaugeReader for PolandImgwReader {
    fn provider_key(&self) -> &'static str {
        "pl"
    }

    /// Discover the whole IMGW hydro catalog live from `/api/data/hydro`.
    ///
    /// Every station that currently exposes a water level (`W`) or discharge
    /// (`Q`) reading is returned. IMGW provides coordinates for its stations,
    /// so latitude/longitude are populated when present.
    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            let body = reqwest::get(CATALOG_URL)
                .await
                .map_err(|e| anyhow::anyhow!("PolandImgwReader: HTTP error fetching catalog: {e}"))?
                .error_for_status()
                .map_err(|e| {
                    anyhow::anyhow!("PolandImgwReader: server error fetching catalog: {e}")
                })?
                .text()
                .await
                .map_err(|e| {
                    anyhow::anyhow!("PolandImgwReader: failed to read catalog body: {e}")
                })?;

            let stations: Vec<CatalogStation> = serde_json::from_str(&body).map_err(|e| {
                let preview = body.chars().take(200).collect::<String>();
                anyhow::anyhow!(
                    "PolandImgwReader: catalog JSON parse error: {e} - body: {preview:?}"
                )
            })?;

            let out = stations
                .into_iter()
                .filter_map(|s| {
                    // A field is treated as supported only when it carries a
                    // non-empty reading in the snapshot. Order: water level, discharge.
                    let mut params = Vec::new();
                    if s.level_cm.as_deref().is_some_and(|v| !v.trim().is_empty()) {
                        params.push("W".to_owned());
                    }
                    if s.flow.as_deref().is_some_and(|v| !v.trim().is_empty()) {
                        params.push("Q".to_owned());
                    }
                    // Keep only real water gauges - those exposing level or discharge.
                    if params.is_empty() {
                        return None;
                    }
                    Some(StationInfo {
                        station_id: s.id_stacji,
                        name: s.name,
                        river: s.river,
                        latitude: parse_coord(&s.lat),
                        longitude: parse_coord(&s.lon),
                        params,
                    })
                })
                .collect();
            Ok(out)
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

            // Collect unique station IDs and map each request source_id to its parts.
            let mut station_map: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();
            for req in requests {
                match req.source_id.split_once(':') {
                    Some((station_id, param)) => {
                        station_map
                            .entry(station_id)
                            .or_default()
                            .push((param, &req.source_id));
                    }
                    None => {
                        tracing::warn!("PolandImgwReader: malformed source_id '{}'", req.source_id);
                    }
                }
            }

            for (station_id, params) in &station_map {
                let url = format!("{BASE_URL}/{station_id}");
                let resp = reqwest::get(&url).await;
                let snapshot: Snapshot = match resp {
                    Ok(r) => {
                        let arr: Vec<Snapshot> = match r.json().await {
                            Ok(v) => v,
                            Err(e) => {
                                tracing::warn!(
                                    "PolandImgwReader: JSON parse error for {station_id}: {e}"
                                );
                                continue;
                            }
                        };
                        match arr.into_iter().next() {
                            Some(s) => s,
                            None => {
                                tracing::warn!("PolandImgwReader: empty response for {station_id}");
                                continue;
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("PolandImgwReader: HTTP error for {station_id}: {e}");
                        continue;
                    }
                };

                // Find the from/to window for this station's requests.
                let window = requests
                    .iter()
                    .filter(|r| r.source_id.starts_with(station_id))
                    .fold(None::<(DateTime<Utc>, DateTime<Utc>)>, |acc, r| {
                        Some(acc.map_or((r.from, r.to), |(f, t)| (f.min(r.from), t.max(r.to))))
                    });

                for (param, source_id) in params {
                    let (value_str, time_str) = match *param {
                        "W" => (snapshot.level_cm.as_deref(), snapshot.level_time.as_deref()),
                        "Q" => (snapshot.flow.as_deref(), snapshot.flow_time.as_deref()),
                        other => {
                            tracing::warn!("PolandImgwReader: unknown param '{other}'");
                            continue;
                        }
                    };

                    let (Some(val_s), Some(ts_s)) = (value_str, time_str) else {
                        continue;
                    };
                    let Ok(value) = val_s.trim().replace(',', ".").parse::<f64>() else {
                        continue;
                    };
                    let Some(ts) = parse_timestamp(ts_s) else {
                        continue;
                    };

                    if let Some((from, to)) = window {
                        if ts >= from && ts <= to {
                            results
                                .entry(source_id.to_string())
                                .or_default()
                                .push((ts, value));
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

    #[test]
    fn parse_timestamp_converts_warsaw_time() {
        // Warsaw is UTC+1 in winter, UTC+2 in summer (CEST).
        // 2024-06-15 12:00:00 Warsaw CEST = UTC+2 -> 10:00:00 UTC
        let ts = parse_timestamp("2024-06-15 12:00:00").unwrap();
        assert_eq!(
            ts.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2024-06-15T10:00:00Z"
        );
    }

    #[test]
    fn parse_timestamp_winter() {
        // 2024-01-15 08:00:00 Warsaw CET = UTC+1 -> 07:00:00 UTC
        let ts = parse_timestamp("2024-01-15 08:00:00").unwrap();
        assert_eq!(
            ts.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2024-01-15T07:00:00Z"
        );
    }
}
