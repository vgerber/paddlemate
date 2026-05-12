use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::{DateTime, Utc};
use serde::Deserialize;
use tokio::sync::Mutex;

use super::{BoxFuture, FetchRequest, GaugeReader};

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
    properties: Properties,
}

#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
struct Properties {
    wisid: String,
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
