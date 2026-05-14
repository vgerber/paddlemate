use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Europe::Prague;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Czech hydrological data (CHMI / CHMU).
///
/// Source: http://hydro.chmi.cz/hppsoldv/
///
/// The site has no JSON API. Data is served as an HTML table at:
///   `http://hydro.chmi.cz/hppsoldv/hpps_prfdata.php?seq={station_id}`
///
/// The table columns are: Datum a cas, Stav [cm], Prutok [m3/s], Teplota [C].
/// All timestamps are in Prague local time (CET/CEST).
///
/// `source_id` format: `"{station_id}:{param}"`
///   e.g. `"20070907:H"` (water level, cm)
///        `"20070907:Q"` (discharge, m3/s)
///
/// `H` = Stav [cm] (water level)
/// `Q` = Prutok [m3/s] (discharge)
pub struct CzechChmiReader;

const BASE_URL: &str = "http://hydro.chmi.cz/hppsoldv/hpps_prfdata.php";

/// Parse a Prague-local timestamp string `"DD.MM.YYYY HH:MM"` to UTC.
fn parse_timestamp(s: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(s.trim(), "%d.%m.%Y %H:%M").ok()?;
    Prague
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.with_timezone(&Utc))
}

/// Extract `(timestamp, level_cm, flow_m3s)` rows from the CHMI HTML page.
///
/// Each data row has four `<td>` cells in the order:
/// timestamp | level cm | flow m3/s | temperature
fn parse_rows(html: &str) -> Vec<(DateTime<Utc>, Option<f64>, Option<f64>)> {
    let mut rows = Vec::new();
    // After the header row the table rows alternate CSS background colors.
    // Each row starts with a `<tr style="background-color:` prefix.
    for row in html.split("<tr style=\"background-color:") {
        // Collect all <td ...>content</td> text values in this row.
        let cells: Vec<&str> = row
            .split("<td")
            .skip(1)
            .filter_map(|cell| {
                // content is between '>' and '</td>'
                let start = cell.find('>')?;
                let end = cell.find("</td>")?;
                Some(cell[start + 1..end].trim())
            })
            .collect();

        if cells.len() < 3 {
            continue;
        }

        let Some(ts) = parse_timestamp(cells[0]) else {
            continue;
        };
        let level = parse_value(cells[1]);
        let flow = parse_value(cells[2]);
        rows.push((ts, level, flow));
    }
    rows
}

fn parse_value(s: &str) -> Option<f64> {
    let clean = s.replace(',', ".").replace('\u{a0}', ""); // remove nbsp
    let clean = clean.trim();
    if clean.is_empty() {
        None
    } else {
        clean.parse().ok()
    }
}

