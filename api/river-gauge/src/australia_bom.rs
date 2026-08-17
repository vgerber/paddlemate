use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, ReadingsBySource, StationInfo};

/// Reader for the Australian Bureau of Meteorology's "Water Data Online"
/// archive via its public KiWIS (Kisters WISKI) REST API.
///
/// Source: http://www.bom.gov.au/waterdata/
/// API:    https://www.bom.gov.au/waterdata/services?service=kisters&type=queryServices
///
/// No auth, no key. Licensed **CC-BY 4.0 Australia** - attribute the Bureau
/// of Meteorology (data supplied to the Bureau by ~200 lead water agencies).
/// National coverage, Tasmania included.
///
/// NOTE: not real-time. The Bureau ingests agency data in a **daily batch**,
/// so the freshest reading is typically up to a day old; poll accordingly.
/// The archive itself is deep (years); we advertise 180 days.
///
/// `list_stations` issues one `getStationList` per parameter type ("Water
/// Course Level" / "Water Course Discharge") so only stations that actually
/// carry level/discharge series are listed (`river_name` exists as a field
/// but is empty across the dataset, so it is not requested). `fetch_all`
/// resolves station -> ts_id via batched `getTimeseriesList` calls and caches
/// the mapping for the lifetime of the reader; values are then pulled with
/// multi-`ts_id` `getTimeseriesValues` requests. Series are chosen per
/// station by QA rank, preferring continuous QA'd data
/// (`DMQaQc.Merged.AsStored.1`) over provisional `Received.*` series and
/// falling back to hourly/daily means.
///
/// bom.gov.au rejects some non-browser clients from datacenter IPs, so the
/// reqwest client pins a browser User-Agent.
///
/// `source_id` format: `"{station_no}:{param}"`
///   e.g. `"403213:W"` (water level; source unit m, converted to cm)
///        `"403213:Q"` (discharge; source unit "cumec" = m³/s as-is,
///                      Ml/d series are converted by ÷86.4)
pub struct AustraliaBomReader {
    client: reqwest::Client,
    /// `station_no` -> (`param` -> chosen series). Populated lazily by
    /// `fetch_all`; stations with no usable series get an empty inner map so
    /// they are not re-discovered on every poll.
    series_cache: tokio::sync::Mutex<HashMap<String, HashMap<String, BomSeries>>>,
}

#[derive(Clone)]
struct BomSeries {
    ts_id: String,
    /// Multiplier that converts the source unit into our unit (cm or m³/s).
    factor: f64,
}

impl Default for AustraliaBomReader {
    fn default() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent(BROWSER_UA)
                .timeout(std::time::Duration::from_secs(90))
                .build()
                .expect("reqwest client"),
            series_cache: Default::default(),
        }
    }
}

const BASE_URL: &str =
    "https://www.bom.gov.au/waterdata/services?service=kisters&type=queryServices&format=json";
/// bom.gov.au is picky about non-browser user agents from datacenter IPs.
const BROWSER_UA: &str = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
/// Stations per getTimeseriesList call / ts_ids per getTimeseriesValues call.
const CHUNK: usize = 100;

/// KiWIS parametertype for each of our own param keys.
fn kiwis_parametertype(param: &str) -> Option<&'static str> {
    match param {
        "W" => Some("Water Course Level"),
        "Q" => Some("Water Course Discharge"),
        _ => None,
    }
}

fn our_param(parametertype_name: &str) -> Option<&'static str> {
    match parametertype_name {
        "Water Course Level" => Some("W"),
        "Water Course Discharge" => Some("Q"),
        _ => None,
    }
}

/// Multiplier that converts a BoM unit into our unit (cm / m³/s), or `None`
/// for units we do not understand (that series is then not selected).
fn unit_factor(param: &str, unit: &str) -> Option<f64> {
    let u = unit.trim().to_ascii_lowercase();
    match param {
        "W" => match u.as_str() {
            "m" | "metre" | "metres" => Some(100.0),
            "cm" => Some(1.0),
            "mm" => Some(0.1),
            _ => None,
        },
        "Q" => match u.as_str() {
            "cumec" | "cumecs" | "m3/s" | "m3/sec" | "m\u{b3}/s" => Some(1.0),
            // Megalitres/day: 1000 m³ per 86400 s.
            "ml/d" | "ml/day" => Some(1000.0 / 86400.0),
            "l/s" | "l/sec" => Some(0.001),
            _ => None,
        },
        _ => None,
    }
}

