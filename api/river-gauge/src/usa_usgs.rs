use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for USGS Water Data (USA).
///
/// Source: https://api.waterdata.usgs.gov/ogcapi/v0
///
/// The legacy `waterservices.usgs.gov` NWIS service still works but is being
/// decommissioned (targeted Q1 2027); this reader targets the new OGC
/// Features API instead.
///
/// `list_stations` finds every station currently reporting discharge (00060)
/// or gage height (00065) via the `latest-continuous` collection (which also
/// carries coordinates), then joins station names from `monitoring-locations`
/// in id batches. USGS has no separate river field, so `river` is left unset.
///
/// `source_id` format: `"{monitoring_location_id}:{param}"`
///   e.g. `"USGS-01646500:W"` (gage height, converted to cm)
///        `"USGS-01646500:Q"` (discharge, converted to m³/s)
///
/// USGS reports gage height in feet and discharge in cubic feet per second;
/// both are converted on ingestion to this app's convention (cm for water
/// level, m³/s for discharge).
///
/// Unauthenticated requests are capped around 100/hour, which the whole-catalog
/// discovery (a few dozen name-lookup batches) can exceed on its own; an
/// optional free key from `USGS_API_KEY` raises that to ~1,000/hour.
pub struct UsaUsgsReader {
    api_key: Option<String>,
}

impl Default for UsaUsgsReader {
    fn default() -> Self {
        Self {
            api_key: std::env::var("USGS_API_KEY").ok(),
        }
    }
}

const MONITORING_LOCATIONS_URL: &str =
    "https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items";
const LATEST_CONTINUOUS_URL: &str =
    "https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items";
const CONTINUOUS_URL: &str =
    "https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items";

/// USGS parameter codes for the two measurements this reader supports.
const PARAM_DISCHARGE: &str = "00060"; // cubic feet per second
const PARAM_GAGE_HEIGHT: &str = "00065"; // feet

const FT3S_TO_M3S: f64 = 0.028316846592;
const FT_TO_CM: f64 = 30.48;

const PAGE_LIMIT: u32 = 10_000;
/// Safety cap on pages walked, guarding against an unexpected pagination loop.
const MAX_PAGES: usize = 50;
/// Station ids per `monitoring-locations` name-lookup request. The `id`
/// filter 414s past roughly 800 ids in one URL; this stays well under that
/// while keeping a whole-catalog sync to a few dozen requests.
const NAME_LOOKUP_BATCH: usize = 400;

/// Map a USGS parameter code to this reader's own `W`/`Q` vocabulary.
fn param_key(code: &str) -> Option<&'static str> {
    match code {
        PARAM_DISCHARGE => Some("Q"),
        PARAM_GAGE_HEIGHT => Some("W"),
        _ => None,
    }
}

fn param_code(key: &str) -> Option<&'static str> {
    match key {
        "Q" => Some(PARAM_DISCHARGE),
        "W" => Some(PARAM_GAGE_HEIGHT),
        _ => None,
    }
}

#[derive(Deserialize)]
struct FeatureCollection<P> {
    features: Vec<Feature<P>>,
    #[serde(default)]
    links: Vec<Link>,
}

#[derive(Deserialize)]
struct Feature<P> {
    properties: P,
    #[serde(default)]
    geometry: Option<Geometry>,
}

#[derive(Deserialize)]
struct Geometry {
    /// `[lon, lat]`.
    coordinates: Vec<f64>,
}

#[derive(Deserialize)]
struct Link {
    rel: String,
    href: String,
}

#[derive(Deserialize)]
struct LatestContinuousProps {
    monitoring_location_id: String,
    parameter_code: String,
}

#[derive(Deserialize)]
struct MonitoringLocationProps {
    id: String,
    monitoring_location_name: Option<String>,
}

#[derive(Deserialize)]
struct ContinuousProps {
    monitoring_location_id: String,
    parameter_code: String,
    /// RFC 3339, e.g. `"2026-08-11T00:00:00+00:00"`.
    time: String,
    /// Numeric, but the API returns it as a string.
    value: String,
}

/// Append `&api_key=...` when one is configured. Every URL built by this
/// reader already carries at least one query param, so this only ever
/// appends `&...`, never has to decide between `?` and `&`.
fn with_key(url: String, api_key: Option<&str>) -> String {
    match api_key {
        Some(key) => format!("{url}&api_key={key}"),
        None => url,
    }
}

