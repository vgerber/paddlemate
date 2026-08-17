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
///
/// `list_stations` discovers the whole CHMI catalog live from the overview
/// page `hpps_main.php`. That page is an HTML image map where every gauge is
/// an `<area>` carrying an `onmouseover="ShowActPrfdetail(self.document,
/// 'name','river','status','datetime','level','flow','seq', ...)"` handler, so
/// station name, river and the CHMI sequence id can be read from it. The page
/// exposes no geographic coordinates (the map uses pixel positions), so
/// `latitude`/`longitude` are always `None`.
pub struct CzechChmiReader;

const BASE_URL: &str = "http://hydro.chmi.cz/hppsoldv/hpps_prfdata.php";

/// Overview page enumerating every CHMI reporting profile, used by
/// `list_stations`. Served as an HTML image map (see the struct docs).
const STATIONS_URL: &str = "http://hydro.chmi.cz/hppsoldv/hpps_main.php";

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

/// Extract the station catalog from the `hpps_main.php` overview page.
///
/// Every gauge on the map appears as an `<area>` whose `onmouseover` handler
/// calls `ShowActPrfdetail(self.document, 'name', 'river', 'status',
/// 'datetime', 'level', 'flow', 'seq', ...)`. We read the first seven
/// single-quoted arguments of each call. Water level (`H`) is the base
/// measurement every profile reports; discharge (`Q`) is offered whenever the
/// profile carries a flow value.
fn parse_station_list(html: &str) -> Vec<StationInfo> {
    const MARKER: &str = "ShowActPrfdetail(self.document,";
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // One <area> per gauge: `coords` is the pixel marker, onmouseover the args.
    for tag in html.split("<area").skip(1) {
        let Some(marker) = tag.find(MARKER) else {
            continue;
        };
        // Read the first seven single-quoted arguments of the call.
        let mut args: Vec<&str> = Vec::with_capacity(7);
        let mut rest = &tag[marker + MARKER.len()..];
        for _ in 0..7 {
            let Some(open) = rest.find('\'') else {
                break;
            };
            let after = &rest[open + 1..];
            let Some(close) = after.find('\'') else {
                break;
            };
            args.push(&after[..close]);
            rest = &after[close + 1..];
        }
        if args.len() < 7 {
            continue;
        }

        let name = args[0].trim();
        let river = args[1].trim();
        let flow = args[5].trim();
        let seq = args[6].trim();

        // A well-formed CHMI sequence id is all digits. Anything else means the
        // arguments got misaligned (for example a stray quote in a name), so we
        // skip it rather than emit a bogus station.
        if seq.is_empty() || !seq.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        if !seen.insert(seq.to_owned()) {
            continue;
        }

        // Coordinates from the marker pixel.
        let (latitude, longitude) = tag
            .split_once("coords=\"")
            .and_then(|(_, r)| r.split_once('"'))
            .and_then(|(coords, _)| marker_pixel(coords))
            .map_or((None, None), |(x, y)| {
                let (lat, lon) = pixel_to_latlon(x, y);
                (Some(lat), Some(lon))
            });

        let mut params = vec!["H".to_owned()];
        if !flow.is_empty() {
            params.push("Q".to_owned());
        }

        out.push(StationInfo {
            station_id: seq.to_owned(),
            name: (!name.is_empty()).then(|| name.to_owned()),
            river: (!river.is_empty()).then(|| river.to_owned()),
            latitude,
            longitude,
            params,
        });
    }

    out
}

/// Circle-marker center from a `coords="x,y,radius"` attribute.
fn marker_pixel(coords: &str) -> Option<(f64, f64)> {
    let mut it = coords
        .split(',')
        .filter_map(|s| s.trim().parse::<f64>().ok());
    Some((it.next()?, it.next()?))
}

