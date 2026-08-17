use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, ReadingsBySource, SnapshotCache, StationInfo};

/// Reader for Catalonia's gauging network (ACA, Agencia Catalana de l'Aigua).
///
/// Source: https://aplicacions.aca.gencat.cat/sdim2/apirest (Sentilo API)
///
/// Two open JSON endpoints, no auth: `catalog?componentType=aforament` lists
/// every sensor with WGS84 coordinates and river name, and
/// `data/AFORAMENT-EST` returns the latest observation for every sensor in
/// one call. Latest values only - snapshot provider (`history_depth` =
/// `None`), 15-minute cadence upstream.
///
/// A component (station) carries separate sensors per parameter; sensor type
/// `0019` is river level in **cm**, `0014` is discharge in **m³/s**. Type
/// `0035` (l/s canal outflows) and any sensor described as a canal are
/// skipped - they are irrigation infrastructure, not river gauges.
///
/// License: ACA / Generalitat de Catalunya open data, attribute ACA.
///
/// `source_id` format: `"{component}:{param}"`
///   e.g. `"080060-001:W"` (river level, cm)
///        `"080060-001:Q"` (discharge, m³/s)
///
/// The snapshot (catalog + data, merged) is cached for [`CACHE_TTL`] so one
/// poll cycle costs two HTTP GETs total.
#[derive(Default)]
pub struct SpainAcaReader {
    cache: SnapshotCache<Vec<AcaStation>>,
}

const CATALOG_URL: &str =
    "https://aplicacions.aca.gencat.cat/sdim2/apirest/catalog?componentType=aforament";
const DATA_URL: &str = "https://aplicacions.aca.gencat.cat/sdim2/apirest/data/AFORAMENT-EST";
const CACHE_TTL: Duration = Duration::from_secs(300);

/// Sensor type key for river level (cm).
const TYPE_LEVEL: &str = "0019";
/// Sensor type key for river discharge (m³/s).
const TYPE_FLOW: &str = "0014";

/// One station's latest state, merged from the catalog and data endpoints.
#[derive(Debug, Clone)]
struct AcaStation {
    station_id: String,
    name: Option<String>,
    river: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    /// Latest water level in cm.
    level: Option<(DateTime<Utc>, f64)>,
    /// Latest discharge in m³/s.
    flow: Option<(DateTime<Utc>, f64)>,
}

#[derive(Deserialize)]
struct Catalog {
    #[serde(default)]
    providers: Vec<Provider>,
}

#[derive(Deserialize)]
struct Provider {
    #[serde(default)]
    sensors: Vec<Sensor>,
}

#[derive(Deserialize)]
struct Sensor {
    sensor: String,
    #[serde(default)]
    description: String,
    /// WGS84 "lat lon" as one space-separated string.
    #[serde(default)]
    location: String,
    #[serde(rename = "type")]
    sensor_type: String,
    component: String,
    #[serde(rename = "componentDesc", default)]
    component_desc: Option<String>,
    #[serde(rename = "componentAdditionalInfo", default)]
    component_additional_info: HashMap<String, serde_json::Value>,
}

#[derive(Deserialize)]
struct DataResponse {
    #[serde(default)]
    sensors: Vec<SensorData>,
}

#[derive(Deserialize)]
struct SensorData {
    sensor: String,
    #[serde(default)]
    observations: Vec<Observation>,
}

#[derive(Deserialize)]
struct Observation {
    /// Numeric value as a string, e.g. "0.221".
    value: String,
    /// Unix epoch milliseconds (UTC instant of the reading).
    time: i64,
}

