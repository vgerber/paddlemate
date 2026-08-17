use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, Utc};
use chrono_tz::Europe::Sarajevo;
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Bosnia and Herzegovina's AVP Sava network (Agencija za vodno
/// područje rijeke Save, Sarajevo) via the static KISTERS/WISKI JSON files on
/// vodostaji.voda.ba.
///
/// Source: https://vodostaji.voda.ba/ - the live KiWIS API is not publicly
/// reachable (403), but the portal publishes pre-rendered JSON files:
///   - catalog: `/data/internet/stations/stations.json` (~230 stations)
///   - series:  `/data/internet/stations/{site_no}/{station_no}/{H|Q}/week.json`
///
/// Cadence: hourly values in a rolling ~1-week window (the files are
/// regenerated continuously by the WISKI export). No explicit open-data
/// license is published; data is provided publicly by AVP Sava - attribute
/// "Agencija za vodno područje rijeke Save, Sarajevo (vodostaji.voda.ba)".
///
/// `source_id` format: `"{site_no}/{station_no}:{param}"`, e.g. `"4/4130:W"`.
/// The station id needs both numbers because they form the file path; the
/// `:` separator stays reserved for the param suffix.
///
/// Params: `W` water level in **cm** (feed unit is already `cm`; `m`/`mm` are
/// converted defensively), `Q` discharge in **m³/s**. The catalog does not say
/// which params a station records, so `list_stations` advertises only `W`;
/// stations without a level series simply return empty data (the export
/// answers HTTP 200 with `"data": []` for missing series).
///
/// Timestamps carry a UTC offset (e.g. `2026-08-08T00:00:00.000+02:00`);
/// naive timestamps are interpreted as Europe/Sarajevo local time.
#[derive(Default)]
pub struct BosniaVodabaReader;

const BASE_URL: &str = "https://vodostaji.voda.ba/data/internet/stations";

#[derive(Deserialize)]
struct CatalogStation {
    site_no: String,
    station_no: String,
    station_name: Option<String>,
    /// Water body name, e.g. `"Dobrinja"`.
    #[serde(rename = "WTO_OBJECT")]
    wto_object: Option<String>,
    /// Basin name, e.g. `"Bosna"`; used when `WTO_OBJECT` is empty.
    catchment_name: Option<String>,
    /// WGS-84 latitude as a string, e.g. `"43.8514474"`.
    station_latitude: Option<String>,
    station_longitude: Option<String>,
}

/// One element of a `week.json` file (the file is an array with one series).
#[derive(Deserialize)]
struct WiskiSeries {
    /// Unit of the values, e.g. `"cm"` or `"m³/s"`.
    ts_unitsymbol: Option<String>,
    /// Rows shaped per the `columns` field, here `"Timestamp,Value"`:
    /// `[["2026-08-08T00:00:00.000+02:00", -4.7], ...]`.
    #[serde(default)]
    data: Vec<Vec<serde_json::Value>>,
}

/// Parse a WISKI timestamp. Offset-carrying ISO 8601 strings are used as-is;
/// naive strings are interpreted as Europe/Sarajevo local time.
fn parse_wiski_timestamp(raw: &str) -> Option<DateTime<Utc>> {
    if let Ok(ts) = DateTime::parse_from_rfc3339(raw) {
        return Some(ts.with_timezone(&Utc));
    }
    for fmt in [
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(raw, fmt) {
            return naive
                .and_local_timezone(Sarajevo)
                .single()
                .map(|t| t.with_timezone(&Utc));
        }
    }
    None
}

/// Parse one `[timestamp, value]` row; rows with null/absent values yield None.
fn parse_wiski_row(row: &[serde_json::Value]) -> Option<(DateTime<Utc>, f64)> {
    let ts = parse_wiski_timestamp(row.first()?.as_str()?)?;
    let value = row.get(1)?.as_f64()?;
    Some((ts, value))
}

/// Factor converting a level series to cm. WISKI serves `cm` here already.
fn level_to_cm_factor(unit: Option<&str>) -> f64 {
    match unit {
        Some("cm") | None => 1.0,
        Some("m") => 100.0,
        Some("mm") => 0.1,
        Some(other) => {
            tracing::warn!("BosniaVodabaReader: unexpected level unit '{other}', assuming cm");
            1.0
        }
    }
}

/// Factor converting a discharge series to m³/s.
fn discharge_factor(unit: Option<&str>) -> f64 {
    match unit {
        Some("m³/s") | Some("m3/s") | None => 1.0,
        Some("l/s") => 0.001,
        Some(other) => {
            tracing::warn!(
                "BosniaVodabaReader: unexpected discharge unit '{other}', assuming m³/s"
            );
            1.0
        }
    }
}

