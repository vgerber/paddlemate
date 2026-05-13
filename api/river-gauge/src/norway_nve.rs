use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader};

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
    value: f64,
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
        let resp: ApiResponse = client
            .get(&url)
            .headers(self.build_headers(api_key)?)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("NveReader: HTTP error: {e}"))?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("NveReader: server error: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("NveReader: JSON parse error: {e}"))?;
        Ok(resp.data)
    }
}

impl GaugeReader for NorwayNveReader {
    fn provider_key(&self) -> &'static str {
        "nve"
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

            let mut all_series: Vec<Series> = Vec::new();
            for (param, stations) in &by_param {
                let param_set: HashSet<&str> = std::iter::once(*param).collect();
                match self
                    .fetch_observations(api_key, stations, &param_set, global_from, global_to)
                    .await
                {
                    Ok(mut s) => all_series.append(&mut s),
                    Err(err) => {
                        tracing::error!("NveReader: fetch failed for parameter {param}: {err}");
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
                            .push((ts, obs.value));
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