/// Merge the sensor catalog and the latest-observation feed into stations.
fn build_stations(catalog: &str, data: &str) -> anyhow::Result<Vec<AcaStation>> {
    let catalog: Catalog = serde_json::from_str(catalog)
        .map_err(|e| anyhow::anyhow!("SpainAcaReader: catalog JSON parse error: {e}"))?;
    let data: DataResponse = serde_json::from_str(data)
        .map_err(|e| anyhow::anyhow!("SpainAcaReader: data JSON parse error: {e}"))?;

    // Latest observation per sensor id (the newest by timestamp).
    let mut latest: HashMap<&str, (DateTime<Utc>, f64)> = HashMap::new();
    for row in &data.sensors {
        for obs in &row.observations {
            let Some(ts) = DateTime::from_timestamp_millis(obs.time) else {
                continue;
            };
            let Ok(value) = obs.value.trim().parse::<f64>() else {
                tracing::warn!(
                    "SpainAcaReader: unparseable value '{}' for sensor {}",
                    obs.value,
                    row.sensor
                );
                continue;
            };
            let entry = latest.entry(row.sensor.as_str()).or_insert((ts, value));
            if ts > entry.0 {
                *entry = (ts, value);
            }
        }
    }

    let mut stations: HashMap<&str, AcaStation> = HashMap::new();
    for sensor in catalog.providers.iter().flat_map(|p| &p.sensors) {
        // River sensors only: skip canal infrastructure and other types.
        if sensor.description.to_lowercase().contains("canal") {
            continue;
        }
        if sensor.sensor_type != TYPE_LEVEL && sensor.sensor_type != TYPE_FLOW {
            continue;
        }

        let station = stations
            .entry(sensor.component.as_str())
            .or_insert_with(|| {
                let mut coords = sensor.location.split_whitespace();
                let latitude = coords.next().and_then(|s| s.parse().ok());
                let longitude = coords.next().and_then(|s| s.parse().ok());
                AcaStation {
                    station_id: sensor.component.clone(),
                    name: sensor.component_desc.clone(),
                    river: sensor
                        .component_additional_info
                        .get("Riu")
                        .and_then(|v| v.as_str())
                        .map(str::to_owned),
                    latitude,
                    longitude,
                    level: None,
                    flow: None,
                }
            });

        let reading = latest.get(sensor.sensor.as_str()).copied();
        if sensor.sensor_type == TYPE_LEVEL {
            station.level = station.level.or(reading);
        } else {
            station.flow = station.flow.or(reading);
        }
    }

    let mut out: Vec<AcaStation> = stations.into_values().collect();
    out.sort_by(|a, b| a.station_id.cmp(&b.station_id));
    Ok(out)
}

impl SpainAcaReader {
    async fn get_snapshot(&self) -> anyhow::Result<Vec<AcaStation>> {
        let mut guard = self.cache.lock().await;

        if let Some((fetched_at, ref stations)) = *guard {
            if fetched_at.elapsed() < CACHE_TTL {
                return Ok(stations.clone());
            }
        }

        let catalog = Self::get_text(CATALOG_URL).await?;
        let data = Self::get_text(DATA_URL).await?;
        let stations = build_stations(&catalog, &data)?;

        *guard = Some((Instant::now(), stations.clone()));
        Ok(stations)
    }

    async fn get_text(url: &str) -> anyhow::Result<String> {
        reqwest::get(url)
            .await
            .map_err(|e| anyhow::anyhow!("SpainAcaReader: HTTP error for {url}: {e}"))?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("SpainAcaReader: server error for {url}: {e}"))?
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("SpainAcaReader: read error for {url}: {e}"))
    }
}

impl GaugeReader for SpainAcaReader {
    fn provider_key(&self) -> &'static str {
        "aca"
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let snapshot = self.get_snapshot().await?;

