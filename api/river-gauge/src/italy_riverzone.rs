use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::{BoxFuture, FetchRequest, GaugeReader};

/// Reader for the Italian Riverzone (riverzone.eu) embedded HTML snapshot.
///
/// Source: https://riverzone.eu/
///
/// The Riverzone page embeds all station data as a single JSON blob in the
/// rendered HTML (`var data = {...};`). Each station entry contains up to one
/// day of 15-minute samples. The reader caches the parsed page for
/// [`CACHE_TTL_SECS`] seconds, matching the source's `refreshMins` interval.
///
/// `source_id` format: `"{station_uuid}:{unit}"`
///   e.g. `"8ec1e8c5-2922-4a7a-968c-579893429eb2:W"` (level, cm)
///        `"b378393b-193f-4316-bed3-4f960c8dd45c:Q"` (discharge, m3/s)
///
/// Supported units: `W` (water level, cm) and `Q` (discharge, m3/s).
///
/// Only Italian stations (those on the riverzone.eu Italian instance) are
/// covered by this reader. Non-Italian `rz.*` stations will return no data
/// until a dedicated reader for that country is implemented.
///
/// The station UUIDs are resolved during data import via `import_gauges.py`,
/// which name-matches each CSV row against the Riverzone station list.
pub struct ItalyRiverzoneReader {
    cache: Arc<Mutex<Option<SnapshotCache>>>,
}

const PAGE_URL: &str = "https://riverzone.eu/";
const CACHE_TTL_SECS: i64 = 900; // 15 minutes

struct SnapshotCache {
    fetched_at: DateTime<Utc>,
    stations: HashMap<String, StationReadings>,
}

struct StationReadings {
    /// Samples in centimetres.
    cm: Vec<(DateTime<Utc>, f64)>,
    /// Samples in cubic metres per second.
    m3s: Vec<(DateTime<Utc>, f64)>,
}

#[derive(Deserialize)]
struct PageData {
    stations: HashMap<String, RawStation>,
}

#[derive(Deserialize)]
struct RawStation {
    samples: HashMap<String, Vec<RawSample>>,
}

#[derive(Deserialize)]
struct RawSample {
    ts: i64,
    v: f64,
}

impl Default for ItalyRiverzoneReader {
    fn default() -> Self {
        Self {
            cache: Arc::new(Mutex::new(None)),
        }
    }
}

fn samples_to_ts(raw: &[RawSample]) -> Vec<(DateTime<Utc>, f64)> {
    raw.iter()
        .filter_map(|s| Utc.timestamp_opt(s.ts, 0).single().map(|dt| (dt, s.v)))
        .collect()
}

fn extract_json(html: &str) -> Option<&str> {
    // Locate `var data = {…};` in the page HTML.
    let needle = "var data = ";
    let start = html.find(needle)? + needle.len();
    // The JSON object ends at the semicolon on its own line.
    let tail = &html[start..];
    // Walk to the first `};` that closes the top-level object.
    let mut depth: usize = 0;
    let mut in_string = false;
    let mut escape = false;
    for (i, ch) in tail.char_indices() {
        if escape {
            escape = false;
            continue;
        }
        if in_string {
            if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&tail[..=i]);
                }
            }
            _ => {}
        }
    }
    None
}

impl ItalyRiverzoneReader {
    async fn get_snapshot(&self) -> anyhow::Result<HashMap<String, StationReadings>> {
        {
            let cache = self.cache.lock().await;
            if let Some(ref entry) = *cache {
                if (Utc::now() - entry.fetched_at).num_seconds() < CACHE_TTL_SECS {
                    return Ok(rebuild_map(&entry.stations));
                }
            }
        }

        let html = reqwest::get(PAGE_URL)
            .await
            .map_err(|e| anyhow::anyhow!("RiverzoneReader: HTTP error: {e}"))?
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("RiverzoneReader: failed to read body: {e}"))?;

