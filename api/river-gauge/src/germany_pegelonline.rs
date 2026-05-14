use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for German federal waterway gauge data (PEGELONLINE WSV).
///
/// Source: https://www.pegelonline.wsv.de/
/// REST API: https://pegelonline.wsv.de/webservices/rest-api/v2/
///
/// PEGELONLINE publishes 785 stations on German federal waterways (Elbe, Rhine,
/// Main, Moselle, Danube, Weser, Ems, …). Each station is identified by a UUID.
/// Measurements are available at 15-minute resolution; the API supports ISO 8601
/// period (`PT2H`) or absolute datetime range queries.
///
/// `source_id` format: `"{station_uuid}:{param}"`
///   e.g. `"70272185-b2b3-4178-96b8-43bea330dcae:W"` (water level, cm, Dresden / Elbe)
///        `"70272185-b2b3-4178-96b8-43bea330dcae:Q"` (discharge, m³/s)
///
/// `W` = WASSERSTAND ROHDATEN (water level, cm)
/// `Q` = ABFLUSS_ROHDATEN    (discharge, m³/s)
///
/// The fetch issues one HTTP request per station UUID over the requested window.
/// Responses carry timezone-offset timestamps, e.g. `"2026-05-14T09:30:00+02:00"`.
pub struct GermanyPegelonlineReader;

const BASE_URL: &str = "https://pegelonline.wsv.de/webservices/rest-api/v2/stations";

#[derive(Deserialize)]
struct Measurement {
    timestamp: String,
    value: f64,
}

#[derive(Deserialize)]
struct PoStation {
    uuid: String,
    shortname: String,
    #[serde(default)]
    latitude: Option<f64>,
    #[serde(default)]
    longitude: Option<f64>,
    water: PoWater,
    #[serde(default)]
    timeseries: Vec<PoTimeseries>,
}

#[derive(Deserialize)]
struct PoWater {
    shortname: String,
}

#[derive(Deserialize)]
struct PoTimeseries {
    shortname: String,
}

impl GaugeReader for GermanyPegelonlineReader {
    fn provider_key(&self) -> &'static str {
        "po"
    }

    /// PEGELONLINE retains 30 days of raw 15-minute data; older archives exist
    /// but require a different endpoint. We advertise 30 days conservatively.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(30))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let url = format!("{BASE_URL}.json?includeTimeseries=true");
            let stations: Vec<PoStation> = reqwest::get(&url)
                .await
                .map_err(|e| anyhow::anyhow!("PegelonlineReader: list_stations HTTP error: {e}"))?
                .json()
                .await
                .map_err(|e| anyhow::anyhow!("PegelonlineReader: list_stations JSON error: {e}"))?;

            Ok(stations
                .into_iter()
                .map(|s| StationInfo {
                    station_id: s.uuid,
                    name: Some(s.shortname),
                    river: Some(s.water.shortname),
                    latitude: s.latitude,
                    longitude: s.longitude,
                    params: s.timeseries.into_iter().map(|t| t.shortname).collect(),
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

            // Group requests by station UUID.
            // source_id = "{uuid}:{param}"
            let mut by_station: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();
            for req in requests {
                let mut parts = req.source_id.rsplitn(2, ':');
                let param = parts.next().unwrap_or("");
                let uuid = parts.next().unwrap_or("");
                if uuid.is_empty() || param.is_empty() {
                    tracing::warn!(
                        "GermanyPegelonlineReader: malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                }
                by_station
                    .entry(uuid)
                    .or_default()
                    .push((param, &req.source_id));
            }

            for (uuid, params) in &by_station {
                // Determine the merged time window for this station.
                let (from, to) = requests
                    .iter()
                    .filter(|r| r.source_id.starts_with(uuid))
                    .fold(None::<(DateTime<Utc>, DateTime<Utc>)>, |acc, r| {
                        Some(acc.map_or((r.from, r.to), |(f, t)| (f.min(r.from), t.max(r.to))))
                    })
                    .unwrap_or_else(|| {
                        let now = Utc::now();
                        (now - chrono::Duration::days(2), now)
                    });

                // Fetch W and Q separately if both are requested.
                let needed_params: std::collections::HashSet<&str> =
                    params.iter().map(|(p, _)| *p).collect();

                for param in &needed_params {
                    let url = format!(
                        "{BASE_URL}/{uuid}/{param}/measurements.json\
                         ?start={}&end={}",
                        from.format("%Y-%m-%dT%H:%M:%S+00:00"),
                        to.format("%Y-%m-%dT%H:%M:%S+00:00"),
                    );

                    let resp = reqwest::get(&url).await;
                    let measurements: Vec<Measurement> = match resp {
                        Ok(r) if r.status().is_success() => match r.json().await {
                            Ok(v) => v,
                            Err(e) => {
                                tracing::warn!(
                                    "GermanyPegelonlineReader: JSON parse error \
                                     for {uuid}/{param}: {e}"
                                );
                                continue;
                            }
                        },
                        Ok(r) => {
                            tracing::warn!(
                                "GermanyPegelonlineReader: HTTP {} for {uuid}/{param}",
                                r.status()
                            );
                            continue;
                        }
                        Err(e) => {
                            tracing::warn!(
                                "GermanyPegelonlineReader: request error for {uuid}/{param}: {e}"
                            );
                            continue;
                        }
                    };

                    // Find the source_id that corresponds to this param.
                    let source_id = match params.iter().find(|(p, _)| *p == *param) {
                        Some((_, sid)) => *sid,
                        None => continue,
                    };

                    let series = results.entry(source_id.to_string()).or_default();
                    for m in measurements {
                        if let Ok(ts) = DateTime::parse_from_rfc3339(&m.timestamp) {
                            series.push((ts.with_timezone(&Utc), m.value));
                        } else {
                            tracing::warn!(
                                "GermanyPegelonlineReader: bad timestamp '{}' for {uuid}",
                                m.timestamp
                            );
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
    use chrono::TimeZone;

    use super::*;

    #[test]
    fn parse_pegelonline_timestamp_cest() {
        // PEGELONLINE returns "+02:00" in summer (CEST).
        let ts = DateTime::parse_from_rfc3339("2026-05-14T09:30:00+02:00").unwrap();
        let utc = ts.with_timezone(&Utc);
        assert_eq!(
            utc.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-05-14T07:30:00Z"
        );
    }

    #[test]
    fn parse_pegelonline_timestamp_cet() {
        // PEGELONLINE returns "+01:00" in winter (CET).
        let ts = DateTime::parse_from_rfc3339("2026-01-10T08:00:00+01:00").unwrap();
        let utc = ts.with_timezone(&Utc);
        assert_eq!(
            utc.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-01-10T07:00:00Z"
        );
    }
}