/// A station path component: digits, letters, or `-`/`_` (e.g. `"2101-B"`);
/// anything else is rejected so ids never escape the URL path.
fn valid_path_component(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn non_empty(s: Option<String>) -> Option<String> {
    s.filter(|v| !v.trim().is_empty())
}

impl GaugeReader for BosniaVodabaReader {
    fn provider_key(&self) -> &'static str {
        "vodaba"
    }

    /// `week.json` holds a rolling ~7-day window of hourly values.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::weeks(1))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let url = format!("{BASE_URL}/stations.json");
            let catalog: Vec<CatalogStation> = reqwest::get(&url)
                .await
                .map_err(|e| anyhow::anyhow!("BosniaVodabaReader: HTTP error: {e}"))?
                .error_for_status()
                .map_err(|e| anyhow::anyhow!("BosniaVodabaReader: server error: {e}"))?
                .json()
                .await
                .map_err(|e| anyhow::anyhow!("BosniaVodabaReader: JSON parse error: {e}"))?;

            Ok(catalog
                .into_iter()
                .filter(|s| valid_path_component(&s.site_no) && valid_path_component(&s.station_no))
                .map(|s| StationInfo {
                    station_id: format!("{}/{}", s.site_no, s.station_no),
                    name: non_empty(s.station_name),
                    river: non_empty(s.wto_object).or_else(|| non_empty(s.catchment_name)),
                    latitude: s.station_latitude.and_then(|v| v.parse().ok()),
                    longitude: s.station_longitude.and_then(|v| v.parse().ok()),
                    // The catalog does not advertise recorded parameters;
                    // default to water level (see module docs).
                    params: vec!["W".to_owned()],
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

            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!(
                        "BosniaVodabaReader: malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                };
                let path_param = match param {
                    "W" => "H",
                    "Q" => "Q",
                    _ => {
                        tracing::warn!("BosniaVodabaReader: unknown param in '{}'", req.source_id);
                        continue;
                    }
                };
                let Some((site_no, station_no)) = station_id.split_once('/') else {
                    tracing::warn!(
                        "BosniaVodabaReader: station id '{station_id}' missing site_no (expected 'site/station')"
                    );
                    continue;
                };
                if !valid_path_component(site_no) || !valid_path_component(station_no) {
                    tracing::warn!("BosniaVodabaReader: invalid station id '{station_id}'");
                    continue;
                }

                let url = format!("{BASE_URL}/{site_no}/{station_no}/{path_param}/week.json");
                let series: Vec<WiskiSeries> = match reqwest::get(&url).await {
                    Ok(r) if r.status().is_success() => match r.json().await {
                        Ok(s) => s,
                        Err(e) => {
                            tracing::warn!(
                                "BosniaVodabaReader: JSON parse error for {station_id}: {e}"
                            );
                            continue;
                        }
                    },
                    Ok(r) => {
                        tracing::warn!("BosniaVodabaReader: HTTP {} for {station_id}", r.status());
                        continue;
                    }
                    Err(e) => {
                        tracing::warn!("BosniaVodabaReader: request error for {station_id}: {e}");
                        continue;
                    }
                };

                let readings = results.entry(req.source_id.clone()).or_default();
                for s in &series {
                    let unit = s.ts_unitsymbol.as_deref();
                    let factor = match param {
                        "W" => level_to_cm_factor(unit),
                        _ => discharge_factor(unit),
                    };
                    for row in &s.data {
                        let Some((ts, value)) = parse_wiski_row(row) else {
                            continue; // null value or unparseable timestamp
                        };
                        if ts <= req.from || ts > req.to {
                            continue;
                        }
                        readings.push((ts, value * factor));
                    }
                }
                readings.sort_by_key(|(ts, _)| *ts);
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn timestamp_with_offset_converts_to_utc() {
        // Real sample from 4/4130/H/week.json.
        let ts = parse_wiski_timestamp("2026-08-08T05:00:00.000+02:00").unwrap();
        assert_eq!(ts, Utc.with_ymd_and_hms(2026, 8, 8, 3, 0, 0).unwrap());
    }

    #[test]
    fn naive_timestamp_is_sarajevo_local() {
        // Sarajevo is UTC+2 in August (CEST).
        let ts = parse_wiski_timestamp("2026-08-08T05:00:00").unwrap();
        assert_eq!(ts, Utc.with_ymd_and_hms(2026, 8, 8, 3, 0, 0).unwrap());
    }

    #[test]
    fn wiski_row_parses_real_sample() {
        let series: Vec<WiskiSeries> = serde_json::from_str(
            r#"[{"station_name":"HS Doglodi","station_no":"4130",
                 "stationparameter_name":"Vodostaj","ts_unitsymbol":"cm",
                 "rows": "2","columns":"Timestamp,Value",
                 "data": [["2026-08-08T00:00:00.000+02:00",-4.7],
                          ["2026-08-08T01:00:00.000+02:00",null]]}]"#,
        )
        .unwrap();
        assert_eq!(series.len(), 1);
        assert_eq!(series[0].ts_unitsymbol.as_deref(), Some("cm"));
        let parsed: Vec<_> = series[0]
            .data
            .iter()
            .filter_map(|r| parse_wiski_row(r))
            .collect();
        // Second row has a null value and is dropped.
        assert_eq!(parsed.len(), 1);
        assert!((parsed[0].1 - (-4.7)).abs() < 1e-9);
    }

    #[test]
    fn unit_factors_normalize_levels_to_cm() {
        assert_eq!(level_to_cm_factor(Some("cm")), 1.0);
        assert_eq!(level_to_cm_factor(Some("m")), 100.0);
        assert_eq!(level_to_cm_factor(Some("mm")), 0.1);
        assert_eq!(discharge_factor(Some("m³/s")), 1.0);
        assert_eq!(discharge_factor(Some("l/s")), 0.001);
    }

    #[test]
    fn station_id_split_keeps_param_suffix() {
        let (station, param) = "4/4130:W".rsplit_once(':').unwrap();
        assert_eq!(station, "4/4130");
        assert_eq!(param, "W");
        let (site, no) = station.split_once('/').unwrap();
        assert!(valid_path_component(site) && valid_path_component(no));
        assert!(valid_path_component("2101-B"));
        assert!(!valid_path_component("../etc"));
    }
}
