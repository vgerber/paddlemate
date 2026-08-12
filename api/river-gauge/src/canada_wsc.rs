use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Environment and Climate Change Canada's Water Survey of Canada
/// (WSC) hydrometric network, via the MSC GeoMet OGC API.
///
/// Source: https://api.weather.gc.ca/collections/hydrometric-stations
///         https://api.weather.gc.ca/collections/hydrometric-realtime
///
/// `list_stations` keeps active stations with a live telemetry feed
/// (`REAL_TIME=1`), ~2,600 of them; the collection has no separate river
/// field, so `river` is left unset.
///
/// `source_id` format: `"{station_number}:{param}"`
///   e.g. `"05BB001:W"` (water level, converted to cm)
///        `"05BB001:Q"` (discharge, m³/s - already this app's unit)
///
/// The realtime collection returns level and discharge together on every
/// reading and rejects multi-station queries, so `fetch_all` issues one
/// request per station covering whichever params were requested.
pub struct CanadaWscReader;

const STATIONS_URL: &str = "https://api.weather.gc.ca/collections/hydrometric-stations/items";
const REALTIME_URL: &str = "https://api.weather.gc.ca/collections/hydrometric-realtime/items";

const M_TO_CM: f64 = 100.0;
const PAGE_LIMIT: u32 = 10_000;

#[derive(Deserialize)]
struct StationsResponse {
    #[serde(default)]
    features: Vec<StationFeature>,
}

#[derive(Deserialize)]
struct StationFeature {
    properties: StationProps,
    geometry: Option<Geometry>,
}

#[derive(Deserialize)]
struct StationProps {
    #[serde(rename = "STATION_NUMBER")]
    station_number: String,
    #[serde(rename = "STATION_NAME")]
    station_name: Option<String>,
}

#[derive(Deserialize)]
struct Geometry {
    /// `[lon, lat]`.
    coordinates: Vec<f64>,
}

#[derive(Deserialize)]
struct RealtimeResponse {
    #[serde(default)]
    features: Vec<RealtimeFeature>,
}

#[derive(Deserialize)]
struct RealtimeFeature {
    properties: RealtimeProps,
}

#[derive(Deserialize)]
struct RealtimeProps {
    #[serde(rename = "DATETIME")]
    datetime: DateTime<Utc>,
    #[serde(rename = "LEVEL")]
    level: Option<f64>,
    #[serde(rename = "DISCHARGE")]
    discharge: Option<f64>,
}

impl GaugeReader for CanadaWscReader {
    fn provider_key(&self) -> &'static str {
        "wsc"
    }

    /// The realtime collection holds exactly ~30 days of history.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(30))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let url = format!("{STATIONS_URL}?f=json&STATUS_EN=Active&REAL_TIME=1&limit={PAGE_LIMIT}");
            let resp: StationsResponse = reqwest::get(&url)
                .await
                .map_err(|e| anyhow::anyhow!("CanadaWscReader: HTTP error: {e}"))?
                .error_for_status()
                .map_err(|e| anyhow::anyhow!("CanadaWscReader: server error: {e}"))?
                .json()
                .await
                .map_err(|e| anyhow::anyhow!("CanadaWscReader: JSON parse error: {e}"))?;

            Ok(resp
                .features
                .into_iter()
                .filter_map(|f| {
                    let (lon, lat) = match f.geometry.as_ref().map(|g| g.coordinates.as_slice()) {
                        Some([lon, lat]) => (*lon, *lat),
                        _ => return None,
                    };
                    Some(StationInfo {
                        station_id: f.properties.station_number,
                        name: f.properties.station_name,
                        river: None,
                        latitude: Some(lat),
                        longitude: Some(lon),
                        params: vec!["W".to_owned(), "Q".to_owned()],
                    })
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

            let mut by_station: HashMap<&str, Vec<&FetchRequest>> = HashMap::new();
            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!("CanadaWscReader: malformed source_id '{}'", req.source_id);
                    continue;
                };
                if param != "W" && param != "Q" {
                    tracing::warn!("CanadaWscReader: unknown param in '{}'", req.source_id);
                    continue;
                }
                by_station.entry(station_id).or_default().push(req);
            }

            for (station_id, reqs) in &by_station {
                let from = reqs.iter().map(|r| r.from).min().unwrap();
                let to = reqs.iter().map(|r| r.to).max().unwrap();

                let url = format!(
                    "{REALTIME_URL}?STATION_NUMBER={station_id}\
                     &datetime={}/{}&limit={PAGE_LIMIT}&sortby=DATETIME&f=json",
                    from.format("%Y-%m-%dT%H:%M:%SZ"),
                    to.format("%Y-%m-%dT%H:%M:%SZ"),
                );

                let resp = match reqwest::get(&url).await {
                    Ok(r) if r.status().is_success() => r,
                    Ok(r) => {
                        tracing::warn!("CanadaWscReader: HTTP {} for {station_id}", r.status());
                        continue;
                    }
                    Err(e) => {
                        tracing::warn!("CanadaWscReader: request error for {station_id}: {e}");
                        continue;
                    }
                };
                let body: RealtimeResponse = match resp.json().await {
                    Ok(b) => b,
                    Err(e) => {
                        tracing::warn!("CanadaWscReader: JSON parse error for {station_id}: {e}");
                        continue;
                    }
                };

                for req in reqs {
                    let param = req.source_id.rsplit_once(':').map_or("", |(_, p)| p);
                    let series = results.entry(req.source_id.clone()).or_default();
                    for f in &body.features {
                        let ts = f.properties.datetime;
                        if ts <= req.from || ts > req.to {
                            continue;
                        }
                        let value = match param {
                            "W" => f.properties.level.map(|v| v * M_TO_CM),
                            "Q" => f.properties.discharge,
                            _ => None,
                        };
                        if let Some(v) = value {
                            series.push((ts, v));
                        }
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
    use super::*;

    #[test]
    fn level_converts_metres_to_cm() {
        assert!((2.395_f64 * M_TO_CM - 239.5).abs() < 1e-9);
    }
}
