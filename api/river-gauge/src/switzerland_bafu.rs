use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDate, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Swiss federal hydrology data (BAFU / FOEN).
///
/// Source: https://www.hydrodaten.admin.ch/
/// Wrapper API: https://api.existenz.ch/#hydro
///
/// The existenz.ch API exposes BAFU data as two endpoints:
///   `/hydro/latest`    — most recent reading, any number of locations/params.
///   `/hydro/daterange` — historical readings up to 32 days back (daily granularity).
///
/// A single request can cover all locations and parameters at once, so the
/// entire provider poll is normally one HTTP call.
///
/// `source_id` format: `"{station_id}:{param}"`
///   e.g. `"2016:flow"`        (Aare @ Brugg, discharge m³/s)
///        `"2016:height"`      (Aare @ Brugg, water level cm)
///        `"2016:temperature"` (Aare @ Brugg, water temperature °C)
///
/// Supported params: `height`, `flow`, `temperature`
///
/// `list_stations` discovers the whole BAFU catalog live from the existenz.ch
/// `/hydro/locations` endpoint (station names, rivers, coordinates) and cross
/// references `/hydro/latest` to learn which parameters each station currently
/// reports. Only river stations that expose water level or discharge are kept.
pub struct SwitzerlandBafuReader;

const BASE_URL: &str = "https://api.existenz.ch/apiv1/hydro";
/// When the overall request window is shorter than this, use the fast
/// `/latest` endpoint; otherwise fall back to `/daterange`.
const LATEST_THRESHOLD_SECS: i64 = 4 * 3600;

/// Parameters we map, in display order: discharge, water level, temperature.
/// A station is listed only if it exposes discharge or water level.
const SUPPORTED_PARAMS: [&str; 3] = ["flow", "height", "temperature"];

#[derive(Deserialize)]
struct ApiResponse {
    payload: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    /// Unix timestamp in seconds.
    timestamp: i64,
    loc: String,
    par: String,
    val: f64,
}

/// `/hydro/locations` response. The payload is a map keyed by location id.
#[derive(Deserialize)]
struct LocationsResponse {
    payload: HashMap<String, LocationEntry>,
}

#[derive(Deserialize)]
struct LocationEntry {
    details: LocationDetails,
}

#[derive(Deserialize)]
struct LocationDetails {
    /// BAFU station number, e.g. "2016". A few entries return it as a JSON
    /// number rather than a string, so accept both.
    #[serde(deserialize_with = "de_flexible_id")]
    id: String,
    /// Human readable station name, e.g. "Brugg".
    name: Option<String>,
    /// Name of the water body, e.g. "Aare".
    #[serde(rename = "water-body-name")]
    water_body_name: Option<String>,
    /// "river" or "lake".
    #[serde(rename = "water-body-type")]
    water_body_type: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
}

/// Accept a station id that arrives as either a JSON string or number.
fn de_flexible_id<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::Deserialize;
    match serde_json::Value::deserialize(deserializer)? {
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Number(n) => Ok(n.to_string()),
        other => Err(serde::de::Error::custom(format!(
            "SwitzerlandBafuReader: unexpected id value: {other}"
        ))),
    }
}

impl SwitzerlandBafuReader {
    async fn fetch_latest(
        locs: &HashSet<&str>,
        params: &HashSet<&str>,
    ) -> anyhow::Result<Vec<Entry>> {
        let url = format!(
            "{BASE_URL}/latest?locations={}&parameters={}&app=paddlemate",
            locs.iter().cloned().collect::<Vec<_>>().join(","),
            params.iter().cloned().collect::<Vec<_>>().join(","),
        );
        let resp: ApiResponse = reqwest::get(&url)
            .await
            .map_err(|e| anyhow::anyhow!("SwitzerlandBafuReader: HTTP error fetching latest: {e}"))?
            .json()
            .await
            .map_err(|e| {
                anyhow::anyhow!("SwitzerlandBafuReader: JSON parse error for latest: {e}")
            })?;
        Ok(resp.payload)
    }

    async fn fetch_daterange(
        locs: &HashSet<&str>,
        params: &HashSet<&str>,
        start: NaiveDate,
        end: NaiveDate,
    ) -> anyhow::Result<Vec<Entry>> {
        let url = format!(
            "{BASE_URL}/daterange?locations={}&parameters={}&startDate={}&endDate={}&app=paddlemate",
            locs.iter().cloned().collect::<Vec<_>>().join(","),
            params.iter().cloned().collect::<Vec<_>>().join(","),
            start.format("%Y-%m-%d"),
            end.format("%Y-%m-%d"),
        );
        let resp: ApiResponse = reqwest::get(&url)
            .await
            .map_err(|e| {
                anyhow::anyhow!("SwitzerlandBafuReader: HTTP error fetching daterange: {e}")
            })?
            .json()
            .await
            .map_err(|e| {
                anyhow::anyhow!("SwitzerlandBafuReader: JSON parse error for daterange: {e}")
            })?;
        Ok(resp.payload)
    }

