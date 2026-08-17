use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Wales's Natural Resources Wales (NRW) river-level network, via
/// the public (no-auth) JSON endpoints behind the rivers-and-seas website.
///
/// Source: https://rivers-and-seas.naturalresources.wales/
///
/// NRW also publishes an official, documented API
/// (`api.naturalresources.wales/rivers-and-seas/v1/api/StationData`, key via
/// Azure APIM, free signup at api-portal.naturalresources.wales) that gives
/// the same station catalogue plus WGS84 coordinates - but only the latest
/// reading, no history. The no-auth endpoints used here give real history
/// (~1 year) at the cost of coordinates: `/map/GetStations` only exposes
/// British National Grid easting/northing, not lat/lon, and converting that
/// to WGS84 needs a verified OSGB36 datum transform this reader does not
/// attempt - so `latitude`/`longitude` are always `None` for now. Confirmed
/// live: NRW has no discharge/flow parameter at all, only river level (in
/// `m` or, for a handful of stations, `mAOD`).
///
/// `source_id` format: `"{station_id}:W"` (water level, converted to cm) -
/// there is no `Q`.
pub struct WalesNrwReader;

const STATIONS_URL: &str = "https://rivers-and-seas.naturalresources.wales/map/GetStations";
const GRAPH_URL: &str = "https://rivers-and-seas.naturalresources.wales/graph/getdata";
const M_TO_CM: f64 = 100.0;

#[derive(Deserialize)]
struct NrwLocalized {
    english: Option<String>,
}

#[derive(Deserialize)]
struct NrwParameter {
    id: i64,
    #[serde(rename = "typeText")]
    type_text: NrwLocalized,
}

#[derive(Deserialize)]
struct NrwStation {
    id: i64,
    title: NrwLocalized,
    #[serde(default)]
    parameters: Vec<NrwParameter>,
}

#[derive(Deserialize)]
struct GraphResponse {
    #[serde(default)]
    data: Vec<GraphPoint>,
}

#[derive(Deserialize)]
struct GraphPoint {
    x: String,
    y: f64,
}

async fn fetch_stations() -> anyhow::Result<Vec<NrwStation>> {
    reqwest::get(STATIONS_URL)
        .await
        .map_err(|e| anyhow::anyhow!("WalesNrwReader: HTTP error: {e}"))?
        .error_for_status()
        .map_err(|e| anyhow::anyhow!("WalesNrwReader: server error: {e}"))?
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("WalesNrwReader: JSON parse error: {e}"))
}

/// This station's river-level parameter id, if it has one.
fn level_parameter_id(s: &NrwStation) -> Option<i64> {
    s.parameters
        .iter()
        .find(|p| p.type_text.english.as_deref() == Some("River Level"))
        .map(|p| p.id)
}

impl GaugeReader for WalesNrwReader {
    fn provider_key(&self) -> &'static str {
        "nrw"
    }

    /// The public history endpoint truncates to roughly 1 calendar year.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(365))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let stations = fetch_stations().await?;
            Ok(stations
                .into_iter()
                .filter(|s| level_parameter_id(s).is_some())
                .map(|s| StationInfo {
                    station_id: s.id.to_string(),
                    name: s.title.english.clone(),
                    river: None,
                    latitude: None,
                    longitude: None,
                    params: vec!["W".to_owned()],
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

            let wanted: Vec<(&str, &FetchRequest)> = requests
                .iter()
                .filter_map(|req| {
                    let (station_id, param) = req.source_id.rsplit_once(':')?;
                    if param != "W" {
                        tracing::warn!("WalesNrwReader: unknown param in '{}'", req.source_id);
                        return None;
                    }
                    Some((station_id, req))
                })
                .collect();
            if wanted.is_empty() {
                return Ok(results);
            }

            let stations = match fetch_stations().await {
                Ok(s) => s,
                Err(err) => {
                    tracing::error!("WalesNrwReader: failed to fetch station list: {err}");
                    return Ok(results);
                }
            };
            let parameter_id_for: HashMap<String, i64> = stations
                .iter()
                .filter_map(|s| level_parameter_id(s).map(|pid| (s.id.to_string(), pid)))
                .collect();

            for (station_id, req) in &wanted {
                let Some(&parameter_id) = parameter_id_for.get(*station_id) else {
                    continue;
                };
                let url = format!(
                    "{GRAPH_URL}?parameterId={parameter_id}&from={}&to={}",
                    req.from.format("%Y-%m-%dT%H:%M:%SZ"),
                    req.to.format("%Y-%m-%dT%H:%M:%SZ"),
                );
                let graph: GraphResponse = match reqwest::get(&url).await {
                    Ok(r) if r.status().is_success() => match r.json().await {
                        Ok(v) => v,
                        Err(e) => {
                            tracing::warn!(
                                "WalesNrwReader: JSON parse error for {station_id}: {e}"
                            );
                            continue;
                        }
                    },
                    Ok(r) => {
                        tracing::warn!("WalesNrwReader: HTTP {} for {station_id}", r.status());
                        continue;
                    }
                    Err(e) => {
                        tracing::warn!("WalesNrwReader: request error for {station_id}: {e}");
                        continue;
                    }
                };

                let series = results.entry(req.source_id.clone()).or_default();
                for p in graph.data {
                    let Ok(ts) = DateTime::parse_from_rfc3339(&p.x) else {
                        continue;
                    };
                    let ts = ts.with_timezone(&Utc);
                    if ts <= req.from || ts > req.to {
                        continue;
                    }
                    series.push((ts, p.y * M_TO_CM));
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
    fn level_converts_metres_to_cm() {
        assert!((0.28_f64 * M_TO_CM - 28.0).abs() < 1e-9);
    }
}
