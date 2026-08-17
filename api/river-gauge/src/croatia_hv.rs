use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, ReadingsBySource, SnapshotCache, StationInfo};

/// Reader for Croatia's national water-level network (Hrvatske vode).
///
/// Source: `POST https://vodostaji.voda.hr/Mapa/DohvatiPostajeZaMapu`
/// (empty body, no auth) - the JSON backend of the public vodostaji.voda.hr
/// map. One response carries the latest reading for all ~371 stations
/// (including a few upstream Slovenian `SLxxxx` stations on shared rivers),
/// updated roughly **hourly**. Latest values only - snapshot provider
/// (`history_depth` = `None`).
///
/// License: no explicit license; public feed operated by **Hrvatske vode**
/// (Croatian national water management agency) - attribute accordingly.
///
/// Each array element carries `Sifra` (station code), `Naziv`
/// ("River - Station"), `GeoLatitude`/`GeoLongitude` (WGS-84, as strings),
/// `ZadnjeOcitanjeVrijeme` (.NET `/Date(ms)/` epoch-millisecond timestamp,
/// already absolute UTC), `ZadnjeOcitanjeVrijednost` (water level, **cm**,
/// may be negative relative to gauge zero) and
/// `ProtokZadnjeOcitanjeVrijednost` (discharge, **m³/s**, ~40 stations).
///
/// `source_id` format: `"{Sifra}:{param}"`
///   e.g. `"3121:W"` (Sava @ Zagreb, water level cm)
///        `"SL3420:Q"` (Sava @ Radovljica, discharge m³/s)
///
/// `W` = vodostaj (water level, **cm**), `Q` = protok (discharge, **m³/s**).
///
/// The snapshot is cached for [`CACHE_TTL`] so one HTTP POST serves both
/// `list_stations` and `fetch_all` in a poll cycle.
#[derive(Default)]
pub struct CroatiaHvReader {
    cache: SnapshotCache<Vec<HvStation>>,
}

const SNAPSHOT_URL: &str = "https://vodostaji.voda.hr/Mapa/DohvatiPostajeZaMapu";
const CACHE_TTL: Duration = Duration::from_secs(300);

/// One station entry, matching the live response's field names.
#[derive(Debug, Clone, Deserialize)]
struct HvStation {
    /// Station code, e.g. "3121" (or "SL3420" for Slovenian stations).
    #[serde(rename = "Sifra")]
    sifra: String,
    /// "River - Station", e.g. "Sava - Zagreb".
    #[serde(rename = "Naziv", default)]
    naziv: Option<String>,
    /// WGS-84 latitude as a string, e.g. "45.784511".
    #[serde(rename = "GeoLatitude", default)]
    geo_latitude: Option<String>,
    /// WGS-84 longitude as a string, e.g. "15.953269".
    #[serde(rename = "GeoLongitude", default)]
    geo_longitude: Option<String>,
    /// Reading timestamp as .NET "/Date(1786723200000)/" (epoch ms), or null.
    #[serde(rename = "ZadnjeOcitanjeVrijeme", default)]
    zadnje_ocitanje_vrijeme: Option<String>,
    /// Latest water level in cm (integer in practice; may be negative).
    #[serde(rename = "ZadnjeOcitanjeVrijednost", default)]
    zadnje_ocitanje_vrijednost: Option<f64>,
    /// Latest discharge in m³/s, on the subset of stations that report it.
    #[serde(rename = "ProtokZadnjeOcitanjeVrijednost", default)]
    protok_zadnje_ocitanje_vrijednost: Option<f64>,
}

/// Parse a .NET JSON date `/Date(1786723200000)/` into UTC.
///
/// The number is epoch **milliseconds** and already absolute; a possible
/// `+HHMM`/`-HHMM` display-offset suffix is ignored.
fn parse_dotnet_date(s: &str) -> Option<DateTime<Utc>> {
    let inner = s.strip_prefix("/Date(")?.strip_suffix(")/")?;
    if inner.is_empty() {
        return None;
    }
    // Keep an optional leading '-' (pre-1970), stop at any offset suffix.
    let end = inner[1..]
        .find(['+', '-'])
        .map(|i| i + 1)
        .unwrap_or(inner.len());
    let ms: i64 = inner[..end].parse().ok()?;
    Utc.timestamp_millis_opt(ms).single()
}

