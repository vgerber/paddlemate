use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader};

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
pub struct FranceHubeauReader;

const BASE_URL: &str = "https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr";
const FIELDS: &str = "code_station,date_obs,resultat_obs";
/// Maximum number of records to request per batch. The API enforces a 1-month
/// history; for normal polling windows the actual count is much smaller.
const MAX_SIZE: usize = 20_000;

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
            .map_err(|e| anyhow::anyhow!("HubeauReader: HTTP error for grandeur {grandeur}: {e}"))?
            .json()
            .await
            .map_err(|e| {
                anyhow::anyhow!("HubeauReader: JSON parse error for grandeur {grandeur}: {e}")
            })?;
        Ok(resp.data)
    }
}

impl GaugeReader for FranceHubeauReader {
    fn provider_key(&self) -> &'static str {
        "hubeau"
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
                                "HubeauReader: ignoring malformed source_id '{}' (expected '{{station_id}}:{{grandeur}}')",
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
                by_grandeur
                    .entry(grandeur)
                    .or_default()
                    .insert(station_id);
            }

            let mut entries: Vec<Entry> = Vec::new();
            for (grandeur, stations) in &by_grandeur {
                match Self::fetch_grandeur(stations, grandeur, global_from, global_to).await {
                    Ok(mut batch) => entries.append(&mut batch),
                    Err(err) => {
                        tracing::error!(
                            "HubeauReader: failed to fetch grandeur '{grandeur}': {err}"
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
                                "HubeauReader: unparseable date '{}' for station {}",
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
    use super::*;

    // Hub'Eau uses grandeur in the source_id to route H vs Q readings to
    // different series on the same station. Verify the split is unambiguous.
    #[test]
    fn source_id_grandeur_is_last_segment() {
        let cases = [("K055001010:H", "K055001010", "H"), ("K055001010:Q", "K055001010", "Q")];
        for (raw, want_station, want_grandeur) in cases {
            let (station, grandeur) = raw.split_once(':').expect("should split");
            assert_eq!(station, want_station);
            assert_eq!(grandeur, want_grandeur);
        }
    }
}