            Ok(snapshot
                .into_iter()
                .filter_map(|s| {
                    let mut params = Vec::new();
                    if s.level.is_some() {
                        params.push("W".to_owned());
                    }
                    if s.flow.is_some() {
                        params.push("Q".to_owned());
                    }
                    // A station whose sensors report nothing right now is
                    // still listed by the catalog; skip it.
                    if params.is_empty() {
                        return None;
                    }
                    Some(StationInfo {
                        station_id: s.station_id,
                        name: s.name,
                        river: s.river,
                        latitude: s.latitude,
                        longitude: s.longitude,
                        params,
                    })
                })
                .collect())
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<ReadingsBySource>> {
        Box::pin(async move {
            if requests.is_empty() {
                return Ok(HashMap::new());
            }

            let snapshot = match self.get_snapshot().await {
                Ok(s) => s,
                Err(err) => {
                    tracing::error!("SpainAcaReader: failed to fetch snapshot: {err}");
                    return Ok(HashMap::new());
                }
            };
            let by_id: HashMap<&str, &AcaStation> = snapshot
                .iter()
                .map(|s| (s.station_id.as_str(), s))
                .collect();

            let mut results: ReadingsBySource = HashMap::new();
            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!("SpainAcaReader: malformed source_id '{}'", req.source_id);
                    continue;
                };
                let Some(station) = by_id.get(station_id) else {
                    tracing::warn!("SpainAcaReader: unknown station '{station_id}'");
                    continue;
                };
                let reading = match param {
                    "W" => station.level,
                    "Q" => station.flow,
                    other => {
                        tracing::warn!(
                            "SpainAcaReader: unknown param '{other}' in source_id '{}'",
                            req.source_id
                        );
                        continue;
                    }
                };
                if let Some((ts, value)) = reading {
                    if ts > req.from && ts <= req.to {
                        results.insert(req.source_id.clone(), vec![(ts, value)]);
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
    use crate::GaugeReader;

    // Trimmed from live catalog?componentType=aforament (2026-08-15).
    const SAMPLE_CATALOG: &str = r#"{
        "providers": [{
            "provider": "ACA",
            "sensors": [
                {"sensor":"080060-001-ANA01","description":"Nivell riu",
                 "location":"41.592783082 2.542640569","type":"0019","unit":"cm",
                 "timeZone":"CET","component":"080060-001",
                 "componentDesc":"Arenys de Munt (riera d'Arenys)",
                 "componentAdditionalInfo":{"Riu":"RIERA ARENYS"}},
                {"sensor":"CALC001658","description":"Cabal riu",
                 "location":"41.592783082 2.542640569","type":"0014","unit":"m³/s",
                 "timeZone":"CET","component":"080060-001",
                 "componentDesc":"Arenys de Munt (riera d'Arenys)",
                 "componentAdditionalInfo":{"Riu":"RIERA ARENYS"}},
                {"sensor":"CANAL-01","description":"Cabal canal",
                 "location":"41.5 2.5","type":"0014","unit":"m³/s",
                 "timeZone":"CET","component":"CANAL-C1",
                 "componentDesc":"Canal (Llobregat)",
                 "componentAdditionalInfo":{}},
                {"sensor":"OUT-01","description":"Cabal total",
                 "location":"41.5 2.5","type":"0035","unit":"l/s",
                 "timeZone":"CET","component":"OUT-C1",
                 "componentDesc":"Sortida embassament",
                 "componentAdditionalInfo":{}}
            ]
        }]
    }"#;

    // Trimmed from live data/AFORAMENT-EST.
    const SAMPLE_DATA: &str = r#"{
        "sensors": [
            {"sensor":"080060-001-ANA01","observations":
                [{"value":"0.221","timestamp":"15/08/2026T13:30:00","time":1786800600000}]},
            {"sensor":"CALC001658","observations":
                [{"value":"0.005","timestamp":"15/08/2026T13:30:00","time":1786800600000}]},
            {"sensor":"CANAL-01","observations":
                [{"value":"1.5","timestamp":"15/08/2026T13:30:00","time":1786800600000}]}
        ]
    }"#;

    #[test]
    fn merges_catalog_and_data_and_filters_canals() {
        let stations = build_stations(SAMPLE_CATALOG, SAMPLE_DATA).expect("parses");
        // Canal and l/s sensors are dropped, leaving one merged station.
        assert_eq!(stations.len(), 1);
        let s = &stations[0];
        assert_eq!(s.station_id, "080060-001");
        assert_eq!(s.name.as_deref(), Some("Arenys de Munt (riera d'Arenys)"));
        assert_eq!(s.river.as_deref(), Some("RIERA ARENYS"));
        assert_eq!(s.latitude, Some(41.592783082));
        assert_eq!(s.longitude, Some(2.542640569));
        let (level_ts, level) = s.level.expect("has level");
        assert_eq!(level, 0.221);
        assert_eq!(level_ts.to_rfc3339(), "2026-08-15T13:30:00+00:00");
        let (_, flow) = s.flow.expect("has flow");
        assert_eq!(flow, 0.005);
    }

    #[test]
    fn station_without_readings_keeps_catalog_metadata() {
        let stations = build_stations(SAMPLE_CATALOG, r#"{"sensors":[]}"#).expect("parses");
        assert_eq!(stations.len(), 1);
        assert!(stations[0].level.is_none());
        assert!(stations[0].flow.is_none());
    }

    #[test]
    fn source_id_param_is_last_segment() {
        let (station, param) = "080060-001:W".rsplit_once(':').expect("should split");
        assert_eq!(station, "080060-001");
        assert_eq!(param, "W");
    }

    #[tokio::test]
    #[ignore = "live network access"]
    async fn live_smoke() {
        let reader = SpainAcaReader::default();
        let stations = reader.list_stations().await.expect("list_stations works");
        assert!(
            stations.len() > 50,
            "expected 50+ stations, got {}",
            stations.len()
        );
        assert!(stations.iter().all(|s| s.latitude.is_some()));

        let now = Utc::now();
        let requests: Vec<FetchRequest> = stations
            .iter()
            .take(10)
            .flat_map(|s| {
                s.params.iter().map(|p| FetchRequest {
                    source_id: format!("{}:{}", s.station_id, p),
                    from: now - chrono::Duration::hours(6),
                    to: now,
                })
            })
            .collect();
        let results = reader.fetch_all(&requests).await.expect("fetch_all works");
        assert!(
            results.values().any(|r| !r.is_empty()),
            "expected at least one reading"
        );
    }
}