/// Split "Sava - Zagreb" into (river, station name).
fn split_naziv(naziv: &str) -> (Option<String>, Option<String>) {
    match naziv.split_once(" - ") {
        Some((river, name)) => (
            Some(river.trim().to_owned()).filter(|s| !s.is_empty()),
            Some(name.trim().to_owned()).filter(|s| !s.is_empty()),
        ),
        None => (
            None,
            Some(naziv.trim().to_owned()).filter(|s| !s.is_empty()),
        ),
    }
}

impl CroatiaHvReader {
    async fn get_snapshot(&self) -> anyhow::Result<Vec<HvStation>> {
        let mut guard = self.cache.lock().await;

        if let Some((fetched_at, ref stations)) = *guard {
            if fetched_at.elapsed() < CACHE_TTL {
                return Ok(stations.clone());
            }
        }

        let stations: Vec<HvStation> = reqwest::Client::new()
            .post(SNAPSHOT_URL)
            // Empty body; the server rejects requests without an explicit
            // Content-Length header with "411 Length Required".
            .header(reqwest::header::CONTENT_LENGTH, "0")
            .body("")
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("CroatiaHvReader: HTTP error: {e}"))?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("CroatiaHvReader: server error: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("CroatiaHvReader: JSON parse error: {e}"))?;

        *guard = Some((Instant::now(), stations.clone()));
        Ok(stations)
    }
}

impl GaugeReader for CroatiaHvReader {
    fn provider_key(&self) -> &'static str {
        "hv"
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let snapshot = self.get_snapshot().await?;

