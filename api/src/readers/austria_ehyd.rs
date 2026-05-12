use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Vienna;
use serde::Deserialize;
use tokio::sync::Mutex;

use super::{BoxFuture, FetchRequest, GaugeReader};

/// Reader for Austrian federal hydrography data (eHYD / BMLUK).
///
/// Source: https://ehyd.gv.at/
/// API endpoint: https://ehyd.gv.at/services/PegelAktuell/json
///
/// The endpoint returns a GeoJSON FeatureCollection with current readings for
/// all Austrian gauges (approx. 300 entries). Each feature has `parameter` W
/// or Q and a single `wert` value.
///
/// Supported provinces and `source_id` formats:
///   - Niederosterreich: `"noe.{hzbnr}:{W|Q}"`  (hzbnr == local id)
///   - Salzburg:         `"sbg.{hzbnr}:{W|Q}"`  (hzbnr == local id)
///   - Steiermark:       `"stmk.{ow_id}:{W|Q}"` (parsed from internet URL `hdnr=ow{id}`)
///   - Oberosterreich:   `"ooe.{hash_id}:{W|Q}"` (parsed from internet URL `#{id}`)
///   - Karnten (4 of 6): static hzbnr mapping
///   - Tirol:            `"{hzbnr}:{W|Q}"` (pure number, already covered by tirol reader)
///
/// The snapshot is cached for `CACHE_TTL` seconds to avoid hammering the endpoint.
pub struct AustriaEhydReader {
    cache: Arc<Mutex<Option<(Instant, HashMap<String, Vec<(DateTime<Utc>, f64)>>)>>>,
}

impl Default for AustriaEhydReader {
    fn default() -> Self {
        Self {
            cache: Arc::new(Mutex::new(None)),
        }
    }
}

const API_URL: &str = "https://ehyd.gv.at/services/PegelAktuell/json";
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
struct Properties {
    hzbnr: i64,
    /// "W" or "Q"
    parameter: String,
    wert: String,
    /// ISO 8601 local Austrian time, e.g. "2026-05-12T19:00:00"
    zp: String,
    /// Link to provincial gauge page; encodes provincial station ID.
    #[serde(default)]
    internet: String,
    #[serde(default)]
    hd: String,
}

/// Derive the paddlemate `source_id` base (without parameter suffix) from a
/// feature's properties.
///
/// Returns `None` for features whose province cannot be mapped (e.g. TIWAG,
/// viaDonau, Burgenland) unless they are plain Tirol hzbnr stations.
fn derive_base_id(props: &Properties) -> Option<String> {
    let hzbnr = props.hzbnr;
    let internet = &props.internet;

    match props.hd.as_str() {
        "Niederösterreich" => Some(format!("noe.{hzbnr}")),
        "Salzburg" | "Salzburg AG" => Some(format!("sbg.{hzbnr}")),

        "Steiermark" => {
            // e.g. https://egov.stmk.gv.at/...?hdnr=ow1035
            let ow_id = internet
                .split("hdnr=ow")
                .nth(1)
                .and_then(|s| s.split(['&', '"', '?', ';']).next())?;
            Some(format!("stmk.{ow_id}"))
        }

        "Oberösterreich" => {
            // e.g. http://hydro.ooe.gv.at/#0150
            let hash_id = internet.split('#').nth(1)?;
            Some(format!("ooe.{hash_id}"))
        }

        "Kärnten" => {
            // Static table: hzbnr -> ktn local id
            let ktn_id = match hzbnr {
                212530 => "2", // Lieser @ Spittal-Fasan
                212852 => "4", // Vellach @ Miklauzhof
                212498 => "6", // Malta @ Sandriesen
                212886 => "8", // Gurk @ Weitensfeld-Ost
                _ => return None,
            };
            Some(format!("ktn.{ktn_id}"))
        }

        // Tirol is covered by the tirol reader; skip duplicates here.
        "Tirol" | "TIWAG" => None,

        _ => None,
    }
}

/// Parse an Austrian local datetime string ("2026-05-12T19:00:00") into UTC.
fn parse_zp(zp: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(zp, "%Y-%m-%dT%H:%M:%S").ok()?;
    Vienna.from_local_datetime(&naive).single().map(|dt| dt.with_timezone(&Utc))
}

impl AustriaEhydReader {
    async fn load_snapshot(&self) -> anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>> {
        let mut guard = self.cache.lock().await;

        if let Some((ts, ref data)) = *guard {
            if ts.elapsed() < CACHE_TTL {
                return Ok(data.clone());
            }
        }

        let resp = reqwest::get(API_URL).await?.json::<FeatureCollection>().await?;

        let mut map: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

        for feature in &resp.features {
            let p = &feature.properties;

            let value: f64 = match p.wert.trim().replace(',', ".").parse() {
                Ok(v) => v,
                Err(_) => continue,
            };

            let ts = match parse_zp(&p.zp) {
                Some(t) => t,
                None => continue,
            };

            let base = match derive_base_id(p) {
                Some(b) => b,
                None => continue,
            };

            let source_id = format!("{}:{}", base, p.parameter);
            map.entry(source_id).or_default().push((ts, value));
        }

        *guard = Some((Instant::now(), map.clone()));
        Ok(map)
    }
}

impl GaugeReader for AustriaEhydReader {
    fn provider_key(&self) -> &'static str {
        "ehyd"
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
