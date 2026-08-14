use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Pacific::Auckland;
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, ReadingsBySource, StationInfo};

/// Reader for New Zealand regional council hydrometric networks via their
/// public Hilltop servers (the XML web service most NZ councils run).
///
/// One reader covers six councils, each keyed by a short council key:
///   wcrc  https://hilltop.wcrc.govt.nz/Websitedata.hts     West Coast (Buller, Grey, ...)
///   orc   https://gisdata.orc.govt.nz/hilltop/WaterInfo.hts Otago
///   hbrc  https://data.hbrc.govt.nz/Envirodata/EMAR.hts     Hawke's Bay
///   tdc   https://envdata.tasman.govt.nz/data.hts           Tasman
///   mdc   https://hydro.marlborough.govt.nz/data.hts        Marlborough
///   trc   https://extranet.trc.govt.nz/getdata/boo.hts      Taranaki
///
/// No auth, no key. Council environmental data is published under open
/// licences (mostly **CC-BY 4.0** - attribute the individual council).
/// Telemetry is near-real-time (5-15 min cadence at most sites); the servers
/// hold years of history but we advertise 30 days.
///
/// Protocol: `Request=SiteList&Location=LatLong` (filtered by
/// `&Measurement=Stage` / `&Measurement=Flow` so only actual river gauges are
/// listed), `Request=MeasurementList&Site=..` to discover each site's
/// measurement names/units, `Request=GetData&Site=..&Measurement=..&From=..&To=..`
/// for values. Timestamps in requests and responses are **NZ local time**
/// (Pacific/Auckland, no offset in the XML) and are converted via chrono-tz.
/// Measurement names vary per council ("Stage", "Stage (bubbler 1)", "Flow
/// NZDT", ...), so `fetch_all` resolves them lazily per site from
/// MeasurementList (cached in the reader), preferring the candidate with the
/// most recent data. Units are read from the responses and converted
/// (stage is commonly **mm** -> ÷10 to cm, m -> ×100; flow l/s -> ÷1000 to m³/s).
///
/// Councils are independent: a council failing only drops its own stations.
///
/// `source_id` format: `"{council_key}/{site name}:{param}"`
///   e.g. `"wcrc/Buller Rv @ Te Kuha WCRC:W"` (water level in cm)
///        `"wcrc/Buller Rv @ Te Kuha WCRC:Q"` (discharge in m³/s)
pub struct NewZealandHilltopReader {
    client: reqwest::Client,
    /// `"{council_key}/{site}"` -> parsed MeasurementList, cached for the
    /// lifetime of the reader so repeated polls skip re-discovery.
    measurement_cache: tokio::sync::Mutex<HashMap<String, Vec<HilltopMeasurement>>>,
}

impl Default for NewZealandHilltopReader {
    fn default() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(45))
                .build()
                .expect("reqwest client"),
            measurement_cache: Default::default(),
        }
    }
}

const COUNCILS: &[(&str, &str)] = &[
    ("wcrc", "https://hilltop.wcrc.govt.nz/Websitedata.hts"),
    ("orc", "https://gisdata.orc.govt.nz/hilltop/WaterInfo.hts"),
    ("hbrc", "https://data.hbrc.govt.nz/Envirodata/EMAR.hts"),
    ("tdc", "https://envdata.tasman.govt.nz/data.hts"),
    ("mdc", "https://hydro.marlborough.govt.nz/data.hts"),
    ("trc", "https://extranet.trc.govt.nz/getdata/boo.hts"),
];

fn council_base(key: &str) -> Option<&'static str> {
    COUNCILS.iter().find(|(k, _)| *k == key).map(|(_, b)| *b)
}

/// Minimal percent-encoding for a query value (site/measurement names carry
/// spaces, `@`, parentheses, ...). Everything outside RFC 3986 "unreserved"
/// is encoded.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Multiplier converting a Hilltop unit into our unit (cm / m³/s); `None`
/// for units we do not understand.
fn unit_factor(param: &str, unit: &str) -> Option<f64> {
    let u = unit.trim().to_ascii_lowercase();
    match param {
        "W" => match u.as_str() {
            "mm" => Some(0.1),
            "cm" => Some(1.0),
            "m" | "metre" | "metres" | "meters" => Some(100.0),
            _ => None,
        },
        "Q" => match u.as_str() {
            "m3/s" | "m3/sec" | "m\u{b3}/s" | "cumec" | "cumecs" => Some(1.0),
            "l/s" | "l/sec" => Some(0.001),
            _ => None,
        },
        _ => None,
    }
}

