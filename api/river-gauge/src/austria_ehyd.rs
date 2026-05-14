use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Vienna;
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

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

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            Ok(vec![
            StationInfo { station_id: "ktn.2".to_owned(), name: Some("Spittal-Fasan".to_owned()), river: Some("Lieser".to_owned()), latitude: Some(46.807701), longitude: Some(13.4963), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ktn.4".to_owned(), name: Some("Miklauzhof".to_owned()), river: Some("Vellach".to_owned()), latitude: Some(46.536999), longitude: Some(14.5937), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ktn.6".to_owned(), name: Some("Sandriesen".to_owned()), river: Some("Malta".to_owned()), latitude: Some(46.911999), longitude: Some(13.532), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "ktn.7".to_owned(), name: Some("Maria Luggau-Moos".to_owned()), river: Some("Gail".to_owned()), latitude: Some(46.702702), longitude: Some(12.7406), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ktn.8".to_owned(), name: Some("Weitensfeld-Ost".to_owned()), river: Some("Gurk".to_owned()), latitude: Some(46.849499), longitude: Some(14.1997), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ktn.9".to_owned(), name: Some("Bad Eisenkappel - Forsthaus".to_owned()), river: Some("Ebriachbach".to_owned()), latitude: Some(46.4893), longitude: Some(14.5862), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "noe.207944".to_owned(), name: Some("Zwettl (Bahnbrücke) (EVN)".to_owned()), river: Some("Kamp".to_owned()), latitude: Some(48.610298), longitude: Some(15.1723), params: vec!["W".to_owned()] },
            StationInfo { station_id: "noe.208462".to_owned(), name: Some("Ehrendorf".to_owned()), river: Some("Lainsitz".to_owned()), latitude: Some(48.757999), longitude: Some(14.9618), params: vec!["W".to_owned()] },
            StationInfo { station_id: "noe.208579".to_owned(), name: Some("Hoheneich".to_owned()), river: Some("Braunaubach".to_owned()), latitude: Some(48.771301), longitude: Some(15.0079), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "noe.208850".to_owned(), name: Some("Erlaufboden (EVN)".to_owned()), river: Some("Große Erlauf".to_owned()), latitude: Some(47.881199), longitude: Some(15.2639), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "noe.209551".to_owned(), name: Some("Lunz am See (Seestraße)".to_owned()), river: Some("Ois".to_owned()), latitude: Some(47.8605), longitude: Some(15.0312), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "ooe.0150".to_owned(), name: Some("Leopoldschlag".to_owned()), river: Some("Maltsch".to_owned()), latitude: Some(48.6171), longitude: Some(14.5044), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.3475".to_owned(), name: Some("Bad Mühllacken".to_owned()), river: Some("Pesenbach".to_owned()), latitude: Some(48.364201), longitude: Some(14.0645), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.3850".to_owned(), name: Some("Zwettl an der Rodl".to_owned()), river: Some("Große Rodl".to_owned()), latitude: Some(48.468201), longitude: Some(14.2756), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.4030".to_owned(), name: Some("Obertraun".to_owned()), river: Some("Traun".to_owned()), latitude: Some(47.564499), longitude: Some(13.7215), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.6270".to_owned(), name: Some("Penningersteg".to_owned()), river: Some("Alm".to_owned()), latitude: Some(48.052898), longitude: Some(13.9227), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.8015".to_owned(), name: Some("Platzl".to_owned()), river: Some("Laussabach".to_owned()), latitude: Some(47.727699), longitude: Some(14.64), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.8130".to_owned(), name: Some("Reichraming".to_owned()), river: Some("Reichramingbach".to_owned()), latitude: Some(47.8862), longitude: Some(14.4545), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.8445".to_owned(), name: Some("Roßleithen".to_owned()), river: Some("Piessling".to_owned()), latitude: Some(47.705898), longitude: Some(14.2694), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.8580".to_owned(), name: Some("Steyrling".to_owned()), river: Some("Steyrling".to_owned()), latitude: Some(47.805), longitude: Some(14.1372), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.8620".to_owned(), name: Some("Klaus an der Pyhrnbahn".to_owned()), river: Some("Steyr".to_owned()), latitude: Some(47.830299), longitude: Some(14.1593), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.8790".to_owned(), name: Some("Molln".to_owned()), river: Some("Krumme Steyrling".to_owned()), latitude: Some(47.893799), longitude: Some(14.2798), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.9160".to_owned(), name: Some("Kefermarkt".to_owned()), river: Some("Feldaist".to_owned()), latitude: Some(48.443199), longitude: Some(14.5344), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.9220".to_owned(), name: Some("Weitersfelden".to_owned()), river: Some("Waldaist (Schwarze Aist)".to_owned()), latitude: Some(48.4716), longitude: Some(14.7219), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.9420".to_owned(), name: Some("Königswiesen (Ort)".to_owned()), river: Some("Große Naarn".to_owned()), latitude: Some(48.4039), longitude: Some(14.8395), params: vec!["W".to_owned()] },
            StationInfo { station_id: "ooe.9480".to_owned(), name: Some("Haid".to_owned()), river: Some("Naarn".to_owned()), latitude: Some(48.208599), longitude: Some(14.683), params: vec!["W".to_owned()] },
            StationInfo { station_id: "sbg.203265".to_owned(), name: Some("Schwaighofbrücke".to_owned()), river: Some("Lammer".to_owned()), latitude: Some(47.573898), longitude: Some(13.3847), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "sbg.203463".to_owned(), name: Some("Viehhofen".to_owned()), river: Some("Saalach".to_owned()), latitude: Some(47.3657), longitude: Some(12.7357), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "sbg.203901".to_owned(), name: Some("Wallnerau".to_owned()), river: Some("Salzach".to_owned()), latitude: Some(47.310101), longitude: Some(13.1202), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "sbg.204180".to_owned(), name: Some("Salzburg (Nonntaler Brücke)".to_owned()), river: Some("Salzach".to_owned()), latitude: Some(47.7981), longitude: Some(13.054), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "stmk.1035".to_owned(), name: Some("Schladming".to_owned()), river: Some("Enns".to_owned()), latitude: Some(47.397202), longitude: Some(13.6975), params: vec!["W".to_owned()] },
            StationInfo { station_id: "stmk.1554".to_owned(), name: Some("Admont".to_owned()), river: Some("Enns".to_owned()), latitude: Some(47.5811), longitude: Some(14.4621), params: vec!["Q".to_owned()] },
            StationInfo { station_id: "stmk.1730".to_owned(), name: Some("Wildalpen".to_owned()), river: Some("Salza".to_owned()), latitude: Some(47.6651), longitude: Some(14.983), params: vec!["W".to_owned()] },
            StationInfo { station_id: "stmk.3770".to_owned(), name: Some("Schwanberg".to_owned()), river: Some("Schwarze Sulm".to_owned()), latitude: Some(46.755901), longitude: Some(15.2044), params: vec!["Q".to_owned()] },
            ])
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