            Ok(snapshot
                .into_iter()
                .filter_map(|s| {
                    let mut params = Vec::new();
                    if s.zadnje_ocitanje_vrijednost.is_some() {
                        params.push("W".to_owned());
                    }
                    if s.protok_zadnje_ocitanje_vrijednost.is_some() {
                        params.push("Q".to_owned());
                    }
                    // Stations currently reporting nothing cannot form a
                    // usable source_id.
                    if params.is_empty() {
                        return None;
                    }
                    let (river, name) = match s.naziv.as_deref() {
                        Some(naziv) => split_naziv(naziv),
                        None => (None, None),
                    };
                    Some(StationInfo {
                        station_id: s.sifra,
                        name,
                        river,
                        latitude: s.geo_latitude.and_then(|v| v.trim().parse().ok()),
                        longitude: s.geo_longitude.and_then(|v| v.trim().parse().ok()),
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
                    tracing::error!("CroatiaHvReader: failed to fetch snapshot: {err}");
                    return Ok(HashMap::new());
                }
            };
            let by_id: HashMap<&str, &HvStation> =
                snapshot.iter().map(|s| (s.sifra.as_str(), s)).collect();

            let mut results: ReadingsBySource = HashMap::new();

            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!("CroatiaHvReader: malformed source_id '{}'", req.source_id);
                    continue;
                };
                let Some(station) = by_id.get(station_id) else {
                    tracing::warn!("CroatiaHvReader: unknown station '{station_id}'");
                    continue;
                };
                let value = match param {
                    "W" => station.zadnje_ocitanje_vrijednost,
                    "Q" => station.protok_zadnje_ocitanje_vrijednost,
                    other => {
                        tracing::warn!(
                            "CroatiaHvReader: unknown param '{other}' for station {station_id}"
                        );
                        continue;
                    }
                };
                let ts = station
                    .zadnje_ocitanje_vrijeme
                    .as_deref()
                    .and_then(parse_dotnet_date);
                let (Some(ts), Some(value)) = (ts, value) else {
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

    /// Copied from the live response (2026-08-14): a level-only station, a
    /// station with discharge, and one that currently reports nothing.
    const SAMPLE_JSON: &str = r#"[
        {"PostajaID":5,"Sifra":"3121","Naziv":"Sava - Zagreb","GeoLatitude":"45.784511","GeoLongitude":"15.953269","ZadnjeOcitanjeVrijeme":"\/Date(1786723200000)\/","ZadnjeOcitanje":"14.08.2026. 18:00 h","ZadnjeOcitanjeVrijednost":-295,"ProtokZadnjeOcitanjeVrijednost":null,"Ikonica":"green.png"},
        {"PostajaID":96,"Sifra":"SL3420","Naziv":"Sava - Radovljica","GeoLatitude":"46.339673","GeoLongitude":"14.160676","ZadnjeOcitanjeVrijeme":"\/Date(1786721400000)\/","ZadnjeOcitanje":"14.08.2026. 17:30 h","ZadnjeOcitanjeVrijednost":46,"ProtokZadnjeOcitanjeVrijednost":15.3,"Ikonica":"green.png"},
        {"PostajaID":42,"Sifra":"9999","Naziv":"Testna - Postaja","GeoLatitude":"45.0","GeoLongitude":"16.0","ZadnjeOcitanjeVrijeme":null,"ZadnjeOcitanje":"","ZadnjeOcitanjeVrijednost":null,"ProtokZadnjeOcitanjeVrijednost":null,"Ikonica":"gray.png"}
    ]"#;

    #[test]
    fn deserialize_sample_stations() {
        let stations: Vec<HvStation> = serde_json::from_str(SAMPLE_JSON).expect("should parse");
        assert_eq!(stations.len(), 3);

        let zagreb = &stations[0];
        assert_eq!(zagreb.sifra, "3121");
        assert_eq!(zagreb.naziv.as_deref(), Some("Sava - Zagreb"));
        // Negative levels (below gauge zero) must survive.
        assert_eq!(zagreb.zadnje_ocitanje_vrijednost, Some(-295.0));
        assert_eq!(zagreb.protok_zadnje_ocitanje_vrijednost, None);

        let radovljica = &stations[1];
        assert_eq!(radovljica.sifra, "SL3420");
        assert_eq!(radovljica.zadnje_ocitanje_vrijednost, Some(46.0));
        assert!((radovljica.protok_zadnje_ocitanje_vrijednost.unwrap() - 15.3).abs() < 1e-9);

        let empty = &stations[2];
        assert_eq!(empty.zadnje_ocitanje_vrijeme, None);
        assert_eq!(empty.zadnje_ocitanje_vrijednost, None);
    }

    #[test]
    fn parse_dotnet_date_epoch_millis() {
        // 1786723200000 ms = 2026-08-14T16:00:00Z.
        let ts = parse_dotnet_date("/Date(1786723200000)/").expect("should parse");
        assert_eq!(
            ts.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-08-14T16:00:00Z"
        );
    }

    #[test]
    fn parse_dotnet_date_ignores_offset_suffix() {
        // Millis are absolute; a display offset must not shift the instant.
        let ts = parse_dotnet_date("/Date(1786723200000+0200)/").expect("should parse");
        assert_eq!(ts.timestamp(), 1786723200);
    }

    #[test]
    fn parse_dotnet_date_invalid_returns_none() {
        assert!(parse_dotnet_date("14.08.2026. 18:00 h").is_none());
        assert!(parse_dotnet_date("/Date()/").is_none());
        assert!(parse_dotnet_date("").is_none());
    }

    #[test]
    fn split_naziv_river_and_name() {
        assert_eq!(
            split_naziv("Sava - Drenje Brdovečko"),
            (Some("Sava".to_owned()), Some("Drenje Brdovečko".to_owned()))
        );
        assert_eq!(split_naziv("Jadro"), (None, Some("Jadro".to_owned())));
    }

    /// Live smoke test - hits the real Hrvatske vode endpoint. Run explicitly
    /// with `cargo test -p river-gauge croatia -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "live network access"]
    async fn live_smoke() {
        let reader = CroatiaHvReader::default();
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
            "HV: {} stations ({n_w} with W, {n_q} with Q)",
            stations.len()
        );
        assert!(stations.len() > 200, "expected >200 stations");
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
            "HV: {} source_ids requested, {} with readings, {total} readings",
            requests.len(),
            readings.len()
        );
        assert!(!readings.is_empty());
        if let Some((id, series)) = readings.iter().next() {
            println!("sample reading {id}: {:?}", series.first());
        }
    }
}