/// CHMI overview pixel to WGS84. Quadratic fit (Krovak projection) against 25
/// known stations, ~0.4 km error.
fn pixel_to_latlon(x: f64, y: f64) -> (f64, f64) {
    let lat = 0.000_253_535 * x
        - 0.006_505_092 * y
        - 4.007_128e-7 * x * x
        - 2.032_302e-8 * y * y
        - 5.502_892e-8 * x * y
        + 51.357_249_915;
    let lon = 0.010_426_414 * x + 0.000_419_534 * y
        - 5.427_827e-8 * x * x
        - 3.580_455e-8 * y * y
        - 1.289_827e-6 * x * y
        + 11.803_308_092;
    (lat, lon)
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
            // Discover the whole catalog live from the overview page. reqwest
            // decodes the body using the response charset (UTF-8 here).
            let html = reqwest::get(STATIONS_URL)
                .await
                .map_err(|e| {
                    anyhow::anyhow!("CzechChmiReader: HTTP error fetching station list: {e}")
                })?
                .error_for_status()
                .map_err(|e| {
                    anyhow::anyhow!("CzechChmiReader: server error fetching station list: {e}")
                })?
                .text()
                .await
                .map_err(|e| {
                    anyhow::anyhow!("CzechChmiReader: failed to read station list body: {e}")
                })?;

            let stations = parse_station_list(&html);
            if stations.is_empty() {
                anyhow::bail!(
                    "CzechChmiReader: station list page yielded no stations (page format may have changed)"
                );
            }
            Ok(stations)
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

            // Group requests by station_id: the parameter, the full source_id
            // to key the result by, and the requested window.
            type Wanted<'r> = (&'r str, &'r str, DateTime<Utc>, DateTime<Utc>);
            let mut station_map: HashMap<&str, Vec<Wanted<'_>>> = HashMap::new();
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

    #[test]
    fn parse_station_list_extracts_stations() {
        // Two <area> handlers mirroring the real overview page: the first has a
        // flow value (so both H and Q), the second has none (H only).
        let html = r#"<area shape="circle" coords="380,259,5" href="/hpps/popup_hpps_prfdyn.php?seq=20070907" onmouseover="ShowActPrfdetail(self.document,'Bílek','Doubrava','Stav : sucho','09.08.2026 11:20','16','0.0347','20070907',380,259,findXCoord(event),findYCoord(event), '1', '1');" id="id_20070907" />
<area shape="circle" coords="10,20,5" href="/hpps/popup_hpps_prfdyn.php?seq=307192" onmouseover="ShowActPrfdetail(self.document,'Hradec Králové','Labe','Stav : normální stav','','','','307192',10,20);" id="id_307192" />"#;
        let stations = parse_station_list(html);
        assert_eq!(stations.len(), 2);

        assert_eq!(stations[0].station_id, "20070907");
        assert_eq!(stations[0].name.as_deref(), Some("Bílek"));
        assert_eq!(stations[0].river.as_deref(), Some("Doubrava"));
        assert_eq!(stations[0].params, vec!["H".to_owned(), "Q".to_owned()]);
        // Bilek's real pixel (380,259) maps to roughly 49.70 N, 15.74 E.
        let lat = stations[0].latitude.expect("latitude");
        let lon = stations[0].longitude.expect("longitude");
        assert!((lat - 49.70).abs() < 0.1, "lat {lat}");
        assert!((lon - 15.74).abs() < 0.1, "lon {lon}");

        assert_eq!(stations[1].station_id, "307192");
        assert_eq!(stations[1].params, vec!["H".to_owned()]);
    }

    #[test]
    fn parse_station_list_deduplicates_seq() {
        // The overview markup references each station twice; only one entry
        // should survive.
        let one = "<area shape=\"circle\" coords=\"1,2,5\" onmouseover=\"ShowActPrfdetail(self.document,'A','R','s','d','1','0.5','307000',1,2);\" />";
        let html = format!("{one}\n{one}");
        let stations = parse_station_list(&html);
        assert_eq!(stations.len(), 1);
        assert_eq!(stations[0].station_id, "307000");
    }
}
