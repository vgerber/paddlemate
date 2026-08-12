use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Berlin;
use tokio::sync::Mutex;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// One station's latest line from the snapshot: when it was measured, the water
/// level in cm and the discharge in m3/s. Either value can be absent.
type Snapshot = HashMap<String, (DateTime<Utc>, Option<f64>, Option<f64>)>;

/// Reader for Baden-Wuerttemberg hydrological data (HVZ Baden-Wuerttemberg).
///
/// Source: https://www.hvz.baden-wuerttemberg.de/
///
/// The site has no REST API. Current readings are embedded as a JavaScript
/// snapshot in `hvz_peg_stmn.js`, updated roughly every 15-30 minutes.
/// Each entry has the format:
///   `['NNNNN', name, river, FG, W_val, W_dim, W_datetime, Q_val, Q_dim, Q_datetime, ...]`
///
/// where `NNNNN` is the zero-padded 5-digit station number.
///
/// `source_id` format: `"{zero_padded_4digit_id}:{param}"`
///   e.g. `"0001:W"` (water level, cm)
///        `"0001:Q"` (discharge, m3/s)
///
/// `W` = Wasserstand (water level, cm)
/// `Q` = Abfluss (discharge, m3/s)
///
/// Only the most recent reading is returned. The value is included only when
/// its timestamp falls within the requested window.
pub struct GermanyBadenWuerttembergReader {
    cache: Mutex<Option<(std::time::Instant, Snapshot)>>,
}

const SNAPSHOT_URL: &str = "https://www.hvz.baden-wuerttemberg.de/js/hvz_peg_stmn.js";
/// Re-fetch the snapshot at most this often.
const CACHE_TTL_SECS: u64 = 900;

impl Default for GermanyBadenWuerttembergReader {
    fn default() -> Self {
        Self {
            cache: Mutex::new(None),
        }
    }
}

/// Parse `"DD.MM.YYYY HH:MM MESZ"` or `"DD.MM.YYYY HH:MM MEZ"` to UTC.
fn parse_bw_timestamp(s: &str) -> Option<DateTime<Utc>> {
    // Strip the timezone suffix and parse as Berlin local time (CET/CEST).
    let without_tz = s
        .trim()
        .trim_end_matches("MESZ")
        .trim_end_matches("MEZ")
        .trim();
    let naive = NaiveDateTime::parse_from_str(without_tz, "%d.%m.%Y %H:%M").ok()?;
    Berlin
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.with_timezone(&Utc))
}

/// Parse the JS snapshot into `station_5digit -> (timestamp, W_cm, Q_m3s)`.
fn parse_snapshot(js: &str) -> Snapshot {
    let mut map = HashMap::new();

    // Each station line contains: ['NNNNN','name','river',FG,'W','dim','W_ts','Q','dim','Q_ts',...]
    for segment in js.split("['") {
        // Station ID is exactly 5 digits.
        let id_end = segment.find('\'');
        let id: &str = match id_end {
            Some(5) => &segment[..5],
            _ => continue,
        };
        if !id.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }

        let rest = &segment[6..]; // skip "'," after the 5-digit id
        // Split all single-quote-delimited tokens in the rest of the line.
        // After skipping the leading "'," the positions are:
        //   0: ','  (sep before name)
        //   1: name
        //   2: ','
        //   3: river
        //   4: ',FG,'
        //   5: W_val
        //   6: ','
        //   7: W_dim
        //   8: ','
        //   9: W_ts
        //   10: ','
        //   11: Q_val
        let tokens: Vec<&str> = rest.split('\'').collect();
        if tokens.len() < 16 {
            continue;
        }

        let w_ts_str = tokens[9];
        let Some(ts) = parse_bw_timestamp(w_ts_str) else {
            continue;
        };

        let w_val: Option<f64> = parse_bw_value(tokens[5]);
        let q_val: Option<f64> = if tokens.len() > 11 {
            parse_bw_value(tokens[11])
        } else {
            None
        };

        map.insert(id.to_string(), (ts, w_val, q_val));
    }

    map
}

fn parse_bw_value(s: &str) -> Option<f64> {
    let s = s.trim();
    if s == "--" || s.is_empty() {
        return None;
    }
    s.replace(',', ".").parse().ok()
}

