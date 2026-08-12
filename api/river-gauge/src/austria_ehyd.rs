use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Vienna;
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::{
    BoxFuture, FetchRequest, GaugeReader, Readings, ReadingsBySource, SnapshotCache, StationInfo,
};

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
/// For historical data, `Diagram/pegelBgis` returns ~7 days of 30-min readings per station.
pub struct AustriaEhydReader {
    /// Cached snapshot: source_id -> single (ts, value) from PegelAktuell.
    /// Also used to build the source_id -> hzbnr map.
    cache: SnapshotCache<ReadingsBySource>,
    /// Cached mapping: source_id -> hzbnr, rebuilt alongside the snapshot.
    hzbnr_map: SnapshotCache<HashMap<String, i64>>,
    /// Cached timeseries per hzbnr: hzbnr -> sorted (ts, value) pairs.
    ts_cache: Arc<Mutex<HashMap<i64, (Instant, Readings)>>>,
}

impl Default for AustriaEhydReader {
    fn default() -> Self {
        Self {
            cache: Arc::new(Mutex::new(None)),
            hzbnr_map: Arc::new(Mutex::new(None)),
            ts_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

const API_URL: &str = "https://ehyd.gv.at/services/PegelAktuell/json";
/// Per-station timeseries: ~7 days of 30-min readings.
const DIAGRAM_URL: &str = "https://ehyd.gv.at/services/Diagram/pegelBgis";
const CACHE_TTL: Duration = Duration::from_secs(300);
/// Timeseries cache TTL — data updates every ~30 min.
const TS_CACHE_TTL: Duration = Duration::from_secs(300);

#[derive(Deserialize)]
struct DiagramResponse {
    /// Timestamps as strings "YYYY-MM-DD HH:MM:SS" in Vienna local time.
    categories: Vec<String>,
    data: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct FeatureCollection {
    features: Vec<Feature>,
}

#[derive(Deserialize)]
struct Feature {
    /// GeoJSON point; `coordinates` are [lon, lat].
    #[serde(default)]
    geometry: Option<Geometry>,
    properties: Properties,
}

#[derive(Deserialize)]
struct Geometry {
    #[serde(default)]
    coordinates: Vec<f64>,
}

#[derive(Deserialize)]
struct Properties {
    hzbnr: i64,
    /// Station name, e.g. "Salzburg (Nonntaler Brücke)".
    #[serde(default)]
    messstelle: Option<String>,
    /// River / water body name, e.g. "Salzach".
    #[serde(default)]
    gewasser: Option<String>,
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
    /// Load PegelAktuell snapshot and populate both the reading cache and the
    /// source_id -> hzbnr mapping.
    async fn load_snapshot(&self) -> anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>> {
        {
            let guard = self.cache.lock().await;
            if let Some((ts, ref data)) = *guard {
                if ts.elapsed() < CACHE_TTL {
                    return Ok(data.clone());
                }
            }
        }

        let resp = reqwest::get(API_URL)
            .await?
            .json::<FeatureCollection>()
            .await?;

        let mut map: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
        let mut hzbnr_map: HashMap<String, i64> = HashMap::new();

        for feature in &resp.features {
            let p = &feature.properties;

            let base = match derive_base_id(p) {
                Some(b) => b,
                None => continue,
            };

            let source_id = format!("{}:{}", base, p.parameter);
            hzbnr_map.insert(source_id.clone(), p.hzbnr);

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

            map.entry(source_id).or_default().push((ts, value));
        }

        let now = Instant::now();
        *self.cache.lock().await = Some((now, map.clone()));
        *self.hzbnr_map.lock().await = Some((now, hzbnr_map));
        Ok(map)
    }

    /// Fetch (or return cached) ~7-day timeseries for one station from pegelBgis.
    async fn load_timeseries(&self, hzbnr: i64) -> anyhow::Result<Vec<(DateTime<Utc>, f64)>> {
        {
            let cache = self.ts_cache.lock().await;
            if let Some((ts, data)) = cache.get(&hzbnr) {
                if ts.elapsed() < TS_CACHE_TTL {
                    return Ok(data.clone());
                }
            }
        }

        let url = format!("{DIAGRAM_URL}?hzbnr={hzbnr}");
        let body = reqwest::get(&url).await?.bytes().await?;
        if body.is_empty() {
            return Ok(vec![]);
        }
        let resp: DiagramResponse = serde_json::from_slice(&body)
            .map_err(|e| anyhow::anyhow!("eHYD pegelBgis parse error for hzbnr {hzbnr}: {e}"))?;

        let mut readings: Vec<(DateTime<Utc>, f64)> = Vec::with_capacity(resp.categories.len());
        for (ts_str, val) in resp.categories.iter().zip(resp.data.iter()) {
            let v = match val.as_f64() {
                Some(f) => f,
                None => continue,
            };
            // Timestamps are Vienna local time: "YYYY-MM-DD HH:MM:SS"
            let naive = match NaiveDateTime::parse_from_str(ts_str, "%Y-%m-%d %H:%M:%S") {
                Ok(n) => n,
                Err(_) => continue,
            };
            let utc = match Vienna.from_local_datetime(&naive).single() {
                Some(dt) => dt.with_timezone(&Utc),
                None => continue,
            };
            readings.push((utc, v));
        }
        readings.sort_unstable_by_key(|(ts, _)| *ts);

        self.ts_cache
            .lock()
            .await
            .insert(hzbnr, (Instant::now(), readings.clone()));
        Ok(readings)
    }
}

impl GaugeReader for AustriaEhydReader {
    fn provider_key(&self) -> &'static str {
        "ehyd"
    }

    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(7))
    }

    /// Discover the full federal (eHYD) catalog live from `PegelAktuell`.
    ///
    /// Each feature is one gauge parameter (W = water level, Q = discharge);
    /// features that share a base source_id collapse into a single station
    /// carrying both provider keys in `params`. Only stations whose province
    /// maps to a known source_id scheme are kept, matching what `fetch_all`
    /// can actually resolve.
    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async move {
            let resp = reqwest::get(API_URL)
                .await?
                .json::<FeatureCollection>()
                .await?;

            let mut stations: HashMap<String, StationInfo> = HashMap::new();
            for feature in &resp.features {
                let p = &feature.properties;

                // Keep only real water gauges: level (W) or discharge (Q).
                if p.parameter != "W" && p.parameter != "Q" {
                    continue;
                }

                // Map to the provincial source_id base; skip provinces we
                // cannot resolve (these are unreachable in fetch_all too).
                let base = match derive_base_id(p) {
                    Some(b) => b,
                    None => continue,
                };

                let (longitude, latitude) = feature
                    .geometry
                    .as_ref()
                    .filter(|g| g.coordinates.len() >= 2)
                    .map(|g| (Some(g.coordinates[0]), Some(g.coordinates[1])))
                    .unwrap_or((None, None));

                let entry = stations.entry(base.clone()).or_insert_with(|| StationInfo {
                    station_id: base.clone(),
                    name: p.messstelle.clone(),
                    river: p.gewasser.clone(),
                    latitude,
                    longitude,
                    params: Vec::new(),
                });
                if !entry.params.contains(&p.parameter) {
                    entry.params.push(p.parameter.clone());
                }
            }

            let mut out: Vec<StationInfo> = stations.into_values().collect();
            out.sort_by(|a, b| a.station_id.cmp(&b.station_id));
            Ok(out)
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            // Ensure snapshot is loaded so hzbnr_map is populated.
            if let Err(e) = self.load_snapshot().await {
                tracing::error!("AustriaEhydReader: snapshot load failed: {e}");
            }

            let hzbnr_lookup = {
                let guard = self.hzbnr_map.lock().await;
                guard.as_ref().map(|(_, m)| m.clone()).unwrap_or_default()
            };

            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

            for req in requests {
                let hzbnr = match hzbnr_lookup.get(&req.source_id) {
                    Some(&h) => h,
                    None => continue,
                };
                match self.load_timeseries(hzbnr).await {
                    Ok(readings) => {
                        let filtered: Vec<_> = readings
                            .into_iter()
                            .filter(|(ts, _)| *ts > req.from && *ts <= req.to)
                            .collect();
                        if !filtered.is_empty() {
                            results.insert(req.source_id.clone(), filtered);
                        }
                    }
                    Err(e) => {
                        tracing::warn!(
                            "AustriaEhydReader: pegelBgis failed for {}: {e}",
                            req.source_id
                        );
                    }
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn props(hzbnr: i64, hd: &str, internet: &str) -> Properties {
        Properties {
            hzbnr,
            messstelle: None,
            gewasser: None,
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
