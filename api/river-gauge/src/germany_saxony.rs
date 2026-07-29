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

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            Ok(vec![
                StationInfo {
                    station_id: "550490".to_owned(),
                    name: Some("Bielatal 1".to_owned()),
                    river: Some("Biela".to_owned()),
                    latitude: Some(50.882),
                    longitude: Some(14.0465),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "550620".to_owned(),
                    name: Some("Neundorf".to_owned()),
                    river: Some("Gottleuba".to_owned()),
                    latitude: Some(50.916302),
                    longitude: Some(13.9774),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "550710".to_owned(),
                    name: Some("Markersbach".to_owned()),
                    river: Some("Bahra".to_owned()),
                    latitude: Some(50.833),
                    longitude: Some(13.9796),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "550913".to_owned(),
                    name: Some("Lauenstein 4".to_owned()),
                    river: Some("Müglitz".to_owned()),
                    latitude: Some(50.7896),
                    longitude: Some(13.8144),
                    params: vec!["W".to_owned()],
                },
                StationInfo {
                    station_id: "563745".to_owned(),
                    name: Some("Johanngeorgenstadt 4".to_owned()),
                    river: Some("Schwarzwasser".to_owned()),
                    latitude: Some(50.437),
                    longitude: Some(12.7283),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "568350".to_owned(),
                    name: Some("Rothenthal".to_owned()),
                    river: Some("Natzschung (Nacetínský potok)".to_owned()),
                    latitude: Some(50.6189),
                    longitude: Some(13.3599),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "568400".to_owned(),
                    name: Some("Zöblitz".to_owned()),
                    river: Some("Schwarze Pockau".to_owned()),
                    latitude: Some(50.682598),
                    longitude: Some(13.212),
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
