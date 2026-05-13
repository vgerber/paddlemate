use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Vienna;
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::{BoxFuture, FetchRequest, GaugeReader};

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
    wert: Option<String>,
    /// ISO 8601 local Austrian time, e.g. "2026-05-12T19:00:00"
    zp: Option<String>,
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
    Vienna
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.with_timezone(&Utc))
}

impl AustriaEhydReader {
    async fn load_snapshot(&self) -> anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>> {
        let mut guard = self.cache.lock().await;

        if let Some((ts, ref data)) = *guard {
            if ts.elapsed() < CACHE_TTL {
                return Ok(data.clone());
            }
        }

        let resp = reqwest::get(API_URL)
            .await?
            .json::<FeatureCollection>()
            .await?;

        let mut map: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

        for feature in &resp.features {
            let p = &feature.properties;

            let value: f64 = match p
                .wert
                .as_deref()
                .and_then(|s| s.trim().replace(',', ".").parse().ok())
            {
                Some(v) => v,
                None => continue,
            };

            let ts = match p.zp.as_deref().and_then(parse_zp) {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn props(hzbnr: i64, hd: &str, internet: &str) -> Properties {
        Properties {
            hzbnr,
            parameter: "W".into(),
            wert: Some("100".into()),
            zp: Some("2026-05-12T10:00:00".into()),
            internet: internet.to_string(),
            hd: hd.to_string(),
        }
    }

    // --- derive_base_id ---

    #[test]
    fn derive_base_id_noe() {
        let p = props(207944, "Niederösterreich", "");
        assert_eq!(derive_base_id(&p), Some("noe.207944".into()));
    }

    #[test]
    fn derive_base_id_salzburg() {
        let p = props(300001, "Salzburg", "");
        assert_eq!(derive_base_id(&p), Some("sbg.300001".into()));
    }

    #[test]
    fn derive_base_id_salzburg_ag() {
        let p = props(300002, "Salzburg AG", "");
        assert_eq!(derive_base_id(&p), Some("sbg.300002".into()));
    }

    #[test]
    fn derive_base_id_stmk_parses_hdnr() {
        let p = props(0, "Steiermark", "https://egov.stmk.gv.at/?hdnr=ow1035");
        assert_eq!(derive_base_id(&p), Some("stmk.1035".into()));
    }

    #[test]
    fn derive_base_id_stmk_no_hdnr_returns_none() {
        let p = props(0, "Steiermark", "https://egov.stmk.gv.at/?other=param");
        assert!(derive_base_id(&p).is_none());
    }

    #[test]
    fn derive_base_id_ooe_parses_hash() {
        let p = props(0, "Oberösterreich", "http://hydro.ooe.gv.at/#0150");
        assert_eq!(derive_base_id(&p), Some("ooe.0150".into()));
    }

    #[test]
    fn derive_base_id_ooe_no_hash_returns_none() {
        let p = props(0, "Oberösterreich", "http://hydro.ooe.gv.at/");
        assert!(derive_base_id(&p).is_none());
    }

    #[test]
    fn derive_base_id_kaernten_known() {
        assert_eq!(
            derive_base_id(&props(212530, "Kärnten", "")),
            Some("ktn.2".into())
        );
        assert_eq!(
            derive_base_id(&props(212852, "Kärnten", "")),
            Some("ktn.4".into())
        );
        assert_eq!(
            derive_base_id(&props(212498, "Kärnten", "")),
            Some("ktn.6".into())
        );
        assert_eq!(
            derive_base_id(&props(212886, "Kärnten", "")),
            Some("ktn.8".into())
        );
    }

    #[test]
    fn derive_base_id_kaernten_unknown_returns_none() {
        assert!(derive_base_id(&props(999999, "Kärnten", "")).is_none());
    }

    #[test]
    fn derive_base_id_tirol_returns_none() {
        // Tirol is handled by the dedicated tirol reader; ehyd must skip it.
        assert!(derive_base_id(&props(201525, "Tirol", "")).is_none());
        assert!(derive_base_id(&props(201525, "TIWAG", "")).is_none());
    }

    #[test]
    fn derive_base_id_unknown_province_returns_none() {
        assert!(derive_base_id(&props(0, "Vorarlberg", "")).is_none());
    }

    // --- parse_zp ---

    #[test]
    fn parse_zp_valid_converts_to_utc() {
        // Vienna is UTC+2 in summer (CEST)
        let utc = parse_zp("2026-05-12T12:00:00").expect("should parse");
        // 12:00 Vienna CEST = 10:00 UTC
        assert_eq!(utc.timestamp(), 1778580000);
    }

    #[test]
    fn parse_zp_invalid_returns_none() {
        assert!(parse_zp("not-a-date").is_none());
        assert!(parse_zp("").is_none());
    }
}
