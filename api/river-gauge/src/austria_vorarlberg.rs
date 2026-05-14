use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::{DateTime, Utc};
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Vorarlberg surface water gauges.
///
/// Source: https://vowis.vorarlberg.at/
/// API endpoint: GeoServer WFS (all stations in one request)
///   https://vowis.vorarlberg.at/geoserver/owf/ows?service=WFS&request=GetFeature
///   &typename=owf:Pegel&srsname=EPSG:4326&outputFormat=application/json
///
/// Each feature contains the most recent reading for W (cm) and Q (m3/s) with
/// separate ISO 8601 UTC timestamps (ZP_W / ZP_Q).
///
/// `source_id` format: `"{WISID}:{W|Q}"`
///   e.g. `"V334387:W"` or `"V334387:Q"`
///
/// The snapshot is cached for `CACHE_TTL` seconds.
pub struct AustriaVorarlbergReader {
    cache: Arc<Mutex<Option<(Instant, HashMap<String, Vec<(DateTime<Utc>, f64)>>)>>>,
}

impl Default for AustriaVorarlbergReader {
    fn default() -> Self {
        Self {
            cache: Arc::new(Mutex::new(None)),
        }
    }
}

const WFS_URL: &str = "https://vowis.vorarlberg.at/geoserver/owf/ows\
    ?service=WFS&request=GetFeature&typename=owf:Pegel\
    &srsname=EPSG:4326&outputFormat=application/json";

const CACHE_TTL: Duration = Duration::from_secs(300);

#[derive(Deserialize)]
struct FeatureCollection {
    features: Vec<Feature>,
}

#[derive(Deserialize)]
struct Feature {
    geometry: Option<PointGeometry>,
    properties: Properties,
}

#[derive(Deserialize)]
struct PointGeometry {
    /// [longitude, latitude] in EPSG:4326.
    coordinates: [f64; 2],
}

#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
struct Properties {
    wisid: String,
    #[serde(default)]
    stationsname: Option<String>,
    /// Current water level in cm (string, may be null).
    w: Option<serde_json::Value>,
    /// UTC timestamp for W reading.
    zp_w: Option<String>,
    /// Current discharge in m3/s (string, may have leading space, may be null).
    q: Option<serde_json::Value>,
    /// UTC timestamp for Q reading.
    zp_q: Option<String>,
}

fn parse_value(v: &serde_json::Value) -> Option<f64> {
    match v {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => s.trim().replace(',', ".").parse().ok(),
        _ => None,
    }
}

fn parse_iso(s: &str) -> Option<DateTime<Utc>> {
    s.parse::<DateTime<Utc>>().ok()
}

impl AustriaVorarlbergReader {
    async fn load_snapshot(&self) -> anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>> {
        let mut guard = self.cache.lock().await;

        if let Some((ts, ref data)) = *guard {
            if ts.elapsed() < CACHE_TTL {
                return Ok(data.clone());
            }
        }

        let resp = reqwest::get(WFS_URL)
            .await?
            .json::<FeatureCollection>()
            .await?;

        let mut map: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

        for feature in &resp.features {
            let p = &feature.properties;
            let wisid = &p.wisid;

            if let (Some(val), Some(ts_str)) = (p.w.as_ref(), p.zp_w.as_deref()) {
                if let (Some(v), Some(ts)) = (parse_value(val), parse_iso(ts_str)) {
                    map.entry(format!("{wisid}:W")).or_default().push((ts, v));
                }
            }

            if let (Some(val), Some(ts_str)) = (p.q.as_ref(), p.zp_q.as_deref()) {
                if let (Some(v), Some(ts)) = (parse_value(val), parse_iso(ts_str)) {
                    map.entry(format!("{wisid}:Q")).or_default().push((ts, v));
                }
            }
        }

        *guard = Some((Instant::now(), map.clone()));
        Ok(map)
    }
}

impl GaugeReader for AustriaVorarlbergReader {
    fn provider_key(&self) -> &'static str {
        "vbg"
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let resp = reqwest::get(WFS_URL)
                .await
                .map_err(|e| anyhow::anyhow!("VorarlbergReader: list_stations HTTP error: {e}"))?
                .json::<FeatureCollection>()
                .await
                .map_err(|e| anyhow::anyhow!("VorarlbergReader: list_stations JSON error: {e}"))?;

            Ok(resp
                .features
                .into_iter()
                .map(|f| {
                    let coords = f.geometry.as_ref().map(|g| g.coordinates);
                    let p = f.properties;
                    let mut params = Vec::new();
                    if p.w.is_some() { params.push("W".into()); }
                    if p.q.is_some() { params.push("Q".into()); }
                    StationInfo {
                        station_id: p.wisid,
                        name: p.stationsname,
                        river: None,
                        latitude: coords.map(|c| c[1]),
                        longitude: coords.map(|c| c[0]),
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
            let snapshot = self.load_snapshot().await?;

            let wanted: std::collections::HashSet<&str> =
                requests.iter().map(|r| r.source_id.as_str()).collect();

            Ok(snapshot
                .into_iter()
                .filter(|(id, _)| wanted.contains(id.as_str()))
                .collect())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_value ---

    #[test]
    fn parse_value_number() {
        assert_eq!(parse_value(&serde_json::json!(123.4)), Some(123.4));
    }

    #[test]
    fn parse_value_integer_number() {
        assert_eq!(parse_value(&serde_json::json!(55)), Some(55.0));
    }

    #[test]
    fn parse_value_string_plain() {
        assert_eq!(parse_value(&serde_json::json!("78.5")), Some(78.5));
    }

    #[test]
    fn parse_value_string_with_comma() {
        assert_eq!(parse_value(&serde_json::json!("7,82")), Some(7.82));
    }

    #[test]
    fn parse_value_string_with_leading_space() {
        assert_eq!(parse_value(&serde_json::json!(" 12.3")), Some(12.3));
    }

    #[test]
    fn parse_value_null_returns_none() {
        assert!(parse_value(&serde_json::Value::Null).is_none());
    }

    #[test]
    fn parse_value_non_numeric_string_returns_none() {
        assert!(parse_value(&serde_json::json!("n/a")).is_none());
    }
}
