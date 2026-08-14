use std::collections::HashMap;

use chrono::{DateTime, FixedOffset, NaiveDateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Greece's OpenHi.net national open hydro-information network
/// (Enhydris platform).
///
/// Source: https://system.openhi.net/api/ - no auth, no key. Data is
/// **CC-BY-SA 4.0** - attribute OpenHi.net / the station owner.
///
/// Endpoints used:
///   - `/api/stations/` (paginated, ~65 stations; `geom` is a
///     `"SRID=4326;POINT (lon lat)"` string)
///   - `/api/stations/{sid}/timeseriesgroups/` (variable 2 = discharge,
///     14 = stage, 5710 = water level)
///   - `/api/stations/{sid}/timeseriesgroups/{gid}/timeseries/`
///   - `.../timeseries/{tid}/data/?fmt=csv&start_date=...&end_date=...`
///     returning `timestamp,value,flags` CSV rows.
///
/// Cadence varies per station (15 min to 3 h); the API serves multi-year
/// history, so `history_depth` is one year. Stations whose `last_update`
/// is older than ~1 year (or missing) are **skipped by `list_stations`** so
/// dead stations don't pollute the catalog; timeseries groups named
/// "old ..." are skipped too.
///
/// Because fetching needs the group and timeseries ids, they are encoded in
/// the param portion: `source_id` format is
/// `"{station_id}:{W|Q}-{group_id}-{timeseries_id}"`,
/// e.g. `"1486:W-1226-10828"`. `W` = stage/water level, served in metres and
/// converted to **cm**; `Q` = discharge in **m³/s**.
///
/// CSV timestamps are naive local times in the station's fixed
/// `display_timezone` (`Etc/GMT` = UTC or `Etc/GMT-2` = UTC+2, no DST);
/// `fetch_all` resolves the offset via `/api/stations/{sid}/` per station.
#[derive(Default)]
pub struct GreeceOpenhiReader;

const BASE_URL: &str = "https://system.openhi.net/api";
/// Safety cap on pagination loops.
const MAX_PAGES: usize = 50;
/// Stations whose newest reading is older than this are considered dead.
const STALE_AFTER_DAYS: i64 = 366;

const VAR_DISCHARGE: i64 = 2;
const VAR_STAGE: i64 = 14;
const VAR_WATER_LEVEL: i64 = 5710;
/// Enhydris unit-of-measurement ids (from `/api/units/`).
const UNIT_METRE: i64 = 6;
const UNIT_M3_PER_S: i64 = 18;

const M_TO_CM: f64 = 100.0;

#[derive(Deserialize)]
struct Page<T> {
    next: Option<String>,
    #[serde(default = "Vec::new")]
    results: Vec<T>,
}

#[derive(Deserialize)]
struct ApiStation {
    id: i64,
    name: Option<String>,
    /// `"SRID=4326;POINT (20.975265 39.15104)"`.
    geom: Option<String>,
    /// Timestamp of the newest reading, e.g. `"2026-08-14T18:00:00Z"`.
    last_update: Option<String>,
    /// `"Etc/GMT"` or `"Etc/GMT-2"` (POSIX sign: GMT-2 means UTC+2).
    display_timezone: Option<String>,
}

#[derive(Deserialize)]
struct TsGroup {
    id: i64,
    /// Bare id here, but Enhydris can inline the variable as an object.
    variable: serde_json::Value,
    name: Option<String>,
    #[serde(default)]
    hidden: bool,
    unit_of_measurement: Option<i64>,
}

#[derive(Deserialize)]
struct TimeSeries {
    id: i64,
    publicly_available: Option<bool>,
}

/// Extract lon/lat from an EWKT point like `"SRID=4326;POINT (20.97 39.15)"`.
fn parse_point(geom: &str) -> Option<(f64, f64)> {
    let open = geom.find('(')?;
    let close = geom[open..].find(')')? + open;
    let mut nums = geom[open + 1..close].split_whitespace();
    let lon = nums.next()?.parse().ok()?;
    let lat = nums.next()?.parse().ok()?;
    Some((lon, lat))
}

/// Variable id from either a bare integer or an inlined `{"id": ...}` object.
fn variable_id(v: &serde_json::Value) -> Option<i64> {
    v.as_i64().or_else(|| v.get("id")?.as_i64())
}

/// UTC offset of a POSIX `Etc/GMT[+-]N` zone name (sign is inverted:
/// `Etc/GMT-2` is UTC+2). These zones have no DST, so a fixed offset is exact.
fn parse_etc_gmt_offset(tz: &str) -> Option<FixedOffset> {
    let rest = tz.strip_prefix("Etc/GMT")?;
    let hours: i32 = if rest.is_empty() { 0 } else { rest.parse().ok()? };
    FixedOffset::east_opt(-hours * 3600)
}

/// Parse one CSV data row (`"2026-08-14 17:00,0.13,MISSING3"`) into a UTC
/// timestamp and raw value. Rows with empty values return None.
fn parse_csv_row(line: &str, offset: FixedOffset) -> Option<(DateTime<Utc>, f64)> {
    let mut cols = line.split(',');
    let ts_raw = cols.next()?.trim();
    let value: f64 = cols.next()?.trim().parse().ok()?;
    let naive = NaiveDateTime::parse_from_str(ts_raw, "%Y-%m-%d %H:%M")
        .or_else(|_| NaiveDateTime::parse_from_str(ts_raw, "%Y-%m-%d %H:%M:%S"))
        .ok()?;
    // Fixed offsets are never ambiguous.
    let local = naive.and_local_timezone(offset).single()?;
    Some((local.with_timezone(&Utc), value))
}

/// Map a timeseries-group to our param kind, checking the advertised unit.
fn group_kind(group: &TsGroup) -> Option<&'static str> {
    let (kind, expected_unit) = match variable_id(&group.variable)? {
        VAR_DISCHARGE => ("Q", UNIT_M3_PER_S),
        VAR_STAGE | VAR_WATER_LEVEL => ("W", UNIT_METRE),
        _ => return None,
    };
    if group.unit_of_measurement != Some(expected_unit) {
        tracing::warn!(
            "GreeceOpenhiReader: group {} has unexpected unit id {:?}, skipping",
            group.id,
            group.unit_of_measurement
        );
        return None;
    }
    Some(kind)
}