/// Scan the numeric fields of a station row for the WGS84 longitude/latitude
/// pair. Each row carries several coordinate systems (Gauss-Krueger, UTM,
/// WGS84); we pick the first adjacent pair that falls inside the geographic
/// bounds of Baden-Wuerttemberg and its neighbours. Rows without valid
/// coordinates (some carry placeholder values) yield None.
fn extract_coords(tokens: &[&str]) -> (Option<f64>, Option<f64>) {
    for tok in tokens {
        let nums: Vec<Option<f64>> = tok
            .split(',')
            .map(|p| p.trim().parse::<f64>().ok())
            .collect();
        for pair in nums.windows(2) {
            if let (Some(lon), Some(lat)) = (pair[0], pair[1]) {
                if (5.5..11.0).contains(&lon) && (45.0..52.0).contains(&lat) {
                    return (Some(lat), Some(lon));
                }
            }
        }
    }
    (None, None)
}

/// Parse the JS snapshot into the full station catalog.
///
/// Reuses the same row layout as `parse_snapshot`:
///   `['NNNNN','name','river',FG,'W','W_dim','W_ts','Q','Q_dim','Q_ts',...,coords,...]`
///
/// A station is included only when it exposes a water level (non-empty W_dim,
/// e.g. `cm`/`m`/`muM`) or a discharge (non-empty Q_dim, e.g. `m3/s`). The
/// 5-digit snapshot id maps to the 4-digit `station_id` used in `source_id`
/// by stripping its leading zero, matching the `fetch_all` lookup convention.
fn parse_station_catalog(js: &str) -> Vec<StationInfo> {
    let mut stations = Vec::new();

    for segment in js.split("['") {
        let id: &str = match segment.find('\'') {
            Some(5) => &segment[..5],
            _ => continue,
        };
        if !id.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        // All snapshot ids are 5 digits with a leading zero; the fetch path
        // reconstructs the snapshot key as "0{station_id}", so strip one zero.
        let Some(local_id) = id.strip_prefix('0') else {
            continue;
        };

        let rest = &segment[6..]; // skip the closing quote after the 5-digit id
        let tokens: Vec<&str> = rest.split('\'').collect();
        if tokens.len() < 14 {
            continue;
        }

        // token[7] = water level dimension, token[13] = discharge dimension.
        let has_w = !tokens[7].trim().is_empty();
        let has_q = !tokens[13].trim().is_empty();
        if !has_w && !has_q {
            continue;
        }

        let mut params = Vec::new();
        if has_w {
            params.push("W".to_owned());
        }
        if has_q {
            params.push("Q".to_owned());
        }

        let to_opt = |s: &str| {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_owned())
            }
        };

        let (latitude, longitude) = extract_coords(&tokens);

        stations.push(StationInfo {
            station_id: local_id.to_owned(),
            name: to_opt(tokens[1]),
            river: to_opt(tokens[3]),
            latitude,
            longitude,
            params,
        });
    }

    stations
}

impl GermanyBadenWuerttembergReader {
    async fn get_snapshot(
        &self,
    ) -> anyhow::Result<HashMap<String, (DateTime<Utc>, Option<f64>, Option<f64>)>> {
        let mut cache = self.cache.lock().await;
        if let Some((fetched_at, data)) = cache.as_ref() {
            if fetched_at.elapsed().as_secs() < CACHE_TTL_SECS {
                return Ok(data.clone());
            }
        }

        let js = reqwest::get(SNAPSHOT_URL)
            .await
            .map_err(|e| anyhow::anyhow!("GermanyBadenWuerttembergReader: HTTP error fetching snapshot: {e}"))?
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("GermanyBadenWuerttembergReader: failed to read snapshot body: {e}"))?;

        let data = parse_snapshot(&js);
        *cache = Some((std::time::Instant::now(), data.clone()));
        Ok(data)
    }
}

