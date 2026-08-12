use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Scotland's SEPA hydrometric network via its public KiWIS
/// (Kisters WISKI) REST API.
///
/// Source: https://timeseries.sepa.org.uk/KiWIS/KiWIS
/// Docs: https://timeseriesdoc.sepa.org.uk/
///
/// No key required for anonymous use (a 5,000-credit/day quota applies -
/// email hydrometry-requests@sepa.org.uk for an API key if polling heavily).
/// OGL v3 licensed, attribute SEPA.
///
/// `list_stations` parses the semicolon-delimited `getStationList` CSV,
/// keeping rows whose `stationparameter_name` is `Level` or `Flow`. The KiWIS
/// timeseries path code (`SG` for level, `Q` for flow - not the same as our
/// own `W`/`Q` param keys) is kept alongside each station for `fetch_all`.
///
/// `source_id` format: `"{station_no}:{param}"`
///   e.g. `"15018:W"` (water level, converted to cm)
///        `"15018:Q"` (discharge, m³/s - already this app's unit)
pub struct ScotlandSepaReader;

const BASE_URL: &str = "https://timeseries.sepa.org.uk/KiWIS/KiWIS";
const M_TO_CM: f64 = 100.0;

/// Timeseries path code for each of our own param keys.
fn kiwis_code(param: &str) -> Option<&'static str> {
    match param {
        "W" => Some("SG"),
        "Q" => Some("Q"),
        _ => None,
    }
}

fn our_param(kiwis_stationparameter_name: &str) -> Option<&'static str> {
    match kiwis_stationparameter_name {
        "Level" => Some("W"),
        "Flow" => Some("Q"),
        _ => None,
    }
}