/// One retry after a short backoff on 429, since the unauthenticated rate
/// limit is tight enough that a burst of name-lookup batches can trip it.
async fn fetch_page<P: serde::de::DeserializeOwned>(
    url: &str,
) -> anyhow::Result<FeatureCollection<P>> {
    for attempt in 0..2 {
        let resp = reqwest::get(url)
            .await
            .map_err(|e| anyhow::anyhow!("UsaUsgsReader: HTTP error: {e}"))?;
        if attempt == 0 && resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            continue;
        }
        return resp
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("UsaUsgsReader: server error: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("UsaUsgsReader: JSON parse error: {e}"));
    }
    unreachable!("loop always returns on its second iteration")
}

/// Page through a FeatureCollection endpoint via its `next` link, collecting
/// every feature's properties (and lat/lon, when geometry is present).
async fn collect_all<P: serde::de::DeserializeOwned>(
    first_url: String,
) -> anyhow::Result<Vec<(P, Option<(f64, f64)>)>> {
    let mut url = first_url;
    let mut out = Vec::new();
    for _ in 0..MAX_PAGES {
        let page: FeatureCollection<P> = fetch_page(&url).await?;
        let next = page
            .links
            .iter()
            .find(|l| l.rel == "next")
            .map(|l| l.href.clone());
        for f in page.features {
            let latlon = match f.geometry.as_ref().map(|g| g.coordinates.as_slice()) {
                Some([lon, lat]) => Some((*lat, *lon)),
                _ => None,
            };
            out.push((f.properties, latlon));
        }
        match next {
            Some(href) => url = href,
            None => return Ok(out),
        }
    }
    tracing::warn!("UsaUsgsReader: stopped paginating after {MAX_PAGES} pages");
    Ok(out)
}

impl UsaUsgsReader {
    /// Look up station names for the given ids, batched to stay under the
    /// API's URL length limit. A failed batch leaves those stations nameless
    /// rather than aborting the whole discovery.
    async fn lookup_names(&self, ids: &[String]) -> HashMap<String, String> {
        let mut names = HashMap::new();
        for batch in ids.chunks(NAME_LOOKUP_BATCH) {
            let url = with_key(
                format!(
                    "{MONITORING_LOCATIONS_URL}?id={}&skipGeometry=true&limit={}&f=json",
                    batch.join(","),
                    batch.len()
                ),
                self.api_key.as_deref(),
            );
            match fetch_page::<MonitoringLocationProps>(&url).await {
                Ok(page) => {
                    for f in page.features {
                        if let Some(name) = f.properties.monitoring_location_name {
                            names.insert(f.properties.id, name);
                        }
                    }
                }
                Err(err) => {
                    tracing::warn!("UsaUsgsReader: name lookup batch failed: {err}");
                }
            }
        }
        names
    }
}