/// Rank of a KiWIS `ts_name`, lower = better. `None` = never use (daily
/// max/min, monthly aggregates, ...). Continuous QA'd series first, then
/// provisional continuous, then hourly and daily means.
fn series_rank(ts_name: &str) -> Option<usize> {
    const PREFERRED: &[&str] = &[
        "DMQaQc.Merged.AsStored.1",
        "Harmonised.Validated.AsStored.1",
        "Harmonised.Combined.AsStored.1",
        "CombinedProv.Merged.AsStored.1",
        "Received.Provisionalbest.AsStored.1",
        "Received.Provisional.AsStored.1",
    ];
    if let Some(pos) = PREFERRED.iter().position(|p| *p == ts_name) {
        return Some(pos);
    }
    if ts_name.contains("AsStored") {
        Some(PREFERRED.len())
    } else if ts_name.contains("Hourly") {
        Some(PREFERRED.len() + 1)
    } else if ts_name.contains("DailyMean") {
        Some(PREFERRED.len() + 2)
    } else {
        None
    }
}

/// KiWIS JSON list responses: an array of rows, first row = column names.
type KiwisTable = Vec<Vec<Option<String>>>;

/// Position of each `wanted` column in the header row.
fn header_indices(table: &KiwisTable, wanted: &[&str]) -> Option<Vec<usize>> {
    let header = table.first()?;
    wanted
        .iter()
        .map(|w| header.iter().position(|c| c.as_deref() == Some(*w)))
        .collect()
}