impl GaugeReader for CzechChmiReader {
    fn provider_key(&self) -> &'static str {
        "cz"
    }

    /// The CHMI HTML table retains approximately 7 days of hourly readings.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(7))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            Ok(vec![
                StationInfo {
                    station_id: "20070907".to_owned(),
                    name: Some("Bílek".to_owned()),
                    river: Some("Doubrava".to_owned()),
                    latitude: Some(49.703499),
                    longitude: Some(15.7339),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "20092272".to_owned(),
                    name: Some("Jizerka".to_owned()),
                    river: Some("Jizerka".to_owned()),
                    latitude: Some(50.8195),
                    longitude: Some(15.3478),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "20214815".to_owned(),
                    name: Some("Janov - Harrachov".to_owned()),
                    river: Some("Mumlava".to_owned()),
                    latitude: Some(50.764702),
                    longitude: Some(15.3972),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "20265575".to_owned(),
                    name: Some("Kouty nad Desnou".to_owned()),
                    river: Some("Desná".to_owned()),
                    latitude: Some(50.099998),
                    longitude: Some(17.111401),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "20598963".to_owned(),
                    name: Some("Otradov".to_owned()),
                    river: Some("Krounka".to_owned()),
                    latitude: Some(49.792198),
                    longitude: Some(16.042801),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "2586337".to_owned(),
                    name: Some("Blanický mlýn".to_owned()),
                    river: Some("Blanice".to_owned()),
                    latitude: Some(48.9571),
                    longitude: Some(13.9414),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "307000".to_owned(),
                    name: Some("Oslavany".to_owned()),
                    river: Some("Oslava".to_owned()),
                    latitude: Some(49.115898),
                    longitude: Some(16.3437),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307047".to_owned(),
                    name: Some("Světlá nad Sázavou".to_owned()),
                    river: Some("Sázava".to_owned()),
                    latitude: Some(49.6647),
                    longitude: Some(15.4034),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307053".to_owned(),
                    name: Some("Špindlerův Mlýn".to_owned()),
                    river: Some("Labe".to_owned()),
                    latitude: Some(50.723202),
                    longitude: Some(15.5982),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307057".to_owned(),
                    name: Some("Stodůlky".to_owned()),
                    river: Some("Křemelná".to_owned()),
                    latitude: Some(49.117599),
                    longitude: Some(13.4278),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307092".to_owned(),
                    name: Some("Hřensko".to_owned()),
                    river: Some("Kamenice".to_owned()),
                    latitude: Some(50.873901),
                    longitude: Some(14.2511),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307102".to_owned(),
                    name: Some("Čeladná".to_owned()),
                    river: Some("Čeladenka".to_owned()),
                    latitude: Some(49.512798),
                    longitude: Some(18.337099),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307103".to_owned(),
                    name: Some("Morávka pod nádrží".to_owned()),
                    river: Some("Morávka".to_owned()),
                    latitude: Some(49.586102),
                    longitude: Some(18.529699),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307116".to_owned(),
                    name: Some("Jablonec nad Jizerou".to_owned()),
                    river: Some("Jizera".to_owned()),
                    latitude: Some(50.695),
                    longitude: Some(15.4384),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307133".to_owned(),
                    name: Some("Labská".to_owned()),
                    river: Some("Labe".to_owned()),
                    latitude: Some(50.710201),
                    longitude: Some(15.5851),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307135".to_owned(),
                    name: Some("Ostrov".to_owned()),
                    river: Some("Bystřice".to_owned()),
                    latitude: Some(50.305199),
                    longitude: Some(12.9365),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307162".to_owned(),
                    name: Some("Rejštejn".to_owned()),
                    river: Some("Otava".to_owned()),
                    latitude: Some(49.1395),
                    longitude: Some(13.5083),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "307216".to_owned(),
                    name: Some("Český Krumlov".to_owned()),
                    river: Some("Polečnice".to_owned()),
                    latitude: Some(48.813099),
                    longitude: Some(14.3128),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "307241".to_owned(),
                    name: Some("Modrava".to_owned()),
                    river: Some("Vydra".to_owned()),
                    latitude: Some(49.026001),
                    longitude: Some(13.4972),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307282".to_owned(),
                    name: Some("Čenkov".to_owned()),
                    river: Some("Litavka".to_owned()),
                    latitude: Some(49.776501),
                    longitude: Some(14.0057),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "307294".to_owned(),
                    name: Some("Stará Role".to_owned()),
                    river: Some("Rolava".to_owned()),
                    latitude: Some(50.2486),
                    longitude: Some(12.82),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "307311".to_owned(),
                    name: Some("Bílý Potok".to_owned()),
                    river: Some("Smědá".to_owned()),
                    latitude: Some(50.876202),
                    longitude: Some(15.2109),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307315".to_owned(),
                    name: Some("Šance pod nádrží".to_owned()),
                    river: Some("Ostravice".to_owned()),
                    latitude: Some(49.514301),
                    longitude: Some(18.413601),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "307351".to_owned(),
                    name: Some("Rožnov pod Radhoštěm".to_owned()),
                    river: Some("Rožnovská Bečva".to_owned()),
                    latitude: Some(49.4585),
                    longitude: Some(18.1273),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "34215428".to_owned(),
                    name: Some("Klášterec nad Orlicí".to_owned()),
                    river: Some("Divoká Orlice".to_owned()),
                    latitude: Some(50.1175),
                    longitude: Some(16.555),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "41466398".to_owned(),
                    name: Some("Raškovice".to_owned()),
                    river: Some("Mohelnice".to_owned()),
                    latitude: Some(49.601398),
                    longitude: Some(18.4743),
                    params: vec!["Q".to_owned()],
                },
            ])
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

            // Group requests by station_id.
            let mut station_map: HashMap<&str, Vec<(&str, &str, DateTime<Utc>, DateTime<Utc>)>> =
                HashMap::new();
            for req in requests {
                let parts: Vec<&str> = req.source_id.splitn(2, ':').collect();
                if parts.len() == 2 {
                    station_map.entry(parts[0]).or_default().push((
                        parts[1],
                        &req.source_id,
                        req.from,
                        req.to,
                    ));
                } else {
                    tracing::warn!("CzechChmiReader: malformed source_id '{}'", req.source_id);
                }
            }

            for (station_id, params) in &station_map {
                let url = format!("{BASE_URL}?seq={station_id}");
                let html = match reqwest::get(&url).await {
                    Ok(r) => match r.text().await {
                        Ok(t) => t,
                        Err(e) => {
                            tracing::warn!(
                                "CzechChmiReader: failed to read body for {station_id}: {e}"
                            );
                            continue;
                        }
                    },
                    Err(e) => {
                        tracing::warn!("CzechChmiReader: HTTP error for {station_id}: {e}");
                        continue;
                    }
                };

                let rows = parse_rows(&html);

                for (param, source_id, from, to) in params {
                    let series: Vec<(DateTime<Utc>, f64)> = rows
                        .iter()
                        .filter(|(ts, _, _)| ts >= from && ts <= to)
                        .filter_map(|(ts, level, flow)| {
                            let value = match *param {
                                "H" => *level,
                                "Q" => *flow,
                                other => {
                                    tracing::warn!("CzechChmiReader: unknown param '{other}'");
                                    return None;
                                }
                            }?;
                            Some((*ts, value))
                        })
                        .collect();

                    if !series.is_empty() {
                        results.insert(source_id.to_string(), series);
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

    #[test]
    fn parse_timestamp_converts_prague_time() {
        // 14.05.2026 09:30 Prague CEST (UTC+2) -> 07:30 UTC
        let ts = parse_timestamp("14.05.2026 09:30").unwrap();
        assert_eq!(
            ts.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-05-14T07:30:00Z"
        );
    }

    #[test]
    fn parse_rows_extracts_values() {
        let html = r#"<tr style="background-color:#EFF0F0" >
<td style="text-align:center;">14.05.2026 09:30</td>
<td style="text-align:center;">21</td>
<td style="text-align:center;">0.0841</td>
<td style="text-align:center;"></td>
</tr>
<tr style="background-color:#fff" >
<td style="text-align:center;">14.05.2026 09:20</td>
<td style="text-align:center;">20</td>
<td style="text-align:center;">0.0800</td>
<td style="text-align:center;"></td>
</tr>"#;
        let rows = parse_rows(html);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].1, Some(21.0));
        assert_eq!(rows[0].2, Some(0.0841));
        assert_eq!(rows[1].1, Some(20.0));
    }
}