impl GaugeReader for UsaUsgsReader {
    fn provider_key(&self) -> &'static str {
        "usgs"
    }

    /// USGS retains decades of instantaneous-value history per station; the
    /// poller caps any cold-start catch-up at 30 days regardless, so this is
    /// a generous but not literal bound.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(365))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let url = with_key(
                format!(
                    "{LATEST_CONTINUOUS_URL}?parameter_code={PARAM_DISCHARGE},{PARAM_GAGE_HEIGHT}\
                     &limit={PAGE_LIMIT}&f=json"
                ),
                self.api_key.as_deref(),
            );
            let rows: Vec<(LatestContinuousProps, Option<(f64, f64)>)> = collect_all(url).await?;

            struct Accum {
                lat: f64,
                lon: f64,
                has_q: bool,
                has_w: bool,
            }
            let mut stations: HashMap<String, Accum> = HashMap::new();
            for (props, latlon) in rows {
                let Some(key) = param_key(&props.parameter_code) else {
                    continue;
                };
                let Some((lat, lon)) = latlon else { continue };
                let entry = stations
                    .entry(props.monitoring_location_id)
                    .or_insert(Accum {
                        lat,
                        lon,
                        has_q: false,
                        has_w: false,
                    });
                match key {
                    "Q" => entry.has_q = true,
                    "W" => entry.has_w = true,
                    _ => {}
                }
            }

            let ids: Vec<String> = stations.keys().cloned().collect();
            let names = self.lookup_names(&ids).await;

            Ok(stations
                .into_iter()
                .map(|(id, a)| {
                    let mut params = Vec::new();
                    if a.has_q {
                        params.push("Q".to_owned());
                    }
                    if a.has_w {
                        params.push("W".to_owned());
                    }
                    StationInfo {
                        name: names.get(&id).cloned(),
                        river: None,
                        latitude: Some(a.lat),
                        longitude: Some(a.lon),
                        params,
                        station_id: id,
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

            // Group station ids by param (Q/W); each group becomes one
            // multi-station query since `continuous` accepts a comma list of
            // monitoring_location_id.
            let mut by_param: HashMap<&str, HashSet<&str>> = HashMap::new();
            let mut parsed: Vec<(&str, &str, &FetchRequest)> = Vec::new();
            for req in requests {
                let mut parts = req.source_id.rsplitn(2, ':');
                let param = parts.next().unwrap_or("");
                let station_id = parts.next().unwrap_or("");
                if station_id.is_empty() || param_code(param).is_none() {
                    tracing::warn!(
                        "UsaUsgsReader: ignoring malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                }
                by_param.entry(param).or_default().insert(station_id);
                parsed.push((station_id, param, req));
            }

            if parsed.is_empty() {
                return Ok(results);
            }

            let now = Utc::now();
            let global_from = requests.iter().map(|r| r.from).min().unwrap_or(now);
            let global_to = requests.iter().map(|r| r.to).max().unwrap_or(now);

            let mut entries: Vec<ContinuousProps> = Vec::new();
            for (param, stations) in &by_param {
                let Some(code) = param_code(param) else {
                    continue;
                };
                let url = with_key(
                    format!(
                        "{CONTINUOUS_URL}?monitoring_location_id={}&parameter_code={code}\
                         &datetime={}/{}&limit={PAGE_LIMIT}&skipGeometry=true&f=json",
                        stations.iter().copied().collect::<Vec<_>>().join(","),
                        global_from.format("%Y-%m-%dT%H:%M:%SZ"),
                        global_to.format("%Y-%m-%dT%H:%M:%SZ"),
                    ),
                    self.api_key.as_deref(),
                );
                match collect_all::<ContinuousProps>(url).await {
                    Ok(rows) => entries.extend(rows.into_iter().map(|(p, _)| p)),
                    Err(err) => {
                        tracing::error!("UsaUsgsReader: failed to fetch param '{param}': {err}")
                    }
                }
            }

            for (station_id, param, req) in &parsed {
                let Some(code) = param_code(param) else {
                    continue;
                };
                let series = results.entry(req.source_id.clone()).or_default();
                for entry in &entries {
                    if entry.monitoring_location_id != *station_id || entry.parameter_code != code
                    {
                        continue;
                    }
                    let Ok(ts) = DateTime::parse_from_rfc3339(&entry.time) else {
                        tracing::warn!(
                            "UsaUsgsReader: bad timestamp '{}' for {station_id}",
                            entry.time
                        );
                        continue;
                    };
                    let ts = ts.with_timezone(&Utc);
                    if ts <= req.from || ts > req.to {
                        continue;
                    }
                    let Ok(raw) = entry.value.parse::<f64>() else {
                        continue;
                    };
                    let value = match *param {
                        "Q" => raw * FT3S_TO_M3S,
                        "W" => raw * FT_TO_CM,
                        _ => continue,
                    };
                    series.push((ts, value));
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
    fn param_key_maps_known_codes() {
        assert_eq!(param_key(PARAM_DISCHARGE), Some("Q"));
        assert_eq!(param_key(PARAM_GAGE_HEIGHT), Some("W"));
        assert_eq!(param_key("00010"), None); // water temperature, unsupported
    }

    #[test]
    fn param_code_roundtrips_param_key() {
        assert_eq!(param_code("Q"), Some(PARAM_DISCHARGE));
        assert_eq!(param_code("W"), Some(PARAM_GAGE_HEIGHT));
        assert_eq!(param_code("X"), None);
    }

    #[test]
    fn discharge_converts_cfs_to_cms() {
        // 1 ft3/s = 0.0283168466 m3/s.
        assert!((1.0 * FT3S_TO_M3S - 0.028316846592).abs() < 1e-9);
    }

    #[test]
    fn gage_height_converts_feet_to_cm() {
        assert!((1.0 * FT_TO_CM - 30.48).abs() < 1e-9);
    }
}
