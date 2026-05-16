use std::collections::HashMap;

use chrono::{DateTime, Duration, TimeZone, Utc};
use reqwest::header::{ACCEPT, HeaderMap, HeaderValue};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Rivermap API (v2).
///
/// Docs: https://api.rivermap.org/
///
/// Authentication uses API key via `X-Key` header.
/// The reader expects `RIVERMAP_API_KEY`.
///
/// `source_id` format: `"{station_uuid}:{param}"`
/// - `param = W` maps to Rivermap unit `cm` (level)
/// - `param = Q` maps to Rivermap unit `m3s` (flow)
#[derive(Debug, Clone)]
pub struct RivermapReader {
    client: reqwest::Client,
    api_key: Option<String>,
}

const BASE_URL: &str = "https://api.rivermap.org/v2";
const MAX_RANGE_MINUTES: i64 = 360;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RivermapSource {
    pub id: String,
    pub name: String,
    #[serde(rename = "shortName")]
    pub short_name: Option<String>,
    #[serde(rename = "licensingTerms")]
    pub licensing_terms: Option<String>,
    pub website: Option<String>,
    #[serde(rename = "countryCode")]
    pub country_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RivermapStation {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub sensors: Vec<String>,
    #[serde(default)]
    pub river: HashMap<String, String>,
    #[serde(default)]
    pub latlng: Option<Vec<i64>>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    #[serde(rename = "countryCode")]
    pub country_code: Option<String>,
    #[serde(default)]
    #[serde(rename = "isActive")]
    pub is_active: bool,
    #[serde(rename = "type")]
    pub station_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RivermapSectionBundle {
    #[serde(default)]
    pub sections: Vec<serde_json::Value>,
    #[serde(default)]
    pub rivers: Vec<serde_json::Value>,
    #[serde(default)]
    pub regions: Vec<serde_json::Value>,
    #[serde(default)]
    pub pois: Vec<serde_json::Value>,
    #[serde(default)]
    #[serde(rename = "userNotes")]
    pub user_notes: Vec<serde_json::Value>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    #[serde(rename = "elapsedMs")]
    pub elapsed_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RivermapUserNote {
    pub id: String,
    #[serde(default)]
    #[serde(rename = "riverSectionId")]
    pub river_section_id: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub note: HashMap<String, String>,
    #[serde(default)]
    pub translations: HashMap<String, String>,
    #[serde(default)]
    #[serde(rename = "createdTs")]
    pub created_ts: Option<i64>,
    #[serde(default)]
    #[serde(rename = "revisionTs")]
    pub revision_ts: Option<i64>,
    #[serde(default)]
    #[serde(rename = "refPoiUuid", alias = "refPoiId")]
    pub ref_poi_uuid: Option<String>,
    #[serde(default)]
    #[serde(rename = "refNoteUuid", alias = "refNoteId")]
    pub ref_note_uuid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RivermapReadingsRange {
    #[serde(default)]
    pub cm: Vec<RivermapTimestampedValue>,
    #[serde(default)]
    pub m3s: Vec<RivermapTimestampedValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RivermapTimestampedValue {
    pub ts: i64,
    pub v: f64,
}

#[derive(Deserialize)]
struct SourcesResponse {
    #[serde(default)]
    sources: Vec<RivermapSource>,
}

#[derive(Deserialize)]
struct StationsResponse {
    #[serde(default)]
    stations: Vec<RivermapStation>,
}

#[derive(Deserialize)]
struct AllReadingsResponse {
    #[serde(default)]
    readings: HashMap<String, RivermapReadingsRange>,
}

#[derive(Deserialize)]
struct StationReadingsResponse {
    #[serde(default)]
    readings: HashMap<String, Vec<RivermapTimestampedValue>>,
}

#[derive(Deserialize)]
struct NotesResponse {
    #[serde(default)]
    notes: Vec<RivermapUserNote>,
}

impl Default for RivermapReader {
    fn default() -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key: std::env::var("RIVERMAP_API_KEY").ok(),
        }
    }
}

impl RivermapReader {
    fn auth_headers(&self, api_key: &str) -> anyhow::Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(
            "X-Key",
            HeaderValue::from_str(api_key)
                .map_err(|e| anyhow::anyhow!("RivermapReader: invalid API key characters: {e}"))?,
        );
        Ok(headers)
    }

    fn api_key(&self) -> anyhow::Result<&str> {
        self.api_key.as_deref().ok_or_else(|| {
            anyhow::anyhow!("RivermapReader: missing API key (set RIVERMAP_API_KEY)")
        })
    }

    async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> anyhow::Result<T> {
        let api_key = self.api_key()?;
        let url = format!("{BASE_URL}{path}");

        let mut req = self.client.get(&url).headers(self.auth_headers(api_key)?);
        if !query.is_empty() {
            req = req.query(query);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("RivermapReader: request error for {url}: {e}"))?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("RivermapReader: server error for {url}: {e}"))?;

        let body = resp
            .text()
            .await
            .map_err(|e| anyhow::anyhow!("RivermapReader: read body error for {url}: {e}"))?;

        serde_json::from_str::<T>(&body).map_err(|e| {
            let preview = body.chars().take(200).collect::<String>();
            anyhow::anyhow!("RivermapReader: JSON parse error for {url}: {e} — body: {preview:?}")
        })
    }

    fn format_api_datetime(ts: DateTime<Utc>) -> String {
        ts.format("%Y%m%d%H%M").to_string()
    }

    fn unit_for_param(param: &str) -> Option<&'static str> {
        match param {
            "W" => Some("cm"),
            "Q" => Some("m3s"),
            _ => None,
        }
    }

    fn sensor_to_param(sensor: &str) -> Option<&'static str> {
        match sensor {
            "level" => Some("W"),
            "flow" => Some("Q"),
            _ => None,
        }
    }

    fn parse_source_id(source_id: &str) -> Option<(&str, &str)> {
        source_id.split_once(':')
    }

    fn river_name(preferred: &HashMap<String, String>) -> Option<String> {
        preferred
            .get("en")
            .or_else(|| preferred.get("it"))
            .or_else(|| preferred.get("de"))
            .or_else(|| preferred.values().next())
            .cloned()
    }

    fn lat_lng(latlng: Option<&Vec<i64>>) -> (Option<f64>, Option<f64>) {
        match latlng {
            Some(v) if v.len() == 2 => (
                Some(v[0] as f64 / 1_000_000.0),
                Some(v[1] as f64 / 1_000_000.0),
            ),
            _ => (None, None),
        }
    }

    fn window_chunks(
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Vec<(DateTime<Utc>, DateTime<Utc>)> {
        if to <= from {
            return vec![(from, to)];
        }

        let mut chunks = Vec::new();
        let mut start = from;
        let step = Duration::minutes(MAX_RANGE_MINUTES);
        while start < to {
            let end = (start + step).min(to);
            chunks.push((start, end));
            start = end;
        }
        chunks
    }

    /// List all data sources (`GET /v2/sources`).
    pub async fn list_sources(&self) -> anyhow::Result<Vec<RivermapSource>> {
        let resp: SourcesResponse = self.get_json("/sources", &[]).await?;
        Ok(resp.sources)
    }

    /// List stations using optional filters (`GET /v2/stations`).
    pub async fn list_stations_raw(
        &self,
        status: Option<&str>,
        station_type: Option<&str>,
    ) -> anyhow::Result<Vec<RivermapStation>> {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(status) = status {
            query.push(("status", status.to_string()));
        }
        if let Some(station_type) = station_type {
            query.push(("type", station_type.to_string()));
        }

        let resp: StationsResponse = self.get_json("/stations", &query).await?;
        Ok(resp.stations)
    }

    /// List all section-related objects (`GET /v2/sections`).
    pub async fn list_sections(&self) -> anyhow::Result<RivermapSectionBundle> {
        self.get_json("/sections", &[]).await
    }

    /// List recent notes (`GET /v2/notes`).
    pub async fn list_recent_notes(
        &self,
        from_minutes: Option<i64>,
    ) -> anyhow::Result<Vec<RivermapUserNote>> {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(from) = from_minutes {
            query.push(("from", from.to_string()));
        }

        let resp: NotesResponse = self.get_json("/notes", &query).await?;
        Ok(resp.notes)
    }

    /// Fetch readings for all active stations (`GET /v2/stations/readings`).
    pub async fn get_all_station_readings(
        &self,
        from_minutes: Option<i64>,
        to_minutes: Option<i64>,
    ) -> anyhow::Result<HashMap<String, RivermapReadingsRange>> {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(from) = from_minutes {
            query.push(("from", from.to_string()));
        }
        if let Some(to) = to_minutes {
            query.push(("to", to.to_string()));
        }

        let resp: AllReadingsResponse = self.get_json("/stations/readings", &query).await?;
        Ok(resp.readings)
    }

    /// List notes for a specific section (`GET /v2/sections/:sectionId/notes`).
    pub async fn list_section_notes(
        &self,
        section_id: &str,
        from_minutes: Option<i64>,
    ) -> anyhow::Result<Vec<RivermapUserNote>> {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(from) = from_minutes {
            query.push(("from", from.to_string()));
        }

        let path = format!("/sections/{section_id}/notes");
        let resp: NotesResponse = self.get_json(&path, &query).await?;
        Ok(resp.notes)
    }

    /// Fetch station readings (`GET /v2/stations/:stationId/readings`).
    pub async fn get_station_readings(
        &self,
        station_id: &str,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>> {
        let mut by_unit: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();

        for (chunk_from, chunk_to) in Self::window_chunks(from, to) {
            let path = format!("/stations/{station_id}/readings");
            let query = vec![
                ("from", Self::format_api_datetime(chunk_from)),
                ("to", Self::format_api_datetime(chunk_to)),
            ];
            let response: StationReadingsResponse = self.get_json(&path, &query).await?;

            for (unit, readings) in response.readings {
                let series = by_unit.entry(unit).or_default();
                for reading in readings {
                    if let Some(ts) = Utc.timestamp_opt(reading.ts, 0).single() {
                        series.push((ts, reading.v));
                    }
                }
            }
        }

        for series in by_unit.values_mut() {
            series.sort_unstable_by_key(|(ts, _)| *ts);
            series.dedup_by_key(|(ts, _)| *ts);
        }

        Ok(by_unit)
    }
}

impl GaugeReader for RivermapReader {
    fn provider_key(&self) -> &'static str {
        "rivermap"
    }

    // Rivermap station reading endpoints cap each query range to 6 hours.
    fn history_depth(&self) -> Option<Duration> {
        Some(Duration::minutes(MAX_RANGE_MINUTES))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            if self.api_key.is_none() {
                tracing::warn!(
                    "RivermapReader: RIVERMAP_API_KEY is not set; list_stations returns empty"
                );
                return Ok(vec![]);
            }

            let stations = self
                .list_stations_raw(Some("active"), Some("online"))
                .await?;

            let result = stations
                .into_iter()
                .filter(|s| s.is_active)
                .map(|station| {
                    let params: Vec<String> = station
                        .sensors
                        .iter()
                        .filter_map(|sensor| Self::sensor_to_param(sensor).map(ToOwned::to_owned))
                        .collect();
                    let (latitude, longitude) = Self::lat_lng(station.latlng.as_ref());

                    StationInfo {
                        station_id: station.id,
                        name: Some(station.name),
                        river: Self::river_name(&station.river),
                        latitude,
                        longitude,
                        params,
                    }
                })
                .filter(|s| !s.params.is_empty())
                .collect();

            Ok(result)
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            if self.api_key.is_none() {
                tracing::warn!(
                    "RivermapReader: RIVERMAP_API_KEY is not set; fetch_all returns empty"
                );
                return Ok(HashMap::new());
            }

            let mut by_station: HashMap<&str, (DateTime<Utc>, DateTime<Utc>)> = HashMap::new();
            for req in requests {
                let Some((station_id, _param)) = Self::parse_source_id(&req.source_id) else {
                    tracing::warn!(
                        "RivermapReader: ignoring malformed source_id '{}'",
                        req.source_id
                    );
                    continue;
                };

                by_station
                    .entry(station_id)
                    .and_modify(|(from, to)| {
                        *from = (*from).min(req.from);
                        *to = (*to).max(req.to);
                    })
                    .or_insert((req.from, req.to));
            }

            let mut station_data: HashMap<&str, HashMap<String, Vec<(DateTime<Utc>, f64)>>> =
                HashMap::new();
            for (station_id, (from, to)) in by_station {
                match self.get_station_readings(station_id, from, to).await {
                    Ok(readings) => {
                        station_data.insert(station_id, readings);
                    }
                    Err(err) => {
                        tracing::warn!(
                            "RivermapReader: failed to fetch readings for station {station_id}: {err}"
                        );
                    }
                }
            }

            let mut result: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
            for req in requests {
                let Some((station_id, param)) = Self::parse_source_id(&req.source_id) else {
                    continue;
                };
                let Some(unit) = Self::unit_for_param(param) else {
                    tracing::warn!(
                        "RivermapReader: unsupported param '{}' in source_id '{}'",
                        param,
                        req.source_id
                    );
                    continue;
                };
                let Some(station_readings) = station_data.get(station_id) else {
                    continue;
                };
                let Some(series) = station_readings.get(unit) else {
                    continue;
                };

                let out = result.entry(req.source_id.clone()).or_default();
                for (ts, value) in series {
                    if *ts >= req.from && *ts <= req.to {
                        out.push((*ts, *value));
                    }
                }
                out.sort_unstable_by_key(|(ts, _)| *ts);
                out.dedup_by_key(|(ts, _)| *ts);
            }

            Ok(result)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn parse_source_id_splits_station_and_param() {
        let (station, param) = RivermapReader::parse_source_id("abc-uuid:W").expect("valid split");
        assert_eq!(station, "abc-uuid");
        assert_eq!(param, "W");
    }

    #[test]
    fn format_api_datetime_uses_expected_layout() {
        let ts = Utc.with_ymd_and_hms(2026, 5, 16, 12, 34, 0).unwrap();
        assert_eq!(RivermapReader::format_api_datetime(ts), "202605161234");
    }

    #[test]
    fn station_sensor_mapping_matches_storage_units() {
        assert_eq!(RivermapReader::sensor_to_param("level"), Some("W"));
        assert_eq!(RivermapReader::sensor_to_param("flow"), Some("Q"));
        assert_eq!(RivermapReader::unit_for_param("W"), Some("cm"));
        assert_eq!(RivermapReader::unit_for_param("Q"), Some("m3s"));
        assert_eq!(RivermapReader::unit_for_param("WT"), None);
    }

    #[test]
    fn lat_lng_decodes_microdegrees() {
        let (lat, lng) = RivermapReader::lat_lng(Some(&vec![46817197, 11935257]));
        assert_eq!(lat, Some(46.817197));
        assert_eq!(lng, Some(11.935257));
    }
}