/// One usable measurement from a site's MeasurementList.
#[derive(Debug, Clone)]
struct HilltopMeasurement {
    /// Display name, matched against per-param candidates.
    name: String,
    /// The `Measurement=` value to request it by (`RequestAs`).
    request_as: String,
    /// Units per MeasurementList (GetData's own Units win if present).
    units: Option<String>,
    /// End of record of the parent DataSource (NZ local) - used to prefer
    /// the sensor that is still live when a site has several.
    to: Option<NaiveDateTime>,
}

/// How well a measurement name matches one of our params; lower = better,
/// `None` = not a match (incl. derived/QA series like "Gauging Stage
/// Difference" or "Specific Flow").
fn measurement_rank(param: &str, name: &str) -> Option<u8> {
    let n = name.trim().to_ascii_lowercase();
    const EXCLUDE: &[&str] = &["difference", "check", "gauging", "specific", "rating", "deviation"];
    if EXCLUDE.iter().any(|x| n.contains(x)) {
        return None;
    }
    match param {
        "W" => {
            if n == "stage" {
                Some(0)
            } else if n.starts_with("stage") {
                Some(1)
            } else if n == "water level" || n == "river level" {
                Some(2)
            } else if n.contains("water level") || n.contains("river level") {
                Some(3)
            } else {
                None
            }
        }
        "Q" => {
            if n == "flow" {
                Some(0)
            } else if n.starts_with("flow") || n.starts_with("streamflow") {
                Some(1)
            } else if n.contains("streamflow") || n.contains("discharge") {
                Some(2)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Pick the measurement to poll for `param`: the matching candidate with the
/// most recent end-of-record (sites keep dead sensors listed, e.g. a "Stage"
/// that stopped in 2024 next to a live "Stage (bubbler 1)"), tie-broken by
/// match rank.
fn pick_measurement<'a>(
    measurements: &'a [HilltopMeasurement],
    param: &str,
) -> Option<&'a HilltopMeasurement> {
    measurements
        .iter()
        .filter_map(|m| measurement_rank(param, &m.name).map(|r| (m, r)))
        .max_by_key(|(m, r)| (m.to, std::cmp::Reverse(*r)))
        .map(|(m, _)| m)
}

const NZ_TIME_FMT: &str = "%Y-%m-%dT%H:%M:%S";

/// Hilltop timestamps are naive NZ local time.
fn parse_nz_time(s: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(s.trim(), NZ_TIME_FMT).ok()?;
    Auckland
        .from_local_datetime(&naive)
        .earliest()
        .map(|dt| dt.with_timezone(&Utc))
}

fn format_nz_time(ts: DateTime<Utc>) -> String {
    ts.with_timezone(&Auckland).format(NZ_TIME_FMT).to_string()
}

// ── XML documents ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SiteListDoc {
    #[serde(rename = "Error")]
    error: Option<String>,
    #[serde(rename = "Site", default)]
    sites: Vec<SiteXml>,
}

#[derive(Deserialize)]
struct SiteXml {
    #[serde(rename = "@Name")]
    name: String,
    #[serde(rename = "Latitude")]
    latitude: Option<String>,
    #[serde(rename = "Longitude")]
    longitude: Option<String>,
}

#[derive(Deserialize)]
struct MeasurementListDoc {
    #[serde(rename = "Error")]
    error: Option<String>,
    #[serde(rename = "DataSource", default)]
    data_sources: Vec<DataSourceXml>,
}

#[derive(Deserialize)]
struct DataSourceXml {
    #[serde(rename = "TSType")]
    ts_type: Option<String>,
    #[serde(rename = "To")]
    to: Option<String>,
    #[serde(rename = "Measurement", default)]
    measurements: Vec<MeasurementXml>,
}

#[derive(Deserialize)]
struct MeasurementXml {
    #[serde(rename = "@Name")]
    name: String,
    #[serde(rename = "RequestAs")]
    request_as: Option<String>,
    #[serde(rename = "Units")]
    units: Option<String>,
}

#[derive(Deserialize)]
struct GetDataDoc {
    #[serde(rename = "Error")]
    error: Option<String>,
    #[serde(rename = "Measurement")]
    measurement: Option<GetDataMeasurementXml>,
}

#[derive(Deserialize)]
struct GetDataMeasurementXml {
    #[serde(rename = "DataSource")]
    data_source: Option<GetDataSourceXml>,
    #[serde(rename = "Data")]
    data: Option<GetDataDataXml>,
}

#[derive(Deserialize)]
struct GetDataSourceXml {
    #[serde(rename = "ItemInfo")]
    item_info: Option<ItemInfoXml>,
}

#[derive(Deserialize)]
struct ItemInfoXml {
    #[serde(rename = "Units")]
    units: Option<String>,
}

#[derive(Deserialize)]
struct GetDataDataXml {
    #[serde(rename = "E", default)]
    entries: Vec<EntryXml>,
}

#[derive(Deserialize)]
struct EntryXml {
    #[serde(rename = "T")]
    t: Option<String>,
    #[serde(rename = "I1")]
    i1: Option<String>,
}

fn flatten_measurement_list(doc: &MeasurementListDoc) -> Vec<HilltopMeasurement> {
    let mut out = Vec::new();
    for ds in &doc.data_sources {
        // Only the actual series listings; StdQualSeries etc. carry no
        // requestable measurements.
        if ds.ts_type.as_deref() != Some("StdSeries") {
            continue;
        }
        let to = ds
            .to
            .as_deref()
            .and_then(|t| NaiveDateTime::parse_from_str(t.trim(), NZ_TIME_FMT).ok());
        for m in &ds.measurements {
            out.push(HilltopMeasurement {
                name: m.name.clone(),
                request_as: m.request_as.clone().unwrap_or_else(|| m.name.clone()),
                units: m.units.clone(),
                to,
            });
        }
    }
    out
}

impl NewZealandHilltopReader {
    /// GET with one retry - council servers sit behind flaky reverse proxies
    /// (Cloudflare 522s were seen on HBRC).
    async fn get_text(&self, url: &str) -> anyhow::Result<String> {
        let mut last_err = anyhow::anyhow!("unreachable");
        for _ in 0..2 {
            match self.client.get(url).send().await {
                Ok(r) if r.status().is_success() => match r.text().await {
                    Ok(t) => return Ok(t),
                    Err(e) => last_err = anyhow::anyhow!("read error: {e}"),
                },
                Ok(r) => last_err = anyhow::anyhow!("HTTP {}", r.status()),
                Err(e) => last_err = anyhow::anyhow!("request error: {e}"),
            }
        }
        Err(last_err)
    }

    /// Cached MeasurementList for one site; `None` if it cannot be fetched
    /// right now (not cached, so the next poll retries).
    async fn measurements_for(
        &self,
        station_id: &str,
        base: &str,
        site: &str,
    ) -> Option<Vec<HilltopMeasurement>> {
        let mut cache = self.measurement_cache.lock().await;
        if let Some(m) = cache.get(station_id) {
            return Some(m.clone());
        }
        let url = format!(
            "{base}?Service=Hilltop&Request=MeasurementList&Site={}",
            percent_encode(site)
        );
        let body = match self.get_text(&url).await {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!("NewZealandHilltopReader: MeasurementList for '{station_id}': {e}");
                return None;
            }
        };
        let doc: MeasurementListDoc = match quick_xml::de::from_str(&body) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!(
                    "NewZealandHilltopReader: MeasurementList XML for '{station_id}': {e}"
                );
                return None;
            }
        };
        if let Some(err) = &doc.error {
            tracing::warn!("NewZealandHilltopReader: MeasurementList for '{station_id}': {err}");
            return None;
        }
        let measurements = flatten_measurement_list(&doc);
        cache.insert(station_id.to_owned(), measurements.clone());
        Some(measurements)
    }
}

