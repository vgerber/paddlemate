use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Berlin;
use tokio::sync::Mutex;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

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
/// One station's latest line from the snapshot: when it was measured, the water
/// level in cm and the discharge in m3/s. Either value can be absent.
type Snapshot = HashMap<String, (DateTime<Utc>, Option<f64>, Option<f64>)>;

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
            .map_err(|e| anyhow::anyhow!("BwReader: HTTP error fetching snapshot: {e}"))?
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("BwReader: failed to read snapshot body: {e}"))?;

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
        Box::pin(async {
            Ok(vec![
                StationInfo {
                    station_id: "0170".to_owned(),
                    name: Some("Schönmünzach".to_owned()),
                    river: Some("Schönmünz".to_owned()),
                    latitude: Some(48.6068),
                    longitude: Some(8.3637),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "0246".to_owned(),
                    name: Some("Forbach".to_owned()),
                    river: Some("Murg".to_owned()),
                    latitude: Some(48.615101),
                    longitude: Some(8.3641),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "9082".to_owned(),
                    name: Some("Zwirkenberg".to_owned()),
                    river: Some("Obere Argen".to_owned()),
                    latitude: Some(47.646599),
                    longitude: Some(9.9691),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0001".to_owned(),
                    name: Some("Eberfingen".to_owned()),
                    river: Some("Wutach".to_owned()),
                    latitude: Some(47.720699),
                    longitude: Some(8.4311),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0004".to_owned(),
                    name: Some("Kirchen-Hausen".to_owned()),
                    river: Some("Donau".to_owned()),
                    latitude: Some(47.925499),
                    longitude: Some(8.6796),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0072".to_owned(),
                    name: Some("Ewattingen".to_owned()),
                    river: Some("Wutach".to_owned()),
                    latitude: Some(47.848301),
                    longitude: Some(8.4502),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0074".to_owned(),
                    name: Some("Zell".to_owned()),
                    river: Some("Wiese".to_owned()),
                    latitude: Some(47.699501),
                    longitude: Some(7.8455),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0112".to_owned(),
                    name: Some("Baden-Baden".to_owned()),
                    river: Some("Oos".to_owned()),
                    latitude: Some(48.7743),
                    longitude: Some(8.2201),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0114".to_owned(),
                    name: Some("Kappelrodeck".to_owned()),
                    river: Some("Acher".to_owned()),
                    latitude: Some(48.5844),
                    longitude: Some(8.1259),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0170".to_owned(),
                    name: Some("Schönmünzach (cm)".to_owned()),
                    river: Some("Schönmünz".to_owned()),
                    latitude: Some(48.6068),
                    longitude: Some(8.3637),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0189".to_owned(),
                    name: Some("Simonswald".to_owned()),
                    river: Some("Wilde Gutach".to_owned()),
                    latitude: Some(48.111801),
                    longitude: Some(8.0336),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0206".to_owned(),
                    name: Some("St. Blasien".to_owned()),
                    river: Some("Hauensteiner Alb".to_owned()),
                    latitude: Some(47.756901),
                    longitude: Some(8.1447),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0212".to_owned(),
                    name: Some("Beutelsau".to_owned()),
                    river: Some("Untere Argen".to_owned()),
                    latitude: Some(47.7047),
                    longitude: Some(9.8187),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0213".to_owned(),
                    name: Some("Gießen".to_owned()),
                    river: Some("Argen".to_owned()),
                    latitude: Some(47.627998),
                    longitude: Some(9.5961),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "0300".to_owned(),
                    name: Some("Gutach".to_owned()),
                    river: Some("Elz".to_owned()),
                    latitude: Some(48.119099),
                    longitude: Some(7.9888),
                    params: vec!["W".to_owned()],
                },
            ])
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
                    tracing::warn!("BwReader: malformed source_id '{}'", req.source_id);
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
                        tracing::warn!("BwReader: unknown param '{other}'");
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
}