        let json_str = extract_json(&html).ok_or_else(|| {
            anyhow::anyhow!("RiverzoneReader: could not find 'var data = ...' in page")
        })?;

        let page: PageData = serde_json::from_str(json_str)
            .map_err(|e| anyhow::anyhow!("RiverzoneReader: JSON parse error: {e}"))?;

        let mut stations: HashMap<String, StationReadings> = HashMap::new();
        for (uuid, raw) in page.stations {
            let cm = raw
                .samples
                .get("cm")
                .map(|s| samples_to_ts(s))
                .unwrap_or_default();
            let m3s = raw
                .samples
                .get("m3s")
                .map(|s| samples_to_ts(s))
                .unwrap_or_default();
            stations.insert(uuid, StationReadings { cm, m3s });
        }

        let mut cache = self.cache.lock().await;
        *cache = Some(SnapshotCache {
            fetched_at: Utc::now(),
            stations,
        });

        Ok(rebuild_map(&cache.as_ref().unwrap().stations))
    }
}

fn rebuild_map(src: &HashMap<String, StationReadings>) -> HashMap<String, StationReadings> {
    src.iter()
        .map(|(k, v)| {
            (
                k.clone(),
                StationReadings {
                    cm: v.cm.clone(),
                    m3s: v.m3s.clone(),
                },
            )
        })
        .collect()
}

impl GaugeReader for ItalyRiverzoneReader {
    fn provider_key(&self) -> &'static str {
        "rz"
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            // Parse all source_ids up front.
            // source_id format: "{station_uuid}:{unit}" where unit is W or Q
            let parsed: Vec<(&str, &str, &FetchRequest)> = requests
                .iter()
                .filter_map(|req| {
                    req.source_id.rsplit_once(':').map_or_else(
                        || {
                            tracing::warn!(
                                "RiverzoneReader: ignoring malformed source_id '{}' (expected '{{uuid}}:{{W|Q}}')",
                                req.source_id
                            );
                            None
                        },
                        |(uuid, unit)| Some((uuid, unit, req)),
                    )
                })
                .collect();

            if parsed.is_empty() {
                return Ok(HashMap::new());
            }

            let stations = match self.get_snapshot().await {
                Ok(s) => s,
                Err(err) => {
                    tracing::error!("RiverzoneReader: failed to fetch snapshot: {err}");
                    return Ok(HashMap::new());
                }
            };

            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

            for (uuid, unit, req) in &parsed {
                let Some(station) = stations.get(*uuid) else {
                    continue;
                };

                let samples: &Vec<(DateTime<Utc>, f64)> = match *unit {
                    "W" => &station.cm,
                    "Q" => &station.m3s,
                    other => {
                        tracing::warn!(
                            "RiverzoneReader: unknown unit '{}' in source_id '{}'",
                            other,
                            req.source_id
                        );
                        continue;
                    }
                };

                let readings: Vec<(DateTime<Utc>, f64)> = samples
                    .iter()
                    .filter(|(ts, _)| *ts > req.from && *ts <= req.to)
                    .copied()
                    .collect();

                if !readings.is_empty() {
                    results
                        .entry(req.source_id.clone())
                        .or_default()
                        .extend(readings);
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
    fn extract_json_finds_object() {
        let html = r#"<script>var data = {"stations":{"abc":{"samples":{"cm":[{"ts":1000,"v":50.0}]}}}}</script>"#;
        let json = extract_json(html).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json).unwrap();
        assert!(parsed.get("stations").is_some());
    }

    #[test]
    fn samples_to_ts_converts_unix_epoch() {
        let raw = vec![RawSample { ts: 0, v: 1.0 }, RawSample { ts: 86400, v: 2.0 }];
        let result = samples_to_ts(&raw);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].1, 1.0);
        assert_eq!(result[1].0 - result[0].0, chrono::Duration::seconds(86400));
    }
}