impl GaugeReader for GermanyBadenWuerttembergReader {
    fn provider_key(&self) -> &'static str {
        "bw"
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async move {
            // Discover the whole Baden-Wuerttemberg catalog live from the same
            // snapshot the readings path consumes, keeping every station that
            // exposes a water level or a discharge.
            let js = reqwest::get(SNAPSHOT_URL)
                .await
                .map_err(|e| anyhow::anyhow!("GermanyBadenWuerttembergReader: HTTP error fetching snapshot: {e}"))?
                .text()
                .await
                .map_err(|e| anyhow::anyhow!("GermanyBadenWuerttembergReader: failed to read snapshot body: {e}"))?;

            Ok(parse_station_catalog(&js))
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            let snapshot = self.get_snapshot().await?;
            let mut results = HashMap::new();

            for req in requests {
                let parts: Vec<&str> = req.source_id.splitn(2, ':').collect();
                if parts.len() != 2 {
                    tracing::warn!("GermanyBadenWuerttembergReader: malformed source_id '{}'", req.source_id);
                    continue;
                }
                let (local_id, param) = (parts[0], parts[1]);
                // CSV has 4-digit IDs (e.g. "0001"), JS has 5-digit ("00001").
                let station_key = format!("0{local_id}");

                let Some((ts, w_opt, q_opt)) = snapshot.get(&station_key) else {
                    continue;
                };

                if *ts < req.from || *ts > req.to {
                    continue;
                }

                let value = match param {
                    "W" => *w_opt,
                    "Q" => *q_opt,
                    other => {
                        tracing::warn!("GermanyBadenWuerttembergReader: unknown param '{other}'");
                        continue;
                    }
                };

                if let Some(v) = value {
                    results.insert(req.source_id.clone(), vec![(*ts, v)]);
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
    fn parse_bw_timestamp_mesz() {
        // 14.05.2026 09:30 MESZ (CEST = UTC+2) -> 07:30 UTC
        let ts = parse_bw_timestamp("14.05.2026 09:30 MESZ").unwrap();
        assert_eq!(
            ts.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-05-14T07:30:00Z"
        );
    }

    #[test]
    fn parse_bw_timestamp_mez() {
        // 14.01.2026 09:30 MEZ (CET = UTC+1) -> 08:30 UTC
        let ts = parse_bw_timestamp("14.01.2026 09:30 MEZ").unwrap();
        assert_eq!(
            ts.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-01-14T08:30:00Z"
        );
    }

    #[test]
    fn parse_snapshot_extracts_stations() {
        let js = r#"// header
['00001','Eberfingen','Wutach',3,'15','cm','14.05.2026 09:30 MESZ','--','','--',0,'X'],
['00300','Gutach','Elz',3,'49','cm','14.05.2026 09:30 MESZ','4.69','m\u00b3/s','14.05.2026 09:30 MESZ',0,'Y'],
"#;
        let snap = parse_snapshot(js);
        let (ts1, w1, q1) = snap.get("00001").unwrap();
        assert_eq!(w1, &Some(15.0));
        assert_eq!(q1, &None);
        assert_eq!(ts1.format("%H:%M").to_string(), "07:30");

        let (_, w2, q2) = snap.get("00300").unwrap();
        assert_eq!(w2, &Some(49.0));
        assert_eq!(q2, &Some(4.69));
    }

    #[test]
    fn parse_station_catalog_maps_params_and_ids() {
        let js = r#"// header
['00001','Eberfingen','Wutach',3,'15','cm','14.05.2026 09:30 MESZ','--','','--',0,'loc',1,1,0,0,0,0,3477315.045,5461690.674,8.4311,47.7207,0,0],
['00300','Gutach','Elz',3,'49','cm','14.05.2026 09:30 MESZ','4.69','m³/s','14.05.2026 09:30 MESZ',0,'loc',1,1,0,0,0,0,3477315.045,5461690.674,7.9888,48.1191,0,0],
['00999','Rainfall-Only','Somewhere',3,'--','','--','--','','--',0,'loc',1,1,0,0,0,0,0,0,0.0,0.0,0,0],
"#;
        let cat = parse_station_catalog(js);
        assert_eq!(cat.len(), 2, "rainfall-only station must be excluded");

        let w = &cat[0];
        assert_eq!(w.station_id, "0001");
        assert_eq!(w.name.as_deref(), Some("Eberfingen"));
        assert_eq!(w.river.as_deref(), Some("Wutach"));
        assert_eq!(w.params, vec!["W".to_owned()]);
        assert_eq!(w.latitude, Some(47.7207));
        assert_eq!(w.longitude, Some(8.4311));

        let both = &cat[1];
        assert_eq!(both.station_id, "0300");
        assert_eq!(both.params, vec!["W".to_owned(), "Q".to_owned()]);
    }
}