async fn get_json<T: serde::de::DeserializeOwned>(url: &str) -> anyhow::Result<T> {
    reqwest::get(url)
        .await
        .map_err(|e| anyhow::anyhow!("HTTP error for {url}: {e}"))?
        .error_for_status()
        .map_err(|e| anyhow::anyhow!("server error for {url}: {e}"))?
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("JSON parse error for {url}: {e}"))
}

/// Collect every page of a paginated endpoint, following `next` links.
async fn get_all_pages<T: serde::de::DeserializeOwned>(url: String) -> anyhow::Result<Vec<T>> {
    let mut url = url;
    let mut out = Vec::new();
    for _ in 0..MAX_PAGES {
        let page: Page<T> = get_json(&url).await?;
        out.extend(page.results);
        match page.next {
            Some(next) if !next.is_empty() => url = next,
            _ => return Ok(out),
        }
    }
    tracing::warn!("GreeceOpenhiReader: pagination cap hit for {url}");
    Ok(out)
}

/// Pick the timeseries groups worth exposing for one station: relevant
/// variables only, not hidden, not "old ..." legacy series, and when both
/// "max" and "mean" stage aggregates exist, only the mean one.
fn select_groups(groups: &[TsGroup]) -> Vec<(&TsGroup, &'static str)> {
    let relevant: Vec<(&TsGroup, &'static str)> = groups
        .iter()
        .filter(|g| !g.hidden)
        .filter(|g| !g.name.as_deref().unwrap_or("").to_lowercase().contains("old"))
        .filter_map(|g| group_kind(g).map(|kind| (g, kind)))
        .collect();

    let has_mean = relevant.iter().any(|(g, kind)| {
        *kind == "W" && g.name.as_deref().unwrap_or("").to_lowercase().contains("mean")
    });
    relevant
        .into_iter()
        .filter(|(g, kind)| {
            !(has_mean
                && *kind == "W"
                && g.name.as_deref().unwrap_or("").to_lowercase().contains("max"))
        })
        .collect()
}

impl GaugeReader for GreeceOpenhiReader {
    fn provider_key(&self) -> &'static str {
        "openhi"
    }

    /// Enhydris serves multi-year history; a year is plenty for back-fill.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(365))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let stations: Vec<ApiStation> =
                get_all_pages(format!("{BASE_URL}/stations/")).await.map_err(|e| {
                    anyhow::anyhow!("GreeceOpenhiReader: failed to list stations: {e}")
                })?;

            let stale_cutoff = Utc::now() - chrono::Duration::days(STALE_AFTER_DAYS);
            let mut out = Vec::new();

            for station in stations {
                // Skip stations that stopped reporting (see module docs).
                let fresh = station
                    .last_update
                    .as_deref()
                    .and_then(|s| s.parse::<DateTime<Utc>>().ok())
                    .is_some_and(|ts| ts > stale_cutoff);
                if !fresh {
                    continue;
                }

                let groups: Vec<TsGroup> = match get_all_pages(format!(
                    "{BASE_URL}/stations/{}/timeseriesgroups/",
                    station.id
                ))
                .await
                {
                    Ok(g) => g,
                    Err(e) => {
                        tracing::warn!(
                            "GreeceOpenhiReader: failed to list groups for station {}: {e}",
                            station.id
                        );
                        continue;
                    }
                };

                let mut params = Vec::new();
                for (group, kind) in select_groups(&groups) {
                    let series: Vec<TimeSeries> = match get_all_pages(format!(
                        "{BASE_URL}/stations/{}/timeseriesgroups/{}/timeseries/",
                        station.id, group.id
                    ))
                    .await
                    {
                        Ok(s) => s,
                        Err(e) => {
                            tracing::warn!(
                                "GreeceOpenhiReader: failed to list timeseries for station {} group {}: {e}",
                                station.id,
                                group.id
                            );
                            continue;
                        }
                    };
                    let Some(ts) = series.iter().find(|t| t.publicly_available != Some(false))
                    else {
                        continue;
                    };
                    params.push(format!("{kind}-{}-{}", group.id, ts.id));
                }

                if params.is_empty() {
                    continue;
                }
                let (lon, lat) = match station.geom.as_deref().and_then(parse_point) {
                    Some((lon, lat)) => (Some(lon), Some(lat)),
                    None => (None, None),
                };
                out.push(StationInfo {
                    station_id: station.id.to_string(),
                    name: station.name.filter(|n| !n.trim().is_empty()),
                    river: None,
                    latitude: lat,
                    longitude: lon,
                    params,
                });
            }

            Ok(out)
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
            // Station id -> UTC offset (None = lookup failed, don't retry).
            let mut tz_cache: HashMap<String, Option<FixedOffset>> = HashMap::new();

            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!("GreeceOpenhiReader: malformed source_id '{}'", req.source_id);
                    continue;
                };
                // Param carries the routing ids: "{W|Q}-{group_id}-{ts_id}".
                let mut parts = param.splitn(3, '-');
                let (kind, gid, tid) = match (
                    parts.next(),
                    parts.next().and_then(|v| v.parse::<i64>().ok()),
                    parts.next().and_then(|v| v.parse::<i64>().ok()),
                ) {
                    (Some(kind @ ("W" | "Q")), Some(gid), Some(tid)) => (kind, gid, tid),
                    _ => {
                        tracing::warn!(
                            "GreeceOpenhiReader: malformed param in '{}' (expected 'W-gid-tid' / 'Q-gid-tid')",
                            req.source_id
                        );
                        continue;
                    }
                };
                let Ok(sid) = station_id.parse::<i64>() else {
                    tracing::warn!("GreeceOpenhiReader: non-numeric station id '{station_id}'");
                    continue;
                };

                // Resolve the station's fixed UTC offset (cached per batch).
                let offset = match tz_cache.get(station_id) {
                    Some(cached) => *cached,
                    None => {
                        let looked_up = match get_json::<ApiStation>(&format!(
                            "{BASE_URL}/stations/{sid}/"
                        ))
                        .await
                        {
                            Ok(s) => {
                                let tz = s.display_timezone.unwrap_or_default();
                                let offset = parse_etc_gmt_offset(&tz);
                                if offset.is_none() {
                                    tracing::warn!(
                                        "GreeceOpenhiReader: unsupported timezone '{tz}' for station {sid}"
                                    );
                                }
                                offset
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "GreeceOpenhiReader: failed to resolve timezone for station {sid}: {e}"
                                );
                                None
                            }
                        };
                        tz_cache.insert(station_id.to_owned(), looked_up);
                        looked_up
                    }
                };
                let Some(offset) = offset else {
                    continue;
                };

                // The API filters on naive local timestamps.
                let url = format!(
                    "{BASE_URL}/stations/{sid}/timeseriesgroups/{gid}/timeseries/{tid}/data/\
                     ?fmt=csv&start_date={}&end_date={}",
                    req.from.with_timezone(&offset).format("%Y-%m-%dT%H:%M:%S"),
                    req.to.with_timezone(&offset).format("%Y-%m-%dT%H:%M:%S"),
                );
                let body = match reqwest::get(&url).await {
                    Ok(r) if r.status().is_success() => match r.text().await {
                        Ok(t) => t,
                        Err(e) => {
                            tracing::warn!(
                                "GreeceOpenhiReader: read error for '{}': {e}",
                                req.source_id
                            );
                            continue;
                        }
                    },
                    Ok(r) => {
                        tracing::warn!(
                            "GreeceOpenhiReader: HTTP {} for '{}'",
                            r.status(),
                            req.source_id
                        );
                        continue;
                    }
                    Err(e) => {
                        tracing::warn!(
                            "GreeceOpenhiReader: request error for '{}': {e}",
                            req.source_id
                        );
                        continue;
                    }
                };

                let scale = if kind == "W" { M_TO_CM } else { 1.0 };
                let readings = results.entry(req.source_id.clone()).or_default();
                for line in body.lines() {
                    // Rows with empty values ("...,,") are skipped here.
                    let Some((ts, value)) = parse_csv_row(line, offset) else {
                        continue;
                    };
                    if ts <= req.from || ts > req.to {
                        continue;
                    }
                    readings.push((ts, value * scale));
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
    fn point_parses_lon_lat() {
        // Real sample from /api/stations/.
        let (lon, lat) = parse_point("SRID=4326;POINT (20.975265 39.15104)").unwrap();
        assert!((lon - 20.975265).abs() < 1e-9);
        assert!((lat - 39.15104).abs() < 1e-9);
        assert!(parse_point("not a point").is_none());
    }

    #[test]
    fn etc_gmt_offsets_use_posix_inverted_sign() {
        assert_eq!(
            parse_etc_gmt_offset("Etc/GMT-2"),
            FixedOffset::east_opt(2 * 3600)
        );
        assert_eq!(parse_etc_gmt_offset("Etc/GMT"), FixedOffset::east_opt(0));
        assert_eq!(
            parse_etc_gmt_offset("Etc/GMT+5"),
            FixedOffset::east_opt(-5 * 3600)
        );
        assert_eq!(parse_etc_gmt_offset("Europe/Athens"), None);
    }

    #[test]
    fn csv_row_converts_local_to_utc() {
        // Real sample: station 1486 is Etc/GMT-2, its 17:00 local row matched
        // a last_update of 15:00Z.
        let offset = FixedOffset::east_opt(2 * 3600).unwrap();
        let (ts, value) = parse_csv_row("2026-08-14 17:00,0.13,MISSING3", offset).unwrap();
        assert_eq!(ts, Utc.with_ymd_and_hms(2026, 8, 14, 15, 0, 0).unwrap());
        assert!((value - 0.13).abs() < 1e-9);
        // Empty-value rows and garbage are rejected.
        assert!(parse_csv_row("2026-08-12 00:00,,", offset).is_none());
        assert!(parse_csv_row("not,a,row", offset).is_none());
    }

    #[test]
    fn variable_id_handles_bare_and_object_forms() {
        assert_eq!(variable_id(&serde_json::json!(14)), Some(14));
        assert_eq!(variable_id(&serde_json::json!({"id": 2, "descr": "Discharge"})), Some(2));
        assert_eq!(variable_id(&serde_json::json!("x")), None);
    }

    #[test]
    fn source_id_param_routes_kind_group_and_timeseries() {
        let (station, param) = "1486:W-1226-10828".rsplit_once(':').unwrap();
        assert_eq!(station, "1486");
        let mut parts = param.splitn(3, '-');
        assert_eq!(parts.next(), Some("W"));
        assert_eq!(parts.next().unwrap().parse::<i64>().unwrap(), 1226);
        assert_eq!(parts.next().unwrap().parse::<i64>().unwrap(), 10828);
    }

    #[test]
    fn stage_metres_convert_to_cm() {
        assert!((0.13_f64 * M_TO_CM - 13.0).abs() < 1e-9);
    }

    #[test]
    fn mean_stage_preferred_over_max() {
        let groups: Vec<TsGroup> = serde_json::from_str(
            r#"[{"id":1225,"variable":14,"name":"Max stage","hidden":false,"unit_of_measurement":6},
                {"id":1226,"variable":14,"name":"Mean stage","hidden":false,"unit_of_measurement":6},
                {"id":498,"variable":2,"name":"Old (c2013) discharge","hidden":false,"unit_of_measurement":18},
                {"id":886,"variable":2,"name":"","hidden":false,"unit_of_measurement":18},
                {"id":521,"variable":1,"name":"Rainfall","hidden":false,"unit_of_measurement":9}]"#,
        )
        .unwrap();
        let selected: Vec<(i64, &str)> =
            select_groups(&groups).iter().map(|(g, k)| (g.id, *k)).collect();
        assert_eq!(selected, vec![(1226, "W"), (886, "Q")]);
    }
}
