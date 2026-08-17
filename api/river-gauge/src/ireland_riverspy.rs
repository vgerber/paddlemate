use std::collections::HashMap;

use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for riverspy.net, a community aggregator (run by Irish Whitewater)
/// re-publishing OPW, EPA, ESB and a few private gauges in one feed.
///
/// Source: https://www.riverspy.net/
///
/// No auth, no key. Underlying data is mostly OPW (CC-BY 4.0, see
/// `ireland_opw`) and EPA (Irish public sector data); riverspy itself states
/// no site-wide licence, so treat readings as reference/display data and
/// attribute the original agency (`gaugetype` in the raw feed: OPW/EPA/ESB/
/// SPY/CFW) rather than riverspy.
///
/// Unlike `ireland_opw`, this feed carries **discharge** for a handful of ESB
/// hydro-dam release gauges (Lee @ Inniscarra/Carrigadrohid, Shannon @
/// Parteen/Castleconnell) - genuinely relevant for whitewater since those
/// releases directly control real playspots. Most of the ~812 gauges are
/// water level in cm; some are stale/unmaintained (check `updated`).
///
/// The endpoint returns an XHTML page with a raw JSON array embedded after
/// the `<body>` tag - not a JSON content type, so it must be string-stripped
/// before parsing. There is no history endpoint; only the latest reading per
/// gauge is available, so this is a snapshot-only provider.
///
/// `source_id` format: `"{code}:{param}"`
///   e.g. `"00008:Q"` (Lee @ Inniscarra, discharge, m³/s - already this
///        app's unit, "cumecs" in the raw feed)
///        `"00001:W"` (water level, already cm in the raw feed)
pub struct IrelandRiverspyReader;

const SNAPSHOT_URL: &str = "https://www.riverspy.net/indexdata.cgi";
const BODY_MARKER: &str = "<body>";

#[derive(Deserialize)]
struct SnapshotResponse {
    rivers: Vec<Gauge>,
}

#[derive(Deserialize)]
struct Gauge {
    code: String,
    rivername: Option<String>,
    sitename: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    /// Unix epoch seconds, UTC.
    updated: Option<i64>,
    lastlevel: Option<f64>,
    /// `"cm"` (level) or `"cumecs"` (flow, m³/s).
    yunit: Option<String>,
}

async fn fetch_snapshot() -> anyhow::Result<Vec<Gauge>> {
    let body = reqwest::get(SNAPSHOT_URL)
        .await
        .map_err(|e| anyhow::anyhow!("IrelandRiverspyReader: HTTP error: {e}"))?
        .error_for_status()
        .map_err(|e| anyhow::anyhow!("IrelandRiverspyReader: server error: {e}"))?
        .text()
        .await
        .map_err(|e| anyhow::anyhow!("IrelandRiverspyReader: read error: {e}"))?;

    let json_start = body
        .rfind(BODY_MARKER)
        .map(|i| i + BODY_MARKER.len())
        .ok_or_else(|| anyhow::anyhow!("IrelandRiverspyReader: no <body> marker in response"))?;

    let resp: SnapshotResponse = serde_json::from_str(body[json_start..].trim())
        .map_err(|e| anyhow::anyhow!("IrelandRiverspyReader: JSON parse error: {e}"))?;
    Ok(resp.rivers)
}

/// This feed's `yunit` already matches our own unit convention exactly
/// (cm for level, m³/s=="cumecs" for flow), so values need no conversion.
fn param_key(yunit: &str) -> Option<&'static str> {
    match yunit {
        "cm" => Some("W"),
        "cumecs" => Some("Q"),
        _ => None,
    }
}

impl GaugeReader for IrelandRiverspyReader {
    fn provider_key(&self) -> &'static str {
        "riverspy"
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let gauges = fetch_snapshot().await?;
            Ok(gauges
                .into_iter()
                .filter_map(|g| {
                    let param = param_key(g.yunit.as_deref()?)?;
                    // The feed carries at least one stray foreign entry (a
                    // Swiss village); drop coordinates that fall outside
                    // Ireland rather than trust the feed blindly.
                    let (lat, lon) = match (g.latitude, g.longitude) {
                        (Some(lat), Some(lon))
                            if (51.0..=55.6).contains(&lat) && (-11.0..=-5.8).contains(&lon) =>
                        {
                            (Some(lat), Some(lon))
                        }
                        _ => (None, None),
                    };
                    Some(StationInfo {
                        station_id: g.code,
                        name: g.sitename,
                        river: g.rivername,
                        latitude: lat,
                        longitude: lon,
                        params: vec![param.to_owned()],
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
            if requests.is_empty() {
                return Ok(results);
            }

            let gauges = match fetch_snapshot().await {
                Ok(g) => g,
                Err(err) => {
                    tracing::error!("IrelandRiverspyReader: failed to fetch snapshot: {err}");
                    return Ok(results);
                }
            };
            let by_code: HashMap<&str, &Gauge> =
                gauges.iter().map(|g| (g.code.as_str(), g)).collect();

            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!(
                        "IrelandRiverspyReader: malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                };
                let Some(gauge) = by_code.get(station_id) else {
                    continue;
                };
                let (Some(unit), Some(value), Some(updated)) =
                    (gauge.yunit.as_deref(), gauge.lastlevel, gauge.updated)
                else {
                    continue;
                };
                if param_key(unit) != Some(param) {
                    continue;
                }
                let Some(ts) = Utc.timestamp_opt(updated, 0).single() else {
                    continue;
                };
                if ts <= req.from || ts > req.to {
                    continue;
                }
                results
                    .entry(req.source_id.clone())
                    .or_default()
                    .push((ts, value));
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn param_key_maps_units() {
        assert_eq!(param_key("cm"), Some("W"));
        assert_eq!(param_key("cumecs"), Some("Q"));
        assert_eq!(param_key("ft"), None);
    }
}
