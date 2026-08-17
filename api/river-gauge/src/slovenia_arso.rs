use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Ljubljana;
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, ReadingsBySource, SnapshotCache, StationInfo};

/// Reader for Slovenia's national hydrological network (ARSO).
///
/// Source: https://www.arso.gov.si/xml/vode/hidro_podatki_zadnji.xml
///
/// One XML document (`<arsopodatki>`) with the latest reading for all ~190
/// Slovenian surface-water stations, refreshed every **30 minutes** (the feed
/// itself recommends polling 5 minutes past the full/half hour). Latest values
/// only - no history endpoint - so this is a snapshot provider
/// (`history_depth` = `None`).
///
/// License: free to use with attribution to **ARSO (Agencija RS za okolje /
/// Slovenian Environment Agency)** as the source.
///
/// Each `<postaja sifra="..." wgs84_dolzina="..." wgs84_sirina="...">` carries
/// `<reka>` (river), `<merilno_mesto>` (station name), `<datum>` (local
/// Slovenian time, Europe/Ljubljana), `<vodostaj>` (water level, cm) and
/// `<pretok>` (discharge, m³/s). Sea/lake stations may report neither level
/// nor discharge (only wave height / temperature); those are skipped.
///
/// `source_id` format: `"{sifra}:{param}"`
///   e.g. `"1060:W"` (Mura @ Gornja Radgona, water level cm)
///        `"1060:Q"` (Mura @ Gornja Radgona, discharge m³/s)
///
/// `W` = vodostaj (water level, **cm**), `Q` = pretok (discharge, **m³/s**).
///
/// The snapshot is cached for [`CACHE_TTL`] so one HTTP GET serves both
/// `list_stations` and `fetch_all` in a poll cycle.
#[derive(Default)]
pub struct SloveniaArsoReader {
    cache: SnapshotCache<Vec<ArsoStation>>,
}

const SNAPSHOT_URL: &str = "https://www.arso.gov.si/xml/vode/hidro_podatki_zadnji.xml";
const CACHE_TTL: Duration = Duration::from_secs(300);

/// One station's latest state, parsed out of the XML snapshot.
#[derive(Debug, Clone)]
struct ArsoStation {
    station_id: String,
    name: Option<String>,
    river: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    /// Reading timestamp, converted from Europe/Ljubljana to UTC.
    timestamp: Option<DateTime<Utc>>,
    /// Water level in cm.
    level_cm: Option<f64>,
    /// Discharge in m³/s.
    flow_m3s: Option<f64>,
}

#[derive(Deserialize)]
struct ArsoPodatki {
    #[serde(rename = "postaja", default)]
    postaje: Vec<Postaja>,
}

#[derive(Deserialize)]
struct Postaja {
    #[serde(rename = "@sifra")]
    sifra: String,
    /// WGS-84 longitude ("dolžina") attribute, e.g. "15.9953".
    #[serde(rename = "@wgs84_dolzina", default)]
    wgs84_dolzina: Option<String>,
    /// WGS-84 latitude ("širina") attribute, e.g. "46.68124".
    #[serde(rename = "@wgs84_sirina", default)]
    wgs84_sirina: Option<String>,
    /// River / water body, e.g. "Mura". quick-xml unescapes entities (č/š/ž).
    #[serde(default)]
    reka: Option<String>,
    /// Station name, e.g. "Gornja Radgona".
    #[serde(default)]
    merilno_mesto: Option<String>,
    /// Local Slovenian time "YYYY-MM-DD HH:MM" (Europe/Ljubljana).
    #[serde(default)]
    datum: Option<String>,
    /// Water level in cm; empty element (`<vodostaj/>`) when unavailable.
    #[serde(default)]
    vodostaj: Option<String>,
    /// Discharge in m³/s; empty element when unavailable.
    #[serde(default)]
    pretok: Option<String>,
}

/// Parse an optional numeric text field; empty/whitespace/missing -> `None`.
fn parse_num(s: Option<&str>) -> Option<f64> {
    s?.trim().parse::<f64>().ok()
}

/// Parse "YYYY-MM-DD HH:MM" in Europe/Ljubljana local time and return UTC.
fn parse_datum(datum: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(datum.trim(), "%Y-%m-%d %H:%M").ok()?;
    Ljubljana
        .from_local_datetime(&naive)
        .earliest()
        .map(|dt| dt.with_timezone(&Utc))
}

/// Parse the whole XML snapshot into per-station latest states.
fn parse_snapshot(xml: &str) -> anyhow::Result<Vec<ArsoStation>> {
    let doc: ArsoPodatki = quick_xml::de::from_str(xml)
        .map_err(|e| anyhow::anyhow!("SloveniaArsoReader: XML parse error: {e}"))?;

    Ok(doc
        .postaje
        .into_iter()
        .map(|p| ArsoStation {
            station_id: p.sifra,
            name: p.merilno_mesto.filter(|s| !s.trim().is_empty()),
            river: p.reka.filter(|s| !s.trim().is_empty()),
            latitude: parse_num(p.wgs84_sirina.as_deref()),
            longitude: parse_num(p.wgs84_dolzina.as_deref()),
            timestamp: p.datum.as_deref().and_then(parse_datum),
            level_cm: parse_num(p.vodostaj.as_deref()),
            flow_m3s: parse_num(p.pretok.as_deref()),
        })
        .collect())
}

