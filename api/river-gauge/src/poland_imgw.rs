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

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            Ok(vec![
                StationInfo {
                    station_id: "149200080".to_owned(),
                    name: Some("Mszana Dolana".to_owned()),
                    river: Some("Mszanka".to_owned()),
                    latitude: Some(49.674301),
                    longitude: Some(20.0804),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "149200100".to_owned(),
                    name: Some("Lysa Polana".to_owned()),
                    river: Some("Bialka".to_owned()),
                    latitude: Some(49.263599),
                    longitude: Some(20.115),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "149200110".to_owned(),
                    name: Some("Trybsz 2".to_owned()),
                    river: Some("Bialka".to_owned()),
                    latitude: Some(49.417801),
                    longitude: Some(20.1175),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "149200120".to_owned(),
                    name: Some("Niedzica".to_owned()),
                    river: Some("Niedziczanka".to_owned()),
                    latitude: Some(49.411301),
                    longitude: Some(20.302299),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "149200150".to_owned(),
                    name: Some("Tylmanowa".to_owned()),
                    river: Some("Ochotnica".to_owned()),
                    latitude: Some(49.5172),
                    longitude: Some(20.3869),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "150150030".to_owned(),
                    name: Some("Jakuszyce".to_owned()),
                    river: Some("Kamienna".to_owned()),
                    latitude: Some(50.822701),
                    longitude: Some(15.4397),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "150150050".to_owned(),
                    name: Some("Piechowice".to_owned()),
                    river: Some("Kamiena".to_owned()),
                    latitude: Some(50.850101),
                    longitude: Some(15.5732),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "150150190".to_owned(),
                    name: Some("Podgorzyn".to_owned()),
                    river: Some("Podgorna".to_owned()),
                    latitude: Some(50.820301),
                    longitude: Some(15.6832),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "150160110".to_owned(),
                    name: Some("Szalejów Dolny".to_owned()),
                    river: Some("Bystrzyca Dusznicka".to_owned()),
                    latitude: Some(50.419701),
                    longitude: Some(16.6047),
                    params: vec!["Q".to_owned()],
                },
            ])
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
                if let Some((station_id, param)) = req
                    .source_id
                    .splitn(2, ':')
                    .collect::<Vec<_>>()
                    .as_slice()
                    .split_first()
                    .and_then(|(a, b)| b.first().map(|p| (*a, *p)))
                {
                    station_map
                        .entry(station_id)
                        .or_default()
                        .push((param, &req.source_id));
                } else {
                    tracing::warn!("PolandImgwReader: malformed source_id '{}'", req.source_id);
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