impl GaugeReader for NewZealandHilltopReader {
    fn provider_key(&self) -> &'static str {
        "hilltop"
    }

    /// The servers hold years; 30 days is plenty for catch-up polling.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(30))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            struct Accum {
                lat: Option<f64>,
                lon: Option<f64>,
                params: Vec<String>,
            }
            // station_id -> Accum; BTreeMap for stable output order.
            let mut stations: std::collections::BTreeMap<String, Accum> = Default::default();

            for (key, base) in COUNCILS {
                // Filter server-side to sites that really are river gauges;
                // measurement names vary per site but the plain filters match
                // the vast majority ("Stage (NIWA 1)"-only sites are skipped).
                for (param, filter) in [("W", "Stage"), ("Q", "Flow")] {
                    let url = format!(
                        "{base}?Service=Hilltop&Request=SiteList&Location=LatLong&Measurement={}",
                        percent_encode(filter)
                    );
                    let body = match self.get_text(&url).await {
                        Ok(b) => b,
                        Err(e) => {
                            // One council failing must not break the others.
                            tracing::warn!(
                                "NewZealandHilltopReader: SiteList {key}/{filter}: {e}"
                            );
                            continue;
                        }
                    };
                    let doc: SiteListDoc = match quick_xml::de::from_str(&body) {
                        Ok(d) => d,
                        Err(e) => {
                            tracing::warn!(
                                "NewZealandHilltopReader: SiteList XML {key}/{filter}: {e}"
                            );
                            continue;
                        }
                    };
                    if let Some(err) = &doc.error {
                        tracing::warn!("NewZealandHilltopReader: SiteList {key}/{filter}: {err}");
                        continue;
                    }
                    for site in doc.sites {
                        let entry = stations
                            .entry(format!("{key}/{}", site.name))
                            .or_insert_with(|| Accum {
                                lat: site.latitude.as_deref().and_then(|v| v.trim().parse().ok()),
                                lon: site.longitude.as_deref().and_then(|v| v.trim().parse().ok()),
                                params: Vec::new(),
                            });
                        if !entry.params.iter().any(|p| p == param) {
                            entry.params.push(param.to_owned());
                        }
                    }
                }
            }

            if stations.is_empty() {
                anyhow::bail!("NewZealandHilltopReader: every council SiteList failed");
            }

            Ok(stations
                .into_iter()
                .map(|(station_id, a)| {
                    let name = station_id.split_once('/').map(|(_, s)| s.to_owned());
                    StationInfo {
                        station_id,
                        name,
                        river: None,
                        latitude: a.lat,
                        longitude: a.lon,
                        params: a.params,
                    }
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

            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!(
                        "NewZealandHilltopReader: malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                };
                if param != "W" && param != "Q" {
                    tracing::warn!(
                        "NewZealandHilltopReader: unknown param in '{}'",
                        req.source_id
                    );
                    continue;
                }
                let Some((council, site)) = station_id.split_once('/') else {
                    tracing::warn!(
                        "NewZealandHilltopReader: missing council key in '{}'",
                        req.source_id
                    );
                    continue;
                };
                let Some(base) = council_base(council) else {
                    tracing::warn!(
                        "NewZealandHilltopReader: unknown council in '{}'",
                        req.source_id
                    );
                    continue;
                };

                let Some(measurements) = self.measurements_for(station_id, base, site).await
                else {
                    continue;
                };
                let Some(chosen) = pick_measurement(&measurements, param) else {
                    tracing::warn!(
                        "NewZealandHilltopReader: no {param} measurement at '{station_id}'"
                    );
                    continue;
                };

                let url = format!(
                    "{base}?Service=Hilltop&Request=GetData&Site={}&Measurement={}&From={}&To={}",
                    percent_encode(site),
                    percent_encode(&chosen.request_as),
                    format_nz_time(req.from),
                    format_nz_time(req.to),
                );
                let body = match self.get_text(&url).await {
                    Ok(b) => b,
                    Err(e) => {
                        tracing::warn!(
                            "NewZealandHilltopReader: GetData for '{}': {e}",
                            req.source_id
                        );
                        continue;
                    }
                };
                let doc: GetDataDoc = match quick_xml::de::from_str(&body) {
                    Ok(d) => d,
                    Err(e) => {
                        tracing::warn!(
                            "NewZealandHilltopReader: GetData XML for '{}': {e}",
                            req.source_id
                        );
                        continue;
                    }
                };
                if let Some(err) = &doc.error {
                    // "No data from .. to .." is routine for a quiet window.
                    tracing::debug!(
                        "NewZealandHilltopReader: GetData for '{}': {err}",
                        req.source_id
                    );
                    continue;
                }
                let Some(measurement) = doc.measurement else { continue };

                // Units from the GetData response win; fall back to the
                // MeasurementList units.
                let units = measurement
                    .data_source
                    .as_ref()
                    .and_then(|ds| ds.item_info.as_ref())
                    .and_then(|ii| ii.units.clone())
                    .or_else(|| chosen.units.clone());
                let Some(factor) = units.as_deref().and_then(|u| unit_factor(param, u)) else {
                    tracing::warn!(
                        "NewZealandHilltopReader: unknown units {units:?} for '{}'",
                        req.source_id
                    );
                    continue;
                };

                let series = results.entry(req.source_id.clone()).or_default();
                for entry in measurement.data.map(|d| d.entries).unwrap_or_default() {
                    let (Some(t), Some(v)) = (entry.t.as_deref(), entry.i1.as_deref()) else {
                        continue;
                    };
                    let Some(ts) = parse_nz_time(t) else { continue };
                    let Ok(value) = v.trim().parse::<f64>() else { continue };
                    if ts <= req.from || ts > req.to {
                        continue;
                    }
                    series.push((ts, value * factor));
                }
                series.sort_by_key(|(ts, _)| *ts);
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_encodes_site_names() {
        assert_eq!(
            percent_encode("Buller Rv @ Te Kuha"),
            "Buller%20Rv%20%40%20Te%20Kuha"
        );
        assert_eq!(percent_encode("Stage (NIWA 1)"), "Stage%20%28NIWA%201%29");
    }

    #[test]
    fn parses_site_list_including_sites_without_coords() {
        // Trimmed from the real WCRC SiteList response.
        let xml = r#"<?xml version="1.0" ?>
<HilltopServer>
<Agency>West Coast Regional Council</Agency>
<Version>2404.2.2.62</Version>
<Site Name="Ahaura Rv @ Gorge WCRC">
<Latitude>-42.43452185</Latitude>
<Longitude>171.73061490</Longitude>
</Site>
<Site Name="Arnold Rv @ below dam">
</Site>
</HilltopServer>"#;
        let doc: SiteListDoc = quick_xml::de::from_str(xml).unwrap();
        assert!(doc.error.is_none());
        assert_eq!(doc.sites.len(), 2);
        assert_eq!(doc.sites[0].name, "Ahaura Rv @ Gorge WCRC");
        let lat: f64 = doc.sites[0].latitude.as_deref().unwrap().parse().unwrap();
        assert!((lat + 42.43452185).abs() < 1e-9);
        assert!(doc.sites[1].latitude.is_none());

        let err: SiteListDoc =
            quick_xml::de::from_str("<HilltopServer><Error>boom</Error></HilltopServer>").unwrap();
        assert_eq!(err.error.as_deref(), Some("boom"));
    }

    #[test]
    fn picks_live_sensor_over_stale_exact_match() {
        // Trimmed from the real "Buller Rv @ Te Kuha WCRC" MeasurementList:
        // plain "Stage" ended 2024, "Stage (bubbler 1)" is live.
        let xml = r#"<HilltopServer>
<Agency>West Coast Regional Council</Agency>
<DataSource Name="Water Level" Site="Buller Rv @ Te Kuha WCRC">
<TSType>StdSeries</TSType>
<From>2009-10-17T20:45:00</From>
<To>2024-10-21T13:35:00</To>
<Measurement Name="Stage"><RequestAs>Stage</RequestAs><Units>mm</Units></Measurement>
<Measurement Name="Flow"><RequestAs>Flow</RequestAs><Units>m3/sec</Units></Measurement>
<Measurement Name="Check Diff"><RequestAs>Check Diff</RequestAs><Units>mm</Units></Measurement>
</DataSource>
<DataSource Name="Water Level (bubbler 1)" Site="Buller Rv @ Te Kuha WCRC">
<TSType>StdSeries</TSType>
<From>2009-10-17T20:45:00</From>
<To>2026-08-14T20:30:00</To>
<Measurement Name="Stage (bubbler 1)"><RequestAs>Stage (bubbler 1)</RequestAs><Units>mm</Units></Measurement>
<Measurement Name="Flow (bubbler 1)"><RequestAs>Flow (bubbler 1)</RequestAs><Units>m3/sec</Units></Measurement>
</DataSource>
<DataSource Name="Water Level" Site="Buller Rv @ Te Kuha WCRC">
<TSType>StdQualSeries</TSType>
<To>2026-08-14T20:30:00</To>
</DataSource>
</HilltopServer>"#;
        let doc: MeasurementListDoc = quick_xml::de::from_str(xml).unwrap();
        let ms = flatten_measurement_list(&doc);
        assert_eq!(ms.len(), 5); // StdQualSeries block contributes none

        let w = pick_measurement(&ms, "W").unwrap();
        assert_eq!(w.request_as, "Stage (bubbler 1)");
        assert_eq!(w.units.as_deref(), Some("mm"));
        let q = pick_measurement(&ms, "Q").unwrap();
        assert_eq!(q.request_as, "Flow (bubbler 1)");
        // "Check Diff" and other derived series never match.
        assert_eq!(measurement_rank("W", "Gauging Stage Difference"), None);
        assert_eq!(measurement_rank("Q", "Specific Flow"), None);
        assert_eq!(measurement_rank("Q", "Flow NZDT"), Some(1));
    }

    #[test]
    fn parses_get_data_and_converts_nz_time_and_units() {
        // Trimmed from the real WCRC GetData response (stage in mm).
        let xml = r#"<?xml version="1.0" ?>
<Hilltop>
<Agency>West Coast Regional Council</Agency>
<Measurement SiteName="Buller Rv @ Te Kuha">
<DataSource Name="Water Level (NIWA 1)" NumItems="1">
<TSType>StdSeries</TSType>
<ItemInfo ItemNumber="1">
<ItemName>Stage (NIWA 1)</ItemName><ItemFormat>F</ItemFormat><Units>mm</Units><Format>####</Format>
</ItemInfo>
</DataSource>
<Data DateFormat="Calendar" NumItems="1">
<E><T>2026-08-13T00:00:00</T><I1>2192</I1></E>
<E><T>2026-08-13T00:05:00</T><I1>2189</I1></E>
</Data>
</Measurement>
</Hilltop>"#;
        let doc: GetDataDoc = quick_xml::de::from_str(xml).unwrap();
        let m = doc.measurement.unwrap();
        let units = m
            .data_source
            .as_ref()
            .and_then(|ds| ds.item_info.as_ref())
            .and_then(|ii| ii.units.as_deref())
            .unwrap();
        assert_eq!(units, "mm");
        let factor = unit_factor("W", units).unwrap();
        let entries = m.data.unwrap().entries;
        assert_eq!(entries.len(), 2);
        let v: f64 = entries[0].i1.as_deref().unwrap().parse().unwrap();
        assert!((v * factor - 219.2).abs() < 1e-9); // mm -> cm

        // August = NZST = UTC+12.
        let ts = parse_nz_time(entries[0].t.as_deref().unwrap()).unwrap();
        assert_eq!(ts.to_rfc3339(), "2026-08-12T12:00:00+00:00");
    }

    #[tokio::test]
    #[ignore]
    async fn live_smoke() {
        let reader = NewZealandHilltopReader::default();
        let stations = reader.list_stations().await.unwrap();
        println!("Hilltop stations: {}", stations.len());
        for (key, _) in COUNCILS {
            let n = stations
                .iter()
                .filter(|s| s.station_id.starts_with(&format!("{key}/")))
                .count();
            println!("  {key}: {n}");
        }
        let reqs = vec![
            FetchRequest {
                source_id: "wcrc/Buller Rv @ Te Kuha WCRC:W".into(),
                from: Utc::now() - chrono::Duration::hours(12),
                to: Utc::now(),
            },
            FetchRequest {
                source_id: "wcrc/Buller Rv @ Te Kuha WCRC:Q".into(),
                from: Utc::now() - chrono::Duration::hours(12),
                to: Utc::now(),
            },
            FetchRequest {
                source_id: "orc/Clutha River at Balclutha:Q".into(),
                from: Utc::now() - chrono::Duration::hours(12),
                to: Utc::now(),
            },
        ];
        let res = reader.fetch_all(&reqs).await.unwrap();
        for (k, v) in &res {
            println!("{k}: {} readings, last={:?}", v.len(), v.last());
        }
    }

    #[test]
    fn unit_factor_covers_common_hilltop_units() {
        assert_eq!(unit_factor("W", "mm"), Some(0.1));
        assert_eq!(unit_factor("W", "cm"), Some(1.0));
        assert_eq!(unit_factor("W", "m"), Some(100.0));
        assert_eq!(unit_factor("Q", "m3/sec"), Some(1.0));
        assert_eq!(unit_factor("Q", "m3/s"), Some(1.0));
        assert_eq!(unit_factor("Q", "l/s"), Some(0.001));
        assert_eq!(unit_factor("Q", "mg/l"), None);
    }
}