impl SloveniaArsoReader {
    async fn get_snapshot(&self) -> anyhow::Result<Vec<ArsoStation>> {
        let mut guard = self.cache.lock().await;

        if let Some((fetched_at, ref stations)) = *guard {
            if fetched_at.elapsed() < CACHE_TTL {
                return Ok(stations.clone());
            }
        }

        let xml = reqwest::get(SNAPSHOT_URL)
            .await
            .map_err(|e| anyhow::anyhow!("SloveniaArsoReader: HTTP error: {e}"))?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("SloveniaArsoReader: server error: {e}"))?
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("SloveniaArsoReader: read error: {e}"))?;

        let stations = parse_snapshot(&xml)?;

        *guard = Some((Instant::now(), stations.clone()));
        Ok(stations)
    }
}

impl GaugeReader for SloveniaArsoReader {
    fn provider_key(&self) -> &'static str {
        "arso"
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let snapshot = self.get_snapshot().await?;

            Ok(snapshot
                .into_iter()
                .filter_map(|s| {
                    let mut params = Vec::new();
                    if s.level_cm.is_some() {
                        params.push("W".to_owned());
                    }
                    if s.flow_m3s.is_some() {
                        params.push("Q".to_owned());
                    }
                    // Sea/lake wave stations without level or discharge are
                    // of no use as gauges.
                    if params.is_empty() {
                        return None;
                    }
                    Some(StationInfo {
                        station_id: s.station_id,
                        name: s.name,
                        river: s.river,
                        latitude: s.latitude,
                        longitude: s.longitude,
                        params,
                    })
                })
                .collect())
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<ReadingsBySource>> {
        Box::pin(async move {
            if requests.is_empty() {
                return Ok(HashMap::new());
            }

            let snapshot = match self.get_snapshot().await {
                Ok(s) => s,
                Err(err) => {
                    tracing::error!("SloveniaArsoReader: failed to fetch snapshot: {err}");
                    return Ok(HashMap::new());
                }
            };
            let by_id: HashMap<&str, &ArsoStation> = snapshot
                .iter()
                .map(|s| (s.station_id.as_str(), s))
                .collect();

            let mut results: ReadingsBySource = HashMap::new();

            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!(
                        "SloveniaArsoReader: malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                };
                let Some(station) = by_id.get(station_id) else {
                    tracing::warn!("SloveniaArsoReader: unknown station '{station_id}'");
                    continue;
                };
                let value = match param {
                    "W" => station.level_cm,
                    "Q" => station.flow_m3s,
                    other => {
                        tracing::warn!(
                            "SloveniaArsoReader: unknown param '{other}' for station {station_id}"
                        );
                        continue;
                    }
                };
                let (Some(ts), Some(value)) = (station.timestamp, value) else {
                    continue;
                };
                if ts > req.from && ts <= req.to {
                    results
                        .entry(req.source_id.clone())
                        .or_default()
                        .push((ts, value));
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Trimmed straight from the live feed (2026-08-14): one full station, one
    /// with an empty `<vodostaj/>`, and one with entity-escaped names.
    const SAMPLE_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<arsopodatki verzija="1.5"><vir>Agencija RS za okolje</vir><predlagan_zajem>5 minut &#x010D;ez polno uro ali pol ure</predlagan_zajem><predlagan_zajem_perioda>30 min</predlagan_zajem_perioda><datum_priprave>2026-08-14 17:30</datum_priprave><postaja  sifra="1060"  wgs84_dolzina="15.9953"  wgs84_sirina="46.68124"  kota_0="202.35" ><reka>Mura</reka><merilno_mesto>Gornja Radgona</merilno_mesto><ime_kratko>Mura - Gor. Radgona I</ime_kratko><datum>2026-08-14 17:30</datum><datum_cet>2026-08-14 16:30</datum_cet><vodostaj>56</vodostaj><pretok>46.1</pretok><prvi_vv_pretok>600.0</prvi_vv_pretok><pretok_znacilni>mali pretok</pretok_znacilni><temp_vode>24.9</temp_vode></postaja><postaja  sifra="1100"  wgs84_dolzina="16.02129"  wgs84_sirina="46.71097"  kota_0="206.0" ><reka>Ku&#x010D;nica</reka><merilno_mesto>Cankova</merilno_mesto><ime_kratko>Ku&#x010D;nica - Cankova</ime_kratko><datum>2026-08-14 17:30</datum><datum_cet>2026-08-14 16:30</datum_cet><vodostaj/><pretok>0.001</pretok><pretok_znacilni>mali pretok</pretok_znacilni><temp_vode/></postaja><postaja  sifra="1165"  wgs84_dolzina="16.02741"  wgs84_sirina="46.81007"  kota_0="232.19" ><reka>Ledava</reka><merilno_mesto>Nuskova</merilno_mesto><ime_kratko>Ledava - Nuskova</ime_kratko><datum>2026-08-14 17:30</datum><datum_cet>2026-08-14 16:30</datum_cet><vodostaj/><pretok/><pretok_znacilni/><temp_vode/></postaja></arsopodatki>"#;

    #[test]
    fn parse_snapshot_extracts_stations() {
        let stations = parse_snapshot(SAMPLE_XML).expect("should parse");
        assert_eq!(stations.len(), 3);

        let mura = &stations[0];
        assert_eq!(mura.station_id, "1060");
        assert_eq!(mura.name.as_deref(), Some("Gornja Radgona"));
        assert_eq!(mura.river.as_deref(), Some("Mura"));
        assert!((mura.latitude.unwrap() - 46.68124).abs() < 1e-9);
        assert!((mura.longitude.unwrap() - 15.9953).abs() < 1e-9);
        assert_eq!(mura.level_cm, Some(56.0));
        assert!((mura.flow_m3s.unwrap() - 46.1).abs() < 1e-9);
        // 2026-08-14 17:30 Ljubljana (CEST, UTC+2) = 15:30 UTC.
        assert_eq!(mura.timestamp.unwrap().timestamp(), 1786721400);
    }

    #[test]
    fn parse_snapshot_unescapes_entities_and_empty_level() {
        let stations = parse_snapshot(SAMPLE_XML).unwrap();
        let kucnica = &stations[1];
        // &#x010D; must come out as "č".
        assert_eq!(kucnica.river.as_deref(), Some("Kučnica"));
        // Empty <vodostaj/> -> no level, but discharge is present.
        assert_eq!(kucnica.level_cm, None);
        assert_eq!(kucnica.flow_m3s, Some(0.001));
    }

    #[test]
    fn parse_snapshot_station_without_values() {
        let stations = parse_snapshot(SAMPLE_XML).unwrap();
        let nuskova = &stations[2];
        assert_eq!(nuskova.level_cm, None);
        assert_eq!(nuskova.flow_m3s, None);
    }

    #[test]
    fn parse_datum_summer_time_is_cest() {
        // 2026-08-14 17:30 in Ljubljana (CEST, UTC+2) = 15:30 UTC.
        let ts = parse_datum("2026-08-14 17:30").expect("should parse");
        assert_eq!(ts.timestamp(), 1786721400);
    }

    #[test]
    fn parse_datum_winter_time_is_cet() {
        // 2026-01-14 17:30 in Ljubljana (CET, UTC+1) = 16:30 UTC.
        let ts = parse_datum("2026-01-14 17:30").expect("should parse");
        assert_eq!(
            ts.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-01-14T16:30:00Z"
        );
    }

    #[test]
    fn parse_datum_invalid_returns_none() {
        assert!(parse_datum("not-a-date").is_none());
        assert!(parse_datum("").is_none());
    }

    #[test]
    fn parse_num_handles_empty_and_missing() {
        assert_eq!(parse_num(Some("56")), Some(56.0));
        assert_eq!(parse_num(Some("46.1")), Some(46.1));
        assert_eq!(parse_num(Some("")), None);
        assert_eq!(parse_num(Some("  ")), None);
        assert_eq!(parse_num(None), None);
    }

    /// Live smoke test - hits the real ARSO feed. Run explicitly with
    /// `cargo test -p river-gauge slovenia -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "live network access"]
    async fn live_smoke() {
        let reader = SloveniaArsoReader::default();
        let stations = reader.list_stations().await.expect("list_stations");
        let n_w = stations
            .iter()
            .filter(|s| s.params.iter().any(|p| p == "W"))
            .count();
        let n_q = stations
            .iter()
            .filter(|s| s.params.iter().any(|p| p == "Q"))
            .count();
        println!(
            "ARSO: {} stations ({n_w} with W, {n_q} with Q)",
            stations.len()
        );
        assert!(stations.len() > 100, "expected >100 stations");
        assert!(stations.iter().all(|s| !s.params.is_empty()));
        let sample = &stations[0];
        println!(
            "sample: {} {:?} / {:?} @ ({:?}, {:?}) params={:?}",
            sample.station_id,
            sample.river,
            sample.name,
            sample.latitude,
            sample.longitude,
            sample.params
        );

        // Fetch every advertised source_id over the past day.
        let now = Utc::now();
        let requests: Vec<FetchRequest> = stations
            .iter()
            .flat_map(|s| {
                s.params.iter().map(|p| FetchRequest {
                    source_id: format!("{}:{p}", s.station_id),
                    from: now - chrono::Duration::days(1),
                    to: now,
                })
            })
            .collect();
        let readings = reader.fetch_all(&requests).await.expect("fetch_all");
        let total: usize = readings.values().map(Vec::len).sum();
        println!(
            "ARSO: {} source_ids requested, {} with readings, {total} readings",
            requests.len(),
            readings.len()
        );
        assert!(!readings.is_empty());
        if let Some((id, series)) = readings.iter().next() {
            println!("sample reading {id}: {:?}", series.first());
        }
    }
}
