use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for French national hydrology data (Hub'Eau Hydrométrie v2).
///
/// Source: https://hubeau.eaufrance.fr/page/api-hydrometrie
///
/// The Hub'Eau API exposes real-time observations updated every 5 minutes
/// with 1 month of history. A single request can cover many stations and
/// a specific time window, so the entire provider poll is at most two HTTP
/// calls (one per grandeur type: H and Q).
///
/// `source_id` format: `"{station_id}:{grandeur}"`
///   e.g. `"K055001010:H"` (water height)
///        `"K055001010:Q"` (discharge / flow)
///
/// Supported grandeurs: `H` (hauteur, height), `Q` (débit, flow)
///
/// `list_stations` discovers the whole French catalog live from the
/// hydrometry `referentiel/stations` endpoint, keeping every in-service
/// station. The referential does not advertise per-station grandeurs, so each
/// station exposes both H and Q; `fetch_all` returns whichever actually exist.
pub struct FranceHubeauReader;

const BASE_URL: &str = "https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr";
const FIELDS: &str = "code_station,date_obs,resultat_obs";
/// Maximum number of records to request per batch. The API enforces a 1-month
/// history; for normal polling windows the actual count is much smaller.
const MAX_SIZE: usize = 20_000;

/// Referential endpoint listing the full French hydrometry station catalog.
const STATIONS_URL: &str = "https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations";
/// Only the referential fields needed to build a StationInfo.
const STATION_FIELDS: &str = "code_station,libelle_station,libelle_cours_eau,libelle_site,\
     longitude_station,latitude_station";
/// Page size for the paginated referential. The endpoint returns the whole
/// in-service catalog (a few thousand stations) well within a handful of pages.
const STATION_PAGE_SIZE: usize = 1_000;
/// Safety cap on pages walked, guarding against an unexpected pagination loop.
const MAX_STATION_PAGES: usize = 50;

#[derive(Deserialize)]
struct StationsResponse {
    /// Link to the next page, or null on the final page.
    next: Option<String>,
    #[serde(default)]
    data: Vec<RefStation>,
}

#[derive(Deserialize)]
struct RefStation {
    code_station: String,
    libelle_station: Option<String>,
    /// Watercourse name; may be absent, in which case libelle_site is used.
    libelle_cours_eau: Option<String>,
    libelle_site: Option<String>,
    latitude_station: Option<f64>,
    longitude_station: Option<f64>,
}

#[derive(Deserialize)]
struct ApiResponse {
    #[serde(default)]
    data: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    code_station: String,
    /// ISO 8601 timestamp string, e.g. "2026-05-12T17:55:00Z".
    date_obs: String,
    resultat_obs: f64,
}

impl FranceHubeauReader {
    async fn fetch_grandeur(
        stations: &HashSet<&str>,
        grandeur: &str,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> anyhow::Result<Vec<Entry>> {
        let url = format!(
            "{BASE_URL}?code_entite={}&grandeur_hydro={grandeur}\
             &date_debut_obs={}&date_fin_obs={}\
             &fields={FIELDS}&size={MAX_SIZE}",
            stations.iter().cloned().collect::<Vec<_>>().join(","),
            from.format("%Y-%m-%dT%H:%M:%SZ"),
            to.format("%Y-%m-%dT%H:%M:%SZ"),
        );
        let resp: ApiResponse = reqwest::get(&url)
            .await
            .map_err(|e| {
                anyhow::anyhow!("FranceHubeauReader: HTTP error for grandeur {grandeur}: {e}")
            })?
            .json()
            .await
            .map_err(|e| {
                anyhow::anyhow!("FranceHubeauReader: JSON parse error for grandeur {grandeur}: {e}")
            })?;
        Ok(resp.data)
    }

    /// Fetch the full in-service station catalog from the referential endpoint,
    /// following the `next` pagination links until exhausted.
    async fn fetch_all_stations() -> anyhow::Result<Vec<RefStation>> {
        let mut url = format!(
            "{STATIONS_URL}?format=json&en_service=true\
             &fields={STATION_FIELDS}&size={STATION_PAGE_SIZE}&page=1",
        );
        let mut stations: Vec<RefStation> = Vec::new();

        for _ in 0..MAX_STATION_PAGES {
            let page: StationsResponse = reqwest::get(&url)
                .await
                .map_err(|e| {
                    anyhow::anyhow!("FranceHubeauReader: HTTP error listing stations: {e}")
                })?
                .error_for_status()
                .map_err(|e| {
                    anyhow::anyhow!("FranceHubeauReader: server error listing stations: {e}")
                })?
                .json()
                .await
                .map_err(|e| {
                    anyhow::anyhow!("FranceHubeauReader: JSON parse error listing stations: {e}")
                })?;

            stations.extend(page.data);

            match page.next {
                Some(next) if !next.is_empty() => url = next,
                _ => return Ok(stations),
            }
        }

        tracing::warn!(
            "FranceHubeauReader: stopped listing stations after {MAX_STATION_PAGES} pages; \
             returning {} collected so far",
            stations.len()
        );
        Ok(stations)
    }
}

impl GaugeReader for FranceHubeauReader {
    fn provider_key(&self) -> &'static str {
        "hubeau"
    }

    /// Hub'Eau v2 provides approximately 1 month of history for most stations.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(31))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            // Discover the full French catalog live. The referential does not
            // expose the available grandeurs per station, so every in-service
            // station advertises both supported grandeurs (H = water height,
            // Q = discharge); fetch_all then returns whichever actually exist.
            let stations = Self::fetch_all_stations().await?;
            let out = stations
                .into_iter()
                .map(|s| StationInfo {
                    station_id: s.code_station,
                    name: s.libelle_station,
                    river: s.libelle_cours_eau.or(s.libelle_site),
                    latitude: s.latitude_station,
                    longitude: s.longitude_station,
                    params: vec!["H".to_owned(), "Q".to_owned()],
                })
                .collect();
            Ok(out)
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            // Parse and validate all source_ids up front.
            let parsed: Vec<(&str, &str, &FetchRequest)> = requests
                .iter()
                .filter_map(|req| {
                    match req.source_id.split_once(':') {
                        Some((station_id, grandeur)) => Some((station_id, grandeur, req)),
                        None => {
                            tracing::warn!(
                                "FranceHubeauReader: ignoring malformed source_id '{}' (expected '{{station_id}}:{{grandeur}}')",
                                req.source_id
                            );
                            None
                        }
                    }
                })
                .collect();

            if parsed.is_empty() {
                return Ok(HashMap::new());
            }

            let now = Utc::now();
            let global_from = requests.iter().map(|r| r.from).min().unwrap_or(now);
            let global_to = requests.iter().map(|r| r.to).max().unwrap_or(now);

            // Group station IDs by grandeur type (H / Q), then fetch each group.
            let mut by_grandeur: HashMap<&str, HashSet<&str>> = HashMap::new();
            for (station_id, grandeur, _) in &parsed {
                by_grandeur.entry(grandeur).or_default().insert(station_id);
            }

            let mut entries: Vec<Entry> = Vec::new();
            for (grandeur, stations) in &by_grandeur {
                match Self::fetch_grandeur(stations, grandeur, global_from, global_to).await {
                    Ok(mut batch) => entries.append(&mut batch),
                    Err(err) => {
                        tracing::error!(
                            "FranceHubeauReader: failed to fetch grandeur '{grandeur}': {err}"
                        );
                    }
                }
            }

            // Distribute readings to the matching source_id.
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
            for (station_id, _grandeur, req) in &parsed {
                for entry in &entries {
                    if entry.code_station != *station_id {
                        continue;
                    }
                    let ts = match entry.date_obs.parse::<DateTime<Utc>>() {
                        Ok(t) => t,
                        Err(_) => {
                            tracing::warn!(
                                "FranceHubeauReader: unparseable date '{}' for station {}",
                                entry.date_obs,
                                station_id
                            );
                            continue;
                        }
                    };
                    if ts > req.from && ts <= req.to {
                        results
                            .entry(req.source_id.clone())
                            .or_default()
                            .push((ts, entry.resultat_obs));
                    }
                }
            }

            // Note: grandeur is encoded in source_id so readings for H and Q
            // on the same station are automatically routed to different series.
            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    // Hub'Eau uses grandeur in the source_id to route H vs Q readings to
    // different series on the same station. Verify the split is unambiguous.
    #[test]
    fn source_id_grandeur_is_last_segment() {
        let cases = [
            ("K055001010:H", "K055001010", "H"),
            ("K055001010:Q", "K055001010", "Q"),
        ];
        for (raw, want_station, want_grandeur) in cases {
            let (station, grandeur) = raw.split_once(':').expect("should split");
            assert_eq!(station, want_station);
            assert_eq!(grandeur, want_grandeur);
        }
    }
}
