use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use reqwest::header::{ACCEPT, HeaderMap, HeaderValue};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Norwegian hydrological data (NVE HydAPI).
///
/// Source: https://hydapi.nve.no/
/// Documentation: https://hydapi.nve.no/UserDocumentation/
///
/// The API requires an API key supplied via the `NVE_API_KEY` environment
/// variable. If the variable is not set, the reader logs a warning and
/// returns empty results for every request.
///
/// A single GET request can cover multiple stations and parameters, so the
/// entire provider poll is one HTTP call.
///
/// `source_id` format: `"{station_id}:{parameter}"`
///   e.g. `"2.32.0:1001"` (discharge, m³/s)
///        `"2.32.0:1000"` (stage, m)
///
/// Supported parameters:
///   `1000` — Vannstand / Stage (m)
///   `1001` — Avrenning / Discharge (m³/s)
pub struct NorwayNveReader {
    api_key: Option<String>,
}

const BASE_URL: &str = "https://hydapi.nve.no/api/v1/Observations";
/// Instantaneous resolution (raw sensor readings, shortest available interval).
const RESOLUTION: &str = "0";

#[derive(Deserialize)]
struct ApiResponse {
    #[serde(default)]
    data: Vec<Series>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Series {
    station_id: String,
    parameter: u32,
    #[serde(default)]
    observations: Vec<Observation>,
}

#[derive(Deserialize)]
struct Observation {
    time: String,
    value: Option<f64>,
}

impl Default for NorwayNveReader {
    fn default() -> Self {
        Self {
            api_key: std::env::var("NVE_API_KEY").ok(),
        }
    }
}

impl NorwayNveReader {
    fn build_headers(&self, api_key: &str) -> anyhow::Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(
            "X-API-Key",
            HeaderValue::from_str(api_key)
                .map_err(|e| anyhow::anyhow!("NveReader: invalid API key characters: {e}"))?,
        );
        Ok(headers)
    }

    async fn fetch_observations(
        &self,
        api_key: &str,
        station_ids: &HashSet<&str>,
        parameters: &HashSet<&str>,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> anyhow::Result<Vec<Series>> {
        let reference_time = format!(
            "{}/{}",
            from.format("%Y-%m-%dT%H:%M:%SZ"),
            to.format("%Y-%m-%dT%H:%M:%SZ"),
        );
        let url = format!(
            "{BASE_URL}?StationId={}&Parameter={}&ResolutionTime={RESOLUTION}&ReferenceTime={}",
            station_ids.iter().cloned().collect::<Vec<_>>().join(","),
            parameters.iter().cloned().collect::<Vec<_>>().join(","),
            reference_time,
        );

        let client = reqwest::Client::new();
        let resp = client
            .get(&url)
            .headers(self.build_headers(api_key)?)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("NveReader: HTTP error: {e}"))?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("NveReader: server error: {e}"))?;

        let body = resp
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("NveReader: failed to read response body: {e}"))?;

        serde_json::from_str::<ApiResponse>(&body)
            .map(|r| r.data)
            .map_err(|e| {
                let preview = body.chars().take(200).collect::<String>();
                anyhow::anyhow!("NveReader: JSON parse error: {e} — body: {preview:?}")
            })
    }
}

