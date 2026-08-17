use std::collections::HashMap;

use chrono::{DateTime, Utc};

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Saxony hydrological data (LfULG / LHWZ HWIMS portal).
///
/// Source: https://www.umwelt.sachsen.de/umwelt/infosysteme/hwims/
///
/// The HWIMS SOAP web service requires credentials. However, each station
/// exposes a **public RSS feed** with the last ~60 readings (≈ 5 days at
/// 15-minute resolution). This reader parses that feed.
///
/// RSS URL: `https://www.umwelt.sachsen.de/umwelt/infosysteme/hwims/portal/web/feed/wasserstand-pegel-{station_id}`
///
/// Each `<item>` contains:
/// - `<dc:date>2026-05-14T08:15:00Z</dc:date>` — UTC timestamp
/// - `<description>Wasserstand: 33 cm&lt;br/&gt;Durchfluss: 0,187 m³/s&lt;br/&gt;…</description>`
///
/// `source_id` format: `"{station_id}:{param}"`
///   e.g. `"550490:W"` (water level, cm)
///        `"550490:Q"` (discharge, m³/s)
///
/// `W` = Wasserstand (water level, cm)
/// `Q` = Durchfluss  (discharge, m³/s)
pub struct GermanySaxonyReader;

const FEED_BASE: &str =
    "https://www.umwelt.sachsen.de/umwelt/infosysteme/hwims/portal/web/feed/wasserstand-pegel-";

/// Public HWIMS "Wasserstand-Uebersicht" map page. It is server-rendered HTML
/// with no JSON/REST backend (the portal map ships no ajax endpoint), but the
/// full station catalog is embedded as one popup block per gauge. Each block
/// carries the station id inside its diagram image URL
/// (`diagrammimage_{station_id}_INFOBOXWEB_W`) and a title of the form
/// `"Name / River"`. This is the only bulk station list the portal exposes, so
/// `list_stations` scrapes it.
const OVERVIEW_URL: &str =
    "https://www.umwelt.sachsen.de/umwelt/infosysteme/hwims/portal/web/wasserstand-uebersicht";

/// Return the substring of `hay` that lies between the first occurrence of
/// `after` and the next occurrence of `until` following it.
fn slice_between<'a>(hay: &'a str, after: &str, until: &str) -> Option<&'a str> {
    let start = hay.find(after)? + after.len();
    let end = hay[start..].find(until)? + start;
    Some(&hay[start..end])
}

/// Read the value rendered for a labelled popup field, e.g. "Durchfluss:".
///
/// The markup is
/// `…<span class="popUpLabel">Durchfluss:</span> <span class="popUpValue">5,07<span> …`
/// so we jump past the label, then take the next `popUpValue` up to the first
/// nested tag.
fn popup_field<'a>(block: &'a str, label: &str) -> Option<&'a str> {
    let after_label = block.split_once(label)?.1;
    slice_between(after_label, "popUpValue\">", "<").map(str::trim)
}

/// Pegelnummer -> exact WGS84 from the LHP feed, for stations it carries.
/// Ids absent here fall back to the pixel-map fit.
const STATION_COORDS: &str = include_str!("../data/germany_saxony_coords.csv");

/// Parse the embedded coordinate table into a Pegelnummer -> (lat, lon) map.
fn coord_lookup() -> HashMap<&'static str, (f64, f64)> {
    STATION_COORDS
        .lines()
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .filter_map(|l| {
            let mut it = l.split(',');
            let id = it.next()?;
            let lat = it.next()?.trim().parse().ok()?;
            let lon = it.next()?.trim().parse().ok()?;
            Some((id, (lat, lon)))
        })
        .collect()
}

/// Marker `left%`/`top%` on the HWIMS map image to WGS84. Quadratic fit against
/// 94 stations with known LHP coordinates, ~0.04 km mean / 0.78 km max error.
/// Fallback for stations `STATION_COORDS` does not cover.
fn percent_to_latlon(left: f64, top: f64) -> (f64, f64) {
    let lat = 51.736_540 + 0.001_027_484_29 * left
        - 0.016_241_082_1 * top
        - 5.352_851_7e-6 * left * left
        - 4.986_047_15e-7 * top * top
        - 2.998_322_1e-7 * left * top;
    let lon = 11.582_895_7
        + 0.036_352_040_1 * left
        + 0.001_224_341_99 * top
        + 7.502_350_73e-7 * left * left
        - 6.161_906_77e-7 * top * top
        - 1.251_329_86e-5 * left * top;
    (lat, lon)
}

