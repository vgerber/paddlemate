use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDate, Utc};
use serde::Deserialize;

use super::{BoxFuture, FetchRequest, GaugeReader};

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
pub struct SwitzerlandBafuReader;

const BASE_URL: &str = "https://api.existenz.ch/apiv1/hydro";
/// When the overall request window is shorter than this, use the fast
/// `/latest` endpoint; otherwise fall back to `/daterange`.
const LATEST_THRESHOLD_SECS: i64 = 4 * 3600;

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
            .map_err(|e| anyhow::anyhow!("BafuReader: HTTP error fetching latest: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("BafuReader: JSON parse error for latest: {e}"))?;
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
            .map_err(|e| anyhow::anyhow!("BafuReader: HTTP error fetching daterange: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("BafuReader: JSON parse error for daterange: {e}"))?;
        Ok(resp.payload)
    }
}

impl GaugeReader for SwitzerlandBafuReader {
    fn provider_key(&self) -> &'static str {
        "bafu"
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
                                "BafuReader: ignoring malformed source_id '{}' (expected '{{station_id}}:{{param}}')",
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
                    tracing::error!("BafuReader: fetch failed: {err}");
                    return Ok(HashMap::new());
                }
            };

            // Build a lookup: (loc, par) -> (DateTime, f64)
            let mut by_key: HashMap<(&str, &str), (DateTime<Utc>, f64)> = HashMap::new();
            for entry in &entries {
                let ts = DateTime::from_timestamp(entry.timestamp, 0).unwrap_or(now);
                by_key.insert((entry.loc.as_str(), entry.par.as_str()), (ts, entry.val));
            }

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

            // For latest-endpoint calls by_key has exactly one point per (loc, par).
            // The above loop already handles that case (one point that either passes or not).
            let _ = by_key; // unused in the unified path — kept for clarity

            Ok(results)
        })
    }
}