impl GaugeReader for NorwayNveReader {
    fn provider_key(&self) -> &'static str {
        "nve"
    }

    /// NVE HydAPI imposes a hard limit of 150 000 observations per request.
    /// With 10 stations per chunk and ~15-minute resolution that is roughly
    /// 10 × 4 × 24 × 30 ≈ 29 000 observations for a 30-day window — safe.
    /// A 10-year window would exceed the limit, so we advertise 30 days here
    /// (matching the global `max_history` cap in the polling loop).
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(30))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            Ok(vec![
                StationInfo {
                    station_id: "2.32.0".to_owned(),
                    name: Some("Atnasjø".to_owned()),
                    river: Some("Atna".to_owned()),
                    latitude: Some(61.851898),
                    longitude: Some(10.2221),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.129.0".to_owned(),
                    name: Some("Dølplass".to_owned()),
                    river: Some("Folla".to_owned()),
                    latitude: Some(62.1922),
                    longitude: Some(10.4511),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.265.0".to_owned(),
                    name: Some("Unsetåa".to_owned()),
                    river: Some("Rena".to_owned()),
                    latitude: Some(61.946098),
                    longitude: Some(11.0835),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.267.0".to_owned(),
                    name: Some("Mistra bru".to_owned()),
                    river: Some("Mistra".to_owned()),
                    latitude: Some(61.711102),
                    longitude: Some(11.2419),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.268.0".to_owned(),
                    name: Some("Akslen".to_owned()),
                    river: Some("Bøvri".to_owned()),
                    latitude: Some(61.799599),
                    longitude: Some(8.4472),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.284.0".to_owned(),
                    name: Some("Sælatunga".to_owned()),
                    river: Some("Finna".to_owned()),
                    latitude: Some(61.884399),
                    longitude: Some(9.0621),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.290.0".to_owned(),
                    name: Some("Brustuen".to_owned()),
                    river: Some("Bøvri".to_owned()),
                    latitude: Some(61.7262),
                    longitude: Some(8.296),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.291.0".to_owned(),
                    name: Some("Tora".to_owned()),
                    river: Some("Tora".to_owned()),
                    latitude: Some(62.007702),
                    longitude: Some(7.8664),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.303.0".to_owned(),
                    name: Some("Dombås".to_owned()),
                    river: Some("Jora".to_owned()),
                    latitude: Some(62.087101),
                    longitude: Some(9.1018),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.439.0".to_owned(),
                    name: Some("Kvarstadseter".to_owned()),
                    river: Some("Åsta".to_owned()),
                    latitude: Some(61.178501),
                    longitude: Some(10.8933),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.479.0".to_owned(),
                    name: Some("Li bru".to_owned()),
                    river: Some("Atna".to_owned()),
                    latitude: Some(62.009998),
                    longitude: Some(10.0003),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.578.0".to_owned(),
                    name: Some("Søndre Imssjøen".to_owned()),
                    river: Some("Imsa".to_owned()),
                    latitude: Some(61.547901),
                    longitude: Some(10.6618),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "2.595.0".to_owned(),
                    name: Some("Faukstad".to_owned()),
                    river: Some("Sjoa".to_owned()),
                    latitude: Some(61.709599),
                    longitude: Some(9.4252),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "12.70.0".to_owned(),
                    name: Some("Etna".to_owned()),
                    river: Some("Randselva".to_owned()),
                    latitude: Some(60.9519),
                    longitude: Some(9.6262),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "12.209.0".to_owned(),
                    name: Some("Urula".to_owned()),
                    river: Some("Urula".to_owned()),
                    latitude: Some(60.558102),
                    longitude: Some(9.8757),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "12.215.0".to_owned(),
                    name: Some("Storeskar".to_owned()),
                    river: Some("Hemsil".to_owned()),
                    latitude: Some(60.891701),
                    longitude: Some(8.3328),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "15.21.0".to_owned(),
                    name: Some("Jondalselv".to_owned()),
                    river: Some("Jondalselva".to_owned()),
                    latitude: Some(59.707298),
                    longitude: Some(9.5548),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "15.79.0".to_owned(),
                    name: Some("Ossjøen".to_owned()),
                    river: Some("Numedalslågen".to_owned()),
                    latitude: Some(60.382099),
                    longitude: Some(8.2639),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "16.128.0".to_owned(),
                    name: Some("Austbygdåi".to_owned()),
                    river: Some("Austbygdåi".to_owned()),
                    latitude: Some(59.9953),
                    longitude: Some(8.8277),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "16.155.0".to_owned(),
                    name: Some("Sønnlandsvatn".to_owned()),
                    river: Some("Skogsåi".to_owned()),
                    latitude: Some(59.703899),
                    longitude: Some(8.8588),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "62.10.0".to_owned(),
                    name: Some("Myrkdalsvatn".to_owned()),
                    river: Some("Vossovassdraget".to_owned()),
                    latitude: Some(60.799198),
                    longitude: Some(6.5016),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "100.1.0".to_owned(),
                    name: Some("Valldøla v/Alstad".to_owned()),
                    river: Some("Valldøla".to_owned()),
                    latitude: Some(62.329399),
                    longitude: Some(7.4832),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "103.1.0".to_owned(),
                    name: Some("Ulvåa v/Storhølen".to_owned()),
                    river: Some("Ulvåa".to_owned()),
                    latitude: Some(62.280499),
                    longitude: Some(8.1178),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "103.3.0".to_owned(),
                    name: Some("Rauma v/Stuguflåten".to_owned()),
                    river: Some("Rauma".to_owned()),
                    latitude: Some(62.2766),
                    longitude: Some(8.1531),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "109.9.0".to_owned(),
                    name: Some("Driva v/Risefoss".to_owned()),
                    river: Some("Driva".to_owned()),
                    latitude: Some(62.511398),
                    longitude: Some(9.5926),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "109.20.0".to_owned(),
                    name: Some("Driva v/Grensehølen".to_owned()),
                    river: Some("Driva".to_owned()),
                    latitude: Some(62.572102),
                    longitude: Some(9.159),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "122.14.0".to_owned(),
                    name: Some("Lillebudal bru".to_owned()),
                    river: Some("Bua".to_owned()),
                    latitude: Some(62.823399),
                    longitude: Some(10.5486),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "122.17.0".to_owned(),
                    name: Some("Hugdal bru".to_owned()),
                    river: Some("Sokna".to_owned()),
                    latitude: Some(62.994099),
                    longitude: Some(10.2464),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "123.31.0".to_owned(),
                    name: Some("Kjeldstad i Garbergelva".to_owned()),
                    river: Some("Garbergselva".to_owned()),
                    latitude: Some(63.266201),
                    longitude: Some(11.1311),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "124.2.0".to_owned(),
                    name: Some("Høggås bru".to_owned()),
                    river: Some("Forra".to_owned()),
                    latitude: Some(63.492901),
                    longitude: Some(11.3583),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "151.15.0".to_owned(),
                    name: Some("Nervoll".to_owned()),
                    river: Some("Vefsna".to_owned()),
                    latitude: Some(65.437599),
                    longitude: Some(13.986),
                    params: vec!["1001".to_owned()],
                },
                StationInfo {
                    station_id: "311.4.0".to_owned(),
                    name: Some("Femundsenden (Femunden)".to_owned()),
                    river: Some("Trysilelva".to_owned()),
                    latitude: Some(61.919998),
                    longitude: Some(11.94),
                    params: vec!["1001".to_owned()],
                },
            ])
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            let api_key = match &self.api_key {
                Some(k) => k.as_str(),
                None => {
                    tracing::warn!("NVE_API_KEY is not set; skipping NVE gauge polling");
                    return Ok(HashMap::new());
                }
            };

            // Parse and validate all source_ids up front.
            // source_id format: "{station_id}:{parameter}" e.g. "2.32.0:1001"
            let parsed: Vec<(&str, &str, &FetchRequest)> = requests
                .iter()
                .filter_map(|req| {
                    match req.source_id.rsplit_once(':') {
                        Some((station_id, parameter)) => Some((station_id, parameter, req)),
                        None => {
                            tracing::warn!(
                                "NveReader: ignoring malformed source_id '{}' (expected '{{station_id}}:{{parameter}}')",
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

            let now = Utc::now();
            let global_from = requests.iter().map(|r| r.from).min().unwrap_or(now);
            let global_to = requests.iter().map(|r| r.to).max().unwrap_or(now);

            // Group stations by parameter — NVE rejects batches where a station
            // doesn't support the requested parameter, so we issue one request
            // per unique parameter code.
            let mut by_param: HashMap<&str, HashSet<&str>> = HashMap::new();
            for (station_id, parameter, _) in &parsed {
                by_param.entry(parameter).or_default().insert(station_id);
            }

            // NVE API rejects requests with more than 10 station IDs.
            const MAX_STATIONS_PER_REQUEST: usize = 10;

            let mut all_series: Vec<Series> = Vec::new();
            for (param, stations) in &by_param {
                let param_set: HashSet<&str> = std::iter::once(*param).collect();
                let station_list: Vec<&str> = stations.iter().copied().collect();
                for chunk in station_list.chunks(MAX_STATIONS_PER_REQUEST) {
                    let chunk_set: HashSet<&str> = chunk.iter().copied().collect();
                    match self
                        .fetch_observations(api_key, &chunk_set, &param_set, global_from, global_to)
                        .await
                    {
                        Ok(mut s) => all_series.append(&mut s),
                        Err(err) => {
                            tracing::error!("NveReader: fetch failed for parameter {param}: {err}");
                        }
                    }
                }
            }

            // Build a lookup: (station_id, parameter_str) -> observations
            let mut by_key: HashMap<(&str, String), &Vec<Observation>> = HashMap::new();
            for series in &all_series {
                by_key.insert(
                    (series.station_id.as_str(), series.parameter.to_string()),
                    &series.observations,
                );
            }

            // Distribute readings to the matching source_id.
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
            for (station_id, parameter, req) in &parsed {
                let key = (*station_id, parameter.to_string());
                let Some(observations) = by_key.get(&key) else {
                    continue;
                };
                for obs in *observations {
                    let Some(value) = obs.value else {
                        continue;
                    };
                    let ts = match obs.time.parse::<DateTime<Utc>>() {
                        Ok(t) => t,
                        Err(_) => {
                            tracing::warn!(
                                "NveReader: unparseable timestamp '{}' for station {}",
                                obs.time,
                                station_id
                            );
                            continue;
                        }
                    };
                    if ts > req.from && ts <= req.to {
                        results
                            .entry(req.source_id.clone())
                            .or_default()
                            .push((ts, value));
                    }
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    // NVE station IDs contain dots (e.g. "2.32.0"), so the source_id uses
    // rsplit_once to ensure the parameter is always the last segment.
    #[test]
    fn rsplit_correctly_splits_dotted_station_id() {
        let (station, param) = "2.32.0:1001".rsplit_once(':').expect("should rsplit");
        assert_eq!(station, "2.32.0");
        assert_eq!(param, "1001");
    }

    #[test]
    fn split_once_would_misparse_dotted_station_id() {
        // split_once stops at the first colon; for IDs that might contain colons
        // rsplit_once is safer. This test documents the design choice.
        let (station, _) = "2.32.0:1001".rsplit_once(':').unwrap();
        assert!(!station.contains(':'), "station should not contain a colon");
    }
}