impl GaugeReader for ScotlandSepaReader {
    fn provider_key(&self) -> &'static str {
        "sepa"
    }

    /// The KiWIS API serves deep history (tested back to 2015); the poller
    /// caps any cold-start catch-up at 30 days regardless.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(365))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let url = format!(
                "{BASE_URL}?service=kisters&type=queryServices&datasource=0\
                 &request=getStationList\
                 &returnfields=station_no,station_name,station_latitude,station_longitude,\
                 stationparameter_name,river_name\
                 &format=csv"
            );
            let body = reqwest::get(&url)
                .await
                .map_err(|e| anyhow::anyhow!("ScotlandSepaReader: HTTP error: {e}"))?
                .error_for_status()
                .map_err(|e| anyhow::anyhow!("ScotlandSepaReader: server error: {e}"))?
                .text()
                .await
                .map_err(|e| anyhow::anyhow!("ScotlandSepaReader: read error: {e}"))?;

            struct Accum {
                name: Option<String>,
                river: Option<String>,
                lat: Option<f64>,
                lon: Option<f64>,
                has_w: bool,
                has_q: bool,
            }
            let mut stations: HashMap<String, Accum> = HashMap::new();

            for line in body.lines().skip(1) {
                let cols: Vec<&str> = line.split(';').collect();
                let [station_no, name, lat, lon, param_name, river] = cols[..] else {
                    continue;
                };
                let Some(key) = our_param(param_name) else {
                    continue;
                };
                // The longitude column carries a stray leading `'` (Excel-CSV artifact).
                let lat: Option<f64> = lat.trim().parse().ok();
                let lon: Option<f64> = lon.trim().trim_start_matches('\'').parse().ok();

                let entry = stations
                    .entry(station_no.to_owned())
                    .or_insert_with(|| Accum {
                        name: (!name.is_empty()).then(|| name.to_owned()),
                        river: (!river.is_empty()).then(|| river.to_owned()),
                        lat,
                        lon,
                        has_w: false,
                        has_q: false,
                    });
                match key {
                    "W" => entry.has_w = true,
                    "Q" => entry.has_q = true,
                    _ => {}
                }
            }

            Ok(stations
                .into_iter()
                .map(|(station_id, a)| {
                    let mut params = Vec::new();
                    if a.has_w {
                        params.push("W".to_owned());
                    }
                    if a.has_q {
                        params.push("Q".to_owned());
                    }
                    StationInfo {
                        station_id,
                        name: a.name,
                        river: a.river,
                        latitude: a.lat,
                        longitude: a.lon,
                        params,
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

            // One combined request: every (station, param) becomes one
            // `ts_path` entry, joined by commas, sharing the request's merged
            // window - KiWIS accepts multiple ts_paths in a single call.
            let mut ts_paths = Vec::new();
            let mut path_to_source: HashMap<String, &str> = HashMap::new();
            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!("ScotlandSepaReader: malformed source_id '{}'", req.source_id);
                    continue;
                };
                let Some(code) = kiwis_code(param) else {
                    tracing::warn!("ScotlandSepaReader: unknown param in '{}'", req.source_id);
                    continue;
                };
                let path = format!("1/{station_id}/{code}/15m.Cmd");
                ts_paths.push(path.clone());
                path_to_source.insert(path, &req.source_id);
            }

            if ts_paths.is_empty() {
                return Ok(results);
            }

            let now = Utc::now();
            let from = requests.iter().map(|r| r.from).min().unwrap_or(now);
            let to = requests.iter().map(|r| r.to).max().unwrap_or(now);

            let url = format!(
                "{BASE_URL}?service=kisters&type=queryServices&datasource=0\
                 &request=getTimeseriesValues&returnfields=Timestamp,Value\
                 &metadata=true&md_returnfields=station_no,stationparameter_no\
                 &format=dajson&ts_path={}\
                 &from={}&to={}",
                ts_paths.join(","),
                from.format("%Y-%m-%dT%H:%M:%SZ"),
                to.format("%Y-%m-%dT%H:%M:%SZ"),
            );

            let blocks: Vec<TimeseriesBlock> = match reqwest::get(&url).await {
                Ok(r) if r.status().is_success() => match r.json().await {
                    Ok(v) => v,
                    Err(e) => {
                        tracing::error!("ScotlandSepaReader: JSON parse error: {e}");
                        return Ok(results);
                    }
                },
                Ok(r) => {
                    tracing::error!("ScotlandSepaReader: HTTP {}", r.status());
                    return Ok(results);
                }
                Err(e) => {
                    tracing::error!("ScotlandSepaReader: request error: {e}");
                    return Ok(results);
                }
            };

            for block in blocks {
                let (Some(station_no), Some(param_code)) =
                    (block.station_no.as_deref(), block.stationparameter_no.as_deref())
                else {
                    continue;
                };
                let path = format!("1/{station_no}/{param_code}/15m.Cmd");
                let Some(&source_id) = path_to_source.get(&path) else {
                    continue;
                };
                let Some(req) = requests.iter().find(|r| r.source_id == source_id) else {
                    continue;
                };
                let param = source_id.rsplit_once(':').map_or("", |(_, p)| p);

                let series = results.entry(source_id.to_owned()).or_default();
                for (ts_str, value) in block.data {
                    let Ok(ts) = DateTime::parse_from_rfc3339(&ts_str) else {
                        continue;
                    };
                    let ts = ts.with_timezone(&Utc);
                    if ts <= req.from || ts > req.to {
                        continue;
                    }
                    let value = if param == "W" { value * M_TO_CM } else { value };
                    series.push((ts, value));
                }
                series.sort_by_key(|(ts, _)| *ts);
            }

            Ok(results)
        })
    }
}

#[derive(Deserialize)]
struct TimeseriesBlock {
    station_no: Option<String>,
    stationparameter_no: Option<String>,
    #[serde(default)]
    data: Vec<(String, f64)>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kiwis_code_maps_our_params() {
        assert_eq!(kiwis_code("W"), Some("SG"));
        assert_eq!(kiwis_code("Q"), Some("Q"));
        assert_eq!(kiwis_code("X"), None);
    }

    #[test]
    fn our_param_maps_kiwis_names() {
        assert_eq!(our_param("Level"), Some("W"));
        assert_eq!(our_param("Flow"), Some("Q"));
        assert_eq!(our_param("Rainfall"), None);
    }

    #[test]
    fn level_converts_metres_to_cm() {
        assert!((0.524_f64 * M_TO_CM - 52.4).abs() < 1e-9);
    }
}