/// Read the percentage of a `left:`/`top:` CSS property from a style string.
fn percent_prop(style: &str, prop: &str) -> Option<f64> {
    let after = style.split_once(prop)?.1.trim_start();
    let end = after.find('%')?;
    after[..end].trim().parse::<f64>().ok()
}

/// Marker id -> (left%, top%) from the `wasserstand-pegel-{id}` map anchors.
fn parse_marker_positions(html: &str) -> HashMap<String, (f64, f64)> {
    let mut positions = HashMap::new();
    for seg in html.split("wasserstand-pegel-").skip(1) {
        let id: String = seg.chars().take_while(|c| c.is_ascii_digit()).collect();
        if id.is_empty() {
            continue;
        }
        // Only look inside this anchor's own tag (up to its closing '>').
        let Some((tag, _)) = seg.split_once('>') else {
            continue;
        };
        if let (Some(left), Some(top)) = (percent_prop(tag, "left:"), percent_prop(tag, "top:")) {
            positions.entry(id).or_insert((left, top));
        }
    }
    positions
}

/// Parse the HWIMS overview page into the full list of Saxony gauges.
///
/// Blocks are delimited by the popup container div. Within each block the
/// station id comes from the diagram image URL (self-consistent with the
/// block's own title), not from the neighbouring anchor href, whose id is
/// offset by one relative to the popup it renders. Coordinates come from the
/// exact `STATION_COORDS` table, falling back to the station's map marker
/// (`percent_to_latlon`), joined back by id.
fn parse_station_overview(html: &str) -> Vec<StationInfo> {
    let mut stations = Vec::new();
    let positions = parse_marker_positions(html);
    let coords = coord_lookup();

    for block in html.split("<div class=\"popUp popUpMs\">").skip(1) {
        // Station id: the digits between "diagrammimage_" and the next "_".
        let station_id = match slice_between(block, "diagrammimage_", "_") {
            Some(id) if id.chars().all(|c| c.is_ascii_digit()) && !id.is_empty() => id.to_owned(),
            _ => continue,
        };

        // Title is "Name / River"; split on the first " / ".
        let (name, river) = match slice_between(block, "popUpTitleBold\">", "<").map(str::trim) {
            Some(title) if !title.is_empty() => match title.split_once(" / ") {
                Some((n, r)) => (
                    Some(n.trim().to_owned()),
                    Some(r.trim().to_owned()).filter(|s| !s.is_empty()),
                ),
                None => (Some(title.to_owned()), None),
            },
            _ => (None, None),
        };

        // Every station on this page is a water-level gauge (its diagram uses
        // the _W leitparameter), so "W" is always advertised. Discharge ("Q")
        // is added only when the block currently reports a numeric value, which
        // is how the RSS feed signals that a discharge series exists.
        let mut params = vec!["W".to_owned()];
        let has_discharge = popup_field(block, "Durchfluss:")
            .map(|v| v.replace(',', ".").parse::<f64>().is_ok())
            .unwrap_or(false);
        if has_discharge {
            params.push("Q".to_owned());
        }

        let (latitude, longitude) = coords
            .get(station_id.as_str())
            .map(|&(la, lo)| (Some(la), Some(lo)))
            .or_else(|| {
                positions.get(&station_id).map(|&(left, top)| {
                    let (la, lo) = percent_to_latlon(left, top);
                    (Some(la), Some(lo))
                })
            })
            .unwrap_or((None, None));

        stations.push(StationInfo {
            station_id,
            name,
            river,
            latitude,
            longitude,
            params,
        });
    }

    stations
}

/// Parse the HWIMS RSS feed XML for a single station.
///
/// Returns a list of `(utc_timestamp, level_cm, flow_m3s)` tuples.
fn parse_feed(xml: &str) -> Vec<(DateTime<Utc>, Option<f64>, Option<f64>)> {
    let mut readings = Vec::new();

    // Split on <item> boundaries.
    for item in xml.split("<item>").skip(1) {
        // Extract <dc:date> value: UTC ISO-8601 string.
        let ts = extract_tag(item, "dc:date")
            .and_then(|s| DateTime::parse_from_rfc3339(s.trim()).ok())
            .map(|dt| dt.with_timezone(&Utc));

        let Some(ts) = ts else { continue };

        // Extract <description> and decode HTML entities.
        let desc = match extract_tag(item, "description") {
            Some(d) => d
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&amp;", "&"),
            None => continue,
        };

        // Parse "Wasserstand: 33 cm<br/>Durchfluss: 0,187 m³/s<br/>…"
        let level = parse_desc_value(&desc, "Wasserstand:");
        let flow = parse_desc_value(&desc, "Durchfluss:");

        readings.push((ts, level, flow));
    }

    readings
}