    /// Fetch the full BAFU station catalog from `/hydro/locations`.
    async fn fetch_locations() -> anyhow::Result<Vec<LocationDetails>> {
        let url = format!("{BASE_URL}/locations?app=paddlemate");
        let resp: LocationsResponse = reqwest::get(&url)
            .await
            .map_err(|e| {
                anyhow::anyhow!("SwitzerlandBafuReader: HTTP error fetching locations: {e}")
            })?
            .json()
            .await
            .map_err(|e| {
                anyhow::anyhow!("SwitzerlandBafuReader: JSON parse error for locations: {e}")
            })?;
        Ok(resp.payload.into_values().map(|e| e.details).collect())
    }

    /// Fetch every current reading (all locations, all parameters) and reduce it
    /// to a map of station id -> set of parameters that station reports. This is
    /// how we learn which stations actually expose discharge or water level,
    /// since `/locations` alone does not list per station parameters.
    async fn fetch_available_params() -> anyhow::Result<HashMap<String, HashSet<String>>> {
        let url = format!("{BASE_URL}/latest?app=paddlemate");
        let resp: ApiResponse = reqwest::get(&url)
            .await
            .map_err(|e| {
                anyhow::anyhow!("SwitzerlandBafuReader: HTTP error fetching latest catalog: {e}")
            })?
            .json()
            .await
            .map_err(|e| {
                anyhow::anyhow!("SwitzerlandBafuReader: JSON parse error for latest catalog: {e}")
            })?;

        let mut by_loc: HashMap<String, HashSet<String>> = HashMap::new();
        for entry in resp.payload {
            by_loc.entry(entry.loc).or_default().insert(entry.par);
        }
        Ok(by_loc)
    }
}

impl GaugeReader for SwitzerlandBafuReader {
    fn provider_key(&self) -> &'static str {
        "bafu"
    }

    /// existenz.ch `/hydro/daterange` endpoint supports up to 32 days back.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(32))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            // Discover the catalog live: /locations for metadata, /latest for the
            // set of parameters each station currently reports.
            let (locations, available) =
                tokio::try_join!(Self::fetch_locations(), Self::fetch_available_params())?;

            let out = locations
                .into_iter()
                .filter(|d| d.water_body_type.as_deref() == Some("river"))
                .filter_map(|d| {
                    let reported = available.get(&d.id);
                    let params: Vec<String> = SUPPORTED_PARAMS
                        .iter()
                        .filter(|p| reported.is_some_and(|set| set.contains(**p)))
                        .map(|p| (*p).to_owned())
                        .collect();
                    // Keep only real water gauges: those exposing discharge or level.
                    if !params.iter().any(|p| p == "flow" || p == "height") {
                        return None;
                    }
                    Some(StationInfo {
                        station_id: d.id,
                        name: d.name,
                        river: d.water_body_name,
                        latitude: d.lat,
                        longitude: d.lon,
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
            // Parse and validate all source_ids up front.
            let parsed: Vec<(&str, &str, &FetchRequest)> = requests
                .iter()
                .filter_map(|req| {
                    match req.source_id.split_once(':') {
                        Some((station_id, param)) => Some((station_id, param, req)),
                        None => {
                            tracing::warn!(
                                "SwitzerlandBafuReader: ignoring malformed source_id '{}' (expected '{{station_id}}:{{param}}')",
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

            let all_locs: HashSet<&str> = parsed.iter().map(|(id, _, _)| *id).collect();
            let all_params: HashSet<&str> = parsed.iter().map(|(_, p, _)| *p).collect();

            // Choose endpoint based on the overall window size.
            let now = Utc::now();
            let earliest_from = requests.iter().map(|r| r.from).min().unwrap_or(now);
            let latest_to = requests.iter().map(|r| r.to).max().unwrap_or(now);

            let entries = if (latest_to - earliest_from).num_seconds() <= LATEST_THRESHOLD_SECS {
                Self::fetch_latest(&all_locs, &all_params).await
            } else {
                let start = earliest_from.date_naive();
                let end = latest_to.date_naive();
                Self::fetch_daterange(&all_locs, &all_params, start, end).await
            };

            let entries = match entries {
                Ok(e) => e,
                Err(err) => {
                    tracing::error!("SwitzerlandBafuReader: fetch failed: {err}");
                    return Ok(HashMap::new());
                }
            };

            // Distribute readings to the matching source_id, filtered by window.
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
            for (station_id, param, req) in &parsed {
                // For daterange responses we may get many points per location.
                // Filter the full entry list per request window.
                let matching: Vec<(DateTime<Utc>, f64)> = entries
                    .iter()
                    .filter(|e| e.loc == *station_id && e.par == *param)
                    .filter_map(|e| {
                        let ts = DateTime::from_timestamp(e.timestamp, 0)?;
                        if ts > req.from && ts <= req.to {
                            Some((ts, e.val))
                        } else {
                            None
                        }
                    })
                    .collect();

                if !matching.is_empty() {
                    results
                        .entry(req.source_id.clone())
                        .or_default()
                        .extend(matching);
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- latest threshold boundary ---
    // Verifies the constant matches the documented 4-hour window used to choose
    // between the /latest and /daterange endpoints.
    #[test]
    fn latest_threshold_is_four_hours() {
        assert_eq!(LATEST_THRESHOLD_SECS, 4 * 3600);
    }
}