/// Non-empty trimmed cell content.
fn cell(row: &[Option<String>], idx: usize) -> Option<&str> {
    row.get(idx)?
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

impl AustraliaBomReader {
    async fn get_table(&self, url: &str) -> anyhow::Result<KiwisTable> {
        self.client
            .get(url)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("AustraliaBomReader: HTTP error: {e}"))?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("AustraliaBomReader: server error: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("AustraliaBomReader: JSON parse error: {e}"))
    }

    /// Make sure the series cache holds an entry for every station in
    /// `stations` (batched getTimeseriesList discovery for the missing ones).
    async fn discover_series(
        &self,
        cache: &mut HashMap<String, HashMap<String, BomSeries>>,
        stations: &[&str],
    ) {
        let mut missing: Vec<&str> = stations
            .iter()
            .copied()
            .filter(|s| !cache.contains_key(*s))
            .collect();
        missing.sort_unstable();
        missing.dedup();

        for chunk in missing.chunks(CHUNK) {
            let url = format!(
                "{BASE_URL}&request=getTimeseriesList&station_no={}\
                 &returnfields=station_no,ts_id,ts_name,parametertype_name,ts_unitsymbol",
                chunk.join(",")
            );
            let table = match self.get_table(&url).await {
                Ok(t) => t,
                Err(e) => {
                    tracing::warn!("AustraliaBomReader: getTimeseriesList failed: {e}");
                    continue;
                }
            };
            // Mark every asked-for station as discovered, found or not.
            for station in chunk {
                cache.entry((*station).to_owned()).or_default();
            }
            let Some(idx) = header_indices(
                &table,
                &[
                    "station_no",
                    "ts_id",
                    "ts_name",
                    "parametertype_name",
                    "ts_unitsymbol",
                ],
            ) else {
                tracing::warn!("AustraliaBomReader: unexpected getTimeseriesList header");
                continue;
            };

            // Best (rank, series) per (station, param).
            let mut best: HashMap<(String, &'static str), (usize, BomSeries)> = HashMap::new();
            for row in table.iter().skip(1) {
                let (Some(station), Some(ts_id), Some(ts_name), Some(pt)) = (
                    cell(row, idx[0]),
                    cell(row, idx[1]),
                    cell(row, idx[2]),
                    cell(row, idx[3]),
                ) else {
                    continue;
                };
                let Some(param) = our_param(pt) else { continue };
                let Some(rank) = series_rank(ts_name) else {
                    continue;
                };
                let Some(factor) = cell(row, idx[4]).and_then(|u| unit_factor(param, u)) else {
                    continue;
                };
                let series = BomSeries {
                    ts_id: ts_id.to_owned(),
                    factor,
                };
                match best.entry((station.to_owned(), param)) {
                    std::collections::hash_map::Entry::Occupied(mut e) => {
                        if rank < e.get().0 {
                            e.insert((rank, series));
                        }
                    }
                    std::collections::hash_map::Entry::Vacant(e) => {
                        e.insert((rank, series));
                    }
                }
            }
            for ((station, param), (_, series)) in best {
                cache
                    .entry(station)
                    .or_default()
                    .insert(param.to_owned(), series);
            }
        }
    }
}

#[derive(Deserialize)]
struct ValuesBlock {
    ts_id: Option<String>,
    #[serde(default)]
    data: Vec<(String, Option<f64>)>,
}

impl GaugeReader for AustraliaBomReader {
    fn provider_key(&self) -> &'static str {
        "bom"
    }

    /// The archive reaches back years; 180 days is plenty given the poller
    /// caps catch-ups anyway.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(180))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            struct Accum {
                name: Option<String>,
                lat: Option<f64>,
                lon: Option<f64>,
                params: Vec<String>,
            }
            let mut stations: HashMap<String, Accum> = HashMap::new();

            for param in ["W", "Q"] {
                let pt = kiwis_parametertype(param).expect("known param");
                let url = format!(
                    "{BASE_URL}&request=getStationList&parametertype_name={}\
                     &returnfields=station_no,station_name,station_latitude,station_longitude",
                    pt.replace(' ', "%20")
                );
                let table = self.get_table(&url).await?;
                let Some(idx) = header_indices(
                    &table,
                    &[
                        "station_no",
                        "station_name",
                        "station_latitude",
                        "station_longitude",
                    ],
                ) else {
                    anyhow::bail!("AustraliaBomReader: unexpected getStationList header");
                };
                for row in table.iter().skip(1) {
                    let Some(station_no) = cell(row, idx[0]) else {
                        continue;
                    };
                    let entry = stations
                        .entry(station_no.to_owned())
                        .or_insert_with(|| Accum {
                            name: cell(row, idx[1]).map(str::to_owned),
                            lat: cell(row, idx[2]).and_then(|v| v.parse().ok()),
                            lon: cell(row, idx[3]).and_then(|v| v.parse().ok()),
                            params: Vec::new(),
                        });
                    if !entry.params.iter().any(|p| p == param) {
                        entry.params.push(param.to_owned());
                    }
                }
            }

            Ok(stations
                .into_iter()
                .map(|(station_id, a)| StationInfo {
                    station_id,
                    name: a.name,
                    river: None, // river_name exists in the API but is empty everywhere
                    latitude: a.lat,
                    longitude: a.lon,
                    params: a.params,
                })
                .collect())
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<ReadingsBySource>> {
        Box::pin(async move {
            let mut results: ReadingsBySource = HashMap::new();

            let mut wanted: Vec<(&FetchRequest, &str, &str)> = Vec::new();
            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!(
                        "AustraliaBomReader: malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                };
                if kiwis_parametertype(param).is_none() {
                    tracing::warn!("AustraliaBomReader: unknown param in '{}'", req.source_id);
                    continue;
                }
                wanted.push((req, station_id, param));
            }
            if wanted.is_empty() {
                return Ok(results);
            }

            let mut cache = self.series_cache.lock().await;
            let stations: Vec<&str> = wanted.iter().map(|(_, s, _)| *s).collect();
            self.discover_series(&mut cache, &stations).await;

            // ts_id -> (request, factor).
            let mut by_ts_id: HashMap<String, (&FetchRequest, f64)> = HashMap::new();
            for (req, station_id, param) in &wanted {
                match cache.get(*station_id).and_then(|m| m.get(*param)) {
                    Some(series) => {
                        by_ts_id.insert(series.ts_id.clone(), (req, series.factor));
                    }
                    None => tracing::warn!(
                        "AustraliaBomReader: no usable series for '{}'",
                        req.source_id
                    ),
                }
            }
            drop(cache);

            let now = Utc::now();
            let from = requests.iter().map(|r| r.from).min().unwrap_or(now);
            let to = requests.iter().map(|r| r.to).max().unwrap_or(now);
            let ts_ids: Vec<&str> = by_ts_id.keys().map(String::as_str).collect();

            for chunk in ts_ids.chunks(CHUNK) {
                let url = format!(
                    "{BASE_URL}&request=getTimeseriesValues&ts_id={}\
                     &returnfields=Timestamp,Value&from={}&to={}",
                    chunk.join(","),
                    from.format("%Y-%m-%dT%H:%M:%SZ"),
                    to.format("%Y-%m-%dT%H:%M:%SZ"),
                );
                let blocks: Vec<ValuesBlock> = match self.client.get(&url).send().await {
                    Ok(r) if r.status().is_success() => match r.json().await {
                        Ok(v) => v,
                        Err(e) => {
                            tracing::warn!("AustraliaBomReader: values JSON parse error: {e}");
                            continue;
                        }
                    },
                    Ok(r) => {
                        tracing::warn!("AustraliaBomReader: values HTTP {}", r.status());
                        continue;
                    }
                    Err(e) => {
                        tracing::warn!("AustraliaBomReader: values request error: {e}");
                        continue;
                    }
                };

                for block in blocks {
                    let Some((req, factor)) =
                        block.ts_id.as_deref().and_then(|id| by_ts_id.get(id))
                    else {
                        continue;
                    };
                    let series = results.entry(req.source_id.clone()).or_default();
                    for (ts_str, value) in block.data {
                        // Gap markers come through as null values.
                        let Some(value) = value else { continue };
                        let Ok(ts) = DateTime::parse_from_rfc3339(&ts_str) else {
                            continue;
                        };
                        let ts = ts.with_timezone(&Utc);
                        if ts <= req.from || ts > req.to {
                            continue;
                        }
                        series.push((ts, value * factor));
                    }
                    series.sort_by_key(|(ts, _)| *ts);
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_indices_finds_columns_in_any_order() {
        // Trimmed real getStationList response shape.
        let table: KiwisTable = serde_json::from_str(
            r#"[["station_no","station_name","station_latitude","station_longitude"],
                ["403213","15 MILE @ GRETA STH","-36.61945775","146.2440721"],
                ["913010A","16 Mile Waterhole","-18.876921","139.360487"]]"#,
        )
        .unwrap();
        let idx = header_indices(&table, &["station_latitude", "station_no"]).unwrap();
        assert_eq!(idx, vec![2, 0]);
        assert_eq!(cell(&table[1], idx[1]), Some("403213"));
        assert_eq!(header_indices(&table, &["nope"]), None);

        let lat: f64 = cell(&table[2], idx[0]).unwrap().parse().unwrap();
        assert!((lat + 18.876921).abs() < 1e-9);
    }

    #[test]
    fn series_rank_prefers_qa_continuous_over_provisional_and_daily() {
        // Real ts_names from station 403213.
        let merged = series_rank("DMQaQc.Merged.AsStored.1").unwrap();
        let provisional = series_rank("Received.Provisional.AsStored.1").unwrap();
        let hourly = series_rank("PR01QaQc.Merged.HourlyMean.HR").unwrap();
        let daily = series_rank("DMQaQc.Merged.DailyMean.09HR").unwrap();
        assert!(merged < provisional);
        assert!(provisional < hourly);
        assert!(hourly < daily);
        // Aggregates we never want.
        assert_eq!(series_rank("DMQaQc.Merged.DailyMax.24HR"), None);
        assert_eq!(series_rank("DMQaQc.Merged.MonthlyMean.CalMonth"), None);
    }

    #[test]
    fn unit_factor_converts_level_and_discharge() {
        // Level metres -> cm.
        assert!((1.132 * unit_factor("W", "m").unwrap() - 113.2).abs() < 1e-9);
        // Discharge cumec (the usual BoM unit) passes through.
        assert_eq!(unit_factor("Q", "cumec"), Some(1.0));
        // Megalitres/day -> m³/s (86.4 Ml/d = 1 m³/s).
        assert!((86.4 * unit_factor("Q", "Ml/d").unwrap() - 1.0).abs() < 1e-9);
        assert_eq!(unit_factor("Q", "bogus"), None);
        assert_eq!(unit_factor("W", "ft"), None);
    }

    #[tokio::test]
    #[ignore = "live network access"]
    async fn live_smoke() {
        let reader = AustraliaBomReader::default();
        let stations = reader.list_stations().await.unwrap();
        println!("BOM stations: {}", stations.len());
        let both = stations.iter().filter(|s| s.params.len() == 2).count();
        println!("with W+Q: {both}");
        let sample = stations.iter().find(|s| s.station_id == "403213").unwrap();
        println!("sample: {sample:?}");
        let reqs = vec![
            FetchRequest {
                source_id: "403213:W".into(),
                from: Utc::now() - chrono::Duration::days(3),
                to: Utc::now(),
            },
            FetchRequest {
                source_id: "403213:Q".into(),
                from: Utc::now() - chrono::Duration::days(3),
                to: Utc::now(),
            },
        ];
        let res = reader.fetch_all(&reqs).await.unwrap();
        for (k, v) in &res {
            println!(
                "{k}: {} readings, first={:?} last={:?}",
                v.len(),
                v.first(),
                v.last()
            );
        }
        // Second fetch should reuse the cache.
        let res2 = reader.fetch_all(&reqs).await.unwrap();
        println!("second fetch keys: {}", res2.len());
    }

    #[test]
    fn values_block_tolerates_null_gap_rows() {
        // Real getTimeseriesValues tail: BoM appends a null gap marker.
        let blocks: Vec<ValuesBlock> = serde_json::from_str(
            r#"[{"ts_id":"254268010","rows":"3","columns":"Timestamp,Value",
                 "data":[["2026-08-13T09:45:00.000+10:00",1.725],
                         ["2026-08-13T10:00:00.000+10:00",1.72],
                         ["2026-08-13T10:00:01.000+10:00",null]]}]"#,
        )
        .unwrap();
        assert_eq!(blocks[0].ts_id.as_deref(), Some("254268010"));
        assert_eq!(blocks[0].data.len(), 3);
        assert_eq!(blocks[0].data[2].1, None);
        let ts = DateTime::parse_from_rfc3339(&blocks[0].data[0].0).unwrap();
        assert_eq!(
            ts.with_timezone(&Utc).to_rfc3339(),
            "2026-08-12T23:45:00+00:00"
        );
    }
}