/// Return the text content of the first occurrence of `<tag>…</tag>`.
fn extract_tag<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    Some(&xml[start..end])
}

/// Extract the numeric value for a labelled field in the description text.
///
/// E.g. `parse_desc_value("Wasserstand: 33 cm<br/>Durchfluss: …", "Wasserstand:")`
/// returns `Some(33.0)`.
fn parse_desc_value(desc: &str, label: &str) -> Option<f64> {
    let after = desc.split_once(label)?.1.trim();
    // The value ends at the first space or `<`.
    let end = after.find([' ', '<']).unwrap_or(after.len());
    let num_str = &after[..end];
    // German decimal separator is comma.
    num_str.replace(',', ".").parse::<f64>().ok()
}

impl GaugeReader for GermanySaxonyReader {
    fn provider_key(&self) -> &'static str {
        "sx"
    }

    /// The HWIMS RSS feed contains ~60 readings at 15-minute resolution,
    /// covering approximately the last 5 days.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(5))
    }

    /// Discover the whole Saxony gauge catalog live by scraping the public
    /// HWIMS overview map page (see `OVERVIEW_URL`). The portal exposes no JSON
    /// or REST station list, so the embedded popup blocks are the only bulk
    /// source. Coordinates come from `STATION_COORDS`, or the map marker fit.
    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            let resp = reqwest::get(OVERVIEW_URL)
                .await
                .map_err(|e| anyhow::anyhow!("GermanySaxonyReader: overview request error: {e}"))?
                .error_for_status()
                .map_err(|e| anyhow::anyhow!("GermanySaxonyReader: overview server error: {e}"))?;
            let html = resp
                .text()
                .await
                .map_err(|e| anyhow::anyhow!("GermanySaxonyReader: overview read error: {e}"))?;

            let stations = parse_station_overview(&html);
            if stations.is_empty() {
                anyhow::bail!(
                    "GermanySaxonyReader: no stations parsed from overview page (markup may have changed)"
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

            // Group requests by station_id.
            let mut by_station: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();
            for req in requests {
                let mut parts = req.source_id.rsplitn(2, ':');
                let param = parts.next().unwrap_or("");
                let station_id = parts.next().unwrap_or("");
                if station_id.is_empty() || param.is_empty() {
                    tracing::warn!(
                        "GermanySaxonyReader: malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                }
                by_station
                    .entry(station_id)
                    .or_default()
                    .push((param, &req.source_id));
            }

            for (station_id, params) in &by_station {
                // Determine the merged time window.
                let (from, to) = requests
                    .iter()
                    .filter(|r| r.source_id.starts_with(station_id))
                    .fold(None::<(DateTime<Utc>, DateTime<Utc>)>, |acc, r| {
                        Some(acc.map_or((r.from, r.to), |(f, t)| (f.min(r.from), t.max(r.to))))
                    })
                    .unwrap_or_else(|| {
                        let now = Utc::now();
                        (now - chrono::Duration::days(5), now)
                    });

                let url = format!("{FEED_BASE}{station_id}");
                let xml = match reqwest::get(&url).await {
                    Ok(r) if r.status().is_success() => match r.text().await {
                        Ok(t) => t,
                        Err(e) => {
                            tracing::warn!("GermanySaxonyReader: read error for {station_id}: {e}");
                            continue;
                        }
                    },
                    Ok(r) => {
                        tracing::warn!("GermanySaxonyReader: HTTP {} for {station_id}", r.status());
                        continue;
                    }
                    Err(e) => {
                        tracing::warn!("GermanySaxonyReader: request error for {station_id}: {e}");
                        continue;
                    }
                };

                let readings = parse_feed(&xml);

                for (param, source_id) in params {
                    let series = results.entry(source_id.to_string()).or_default();
                    for (ts, level, flow) in &readings {
                        if *ts < from || *ts > to {
                            continue;
                        }
                        let value = match *param {
                            "W" => *level,
                            "Q" => *flow,
                            other => {
                                tracing::warn!("GermanySaxonyReader: unknown param '{other}'");
                                None
                            }
                        };
                        if let Some(v) = value {
                            series.push((*ts, v));
                        }
                    }
                    // Return in chronological order.
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

    const SAMPLE_FEED: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel>
    <title>Wasserstand und Durchfluss für Pegel Bielatal 1 / Biela</title>
    <item>
      <title>Wasserstand und Durchfluss für 14.05.2026 10:15 Uhr</title>
      <description>Wasserstand: 33 cm&lt;br/&gt;Durchfluss: 0,187 m³/s&lt;br/&gt;Meldestufe: Niedrigwasser</description>
      <dc:date>2026-05-14T08:15:00Z</dc:date>
    </item>
    <item>
      <title>Wasserstand und Durchfluss für 14.05.2026 10:00 Uhr</title>
      <description>Wasserstand: 34 cm&lt;br/&gt;Durchfluss: 0,195 m³/s&lt;br/&gt;Meldestufe: Niedrigwasser</description>
      <dc:date>2026-05-14T08:00:00Z</dc:date>
    </item>
  </channel>
</rss>"#;

    #[test]
    fn parse_feed_extracts_readings() {
        let readings = parse_feed(SAMPLE_FEED);
        assert_eq!(readings.len(), 2);

        let (ts0, level0, flow0) = readings[0];
        assert_eq!(
            ts0.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-05-14T08:15:00Z"
        );
        assert_eq!(level0, Some(33.0));
        assert!((flow0.unwrap() - 0.187).abs() < 1e-9);

        let (ts1, level1, _) = readings[1];
        assert_eq!(
            ts1.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-05-14T08:00:00Z"
        );
        assert_eq!(level1, Some(34.0));
    }

    const SAMPLE_OVERVIEW: &str = r#"
    <div class="popUp popUpMs">
        <div class="popUpTitle"><span class="popUpTitleBold">Bielatal 1 / Biela</span></div>
        <div class="popUpMsDiagramm" style="background-image: url('/portal/diagramme/diagrammimage_550490_INFOBOXWEB_W');"></div>
        <div class="popUpRow"><span class="popUpLabel">Wasserstand:</span><span class="popUpValue">32<span> </span>cm</span></div>
        <div class="popUpRow"><span class="popUpLabel">Durchfluss:</span><span class="popUpValue">0,161<span> </span>m<sup>3</sup>/s</span></div>
    </div>
    <div class="popUp popUpMs">
        <div class="popUpTitle"><span class="popUpTitleBold">Pirna / Elbe</span></div>
        <div class="popUpMsDiagramm" style="background-image: url('/portal/diagramme/diagrammimage_501040_INFOBOXWEB_W');"></div>
        <div class="popUpRow"><span class="popUpLabel">Wasserstand:</span><span class="popUpValue">90<span> </span>cm</span></div>
        <div class="popUpRow"><span class="popUpLabel">Durchfluss:</span><span class="popUpValue">k.A.</span></div>
    </div>"#;

    #[test]
    fn parse_overview_extracts_stations() {
        let stations = parse_station_overview(SAMPLE_OVERVIEW);
        assert_eq!(stations.len(), 2);

        let biela = &stations[0];
        assert_eq!(biela.station_id, "550490");
        assert_eq!(biela.name.as_deref(), Some("Bielatal 1"));
        assert_eq!(biela.river.as_deref(), Some("Biela"));
        // 550490 is in STATION_COORDS, so exact coords are attached.
        assert!((biela.latitude.unwrap() - 50.8819).abs() < 1e-4);
        assert!((biela.longitude.unwrap() - 14.0466).abs() < 1e-4);
        // Numeric discharge present -> both W and Q advertised.
        assert_eq!(biela.params, vec!["W".to_owned(), "Q".to_owned()]);

        let pirna = &stations[1];
        assert_eq!(pirna.station_id, "501040");
        assert_eq!(pirna.river.as_deref(), Some("Elbe"));
        // Discharge "k.A." is not numeric -> only water level advertised.
        assert_eq!(pirna.params, vec!["W".to_owned()]);
    }

    #[test]
    fn parse_desc_value_german_decimal() {
        assert_eq!(
            parse_desc_value("Wasserstand: 33 cm<br/>", "Wasserstand:"),
            Some(33.0)
        );
        assert_eq!(
            parse_desc_value("Durchfluss: 0,187 m³/s<br/>", "Durchfluss:"),
            Some(0.187)
        );
    }
}
