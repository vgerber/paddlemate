// Smoke-poll one live gauge from every provider: list stations, then fetch
// readings for the first station that returns data (some stations are dormant).
// Run from the api/ dir: cargo run --example poll_providers -p river-gauge
use std::time::Duration as StdDuration;

use chrono::{Duration, Utc};
use river_gauge::{FetchRequest, build_registry};

// USGS lists ~16k stations via a name-lookup join, taking well over a minute.
const LIST_TIMEOUT: StdDuration = StdDuration::from_secs(150);
const FETCH_TIMEOUT: StdDuration = StdDuration::from_secs(30);
/// How many stations to try before giving up on finding a live reading.
const MAX_TRIES: usize = 15;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Loads RIVERMAP_API_KEY etc. when run from the api/ directory.
    dotenvy::dotenv().ok();

    let now = Utc::now();
    let from = now - Duration::days(3);
    let to = now + Duration::hours(2);

    for reader in build_registry() {
        let key = reader.provider_key();

        let stations = match tokio::time::timeout(LIST_TIMEOUT, reader.list_stations()).await {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => {
                println!("{key:<10} list_stations error: {e}");
                continue;
            }
            Err(_) => {
                println!("{key:<10} list_stations timed out");
                continue;
            }
        };

        if stations.is_empty() {
            println!("{key:<10} no station listing (snapshot-only or missing API key)");
            continue;
        }

        let mut reading = None;
        for station in stations.iter().take(MAX_TRIES) {
            let requests: Vec<FetchRequest> = station
                .params
                .iter()
                .map(|param| FetchRequest {
                    source_id: format!("{}:{}", station.station_id, param),
                    from,
                    to,
                })
                .collect();
            if requests.is_empty() {
                continue;
            }
            let fetched =
                match tokio::time::timeout(FETCH_TIMEOUT, reader.fetch_all(&requests)).await {
                    Ok(Ok(map)) => map,
                    Ok(Err(e)) => {
                        println!("{key:<10} fetch error: {e}");
                        break;
                    }
                    Err(_) => {
                        println!("{key:<10} fetch timed out");
                        break;
                    }
                };
            if let Some((source_id, series)) = fetched.iter().find(|(_, v)| !v.is_empty()) {
                let (ts, value) = *series.last().unwrap();
                reading = Some((station.clone(), source_id.clone(), ts, value));
                break;
            }
        }

        match reading {
            Some((station, source_id, ts, value)) => {
                let name = station.name.as_deref().unwrap_or("?");
                let river = station.river.as_deref().unwrap_or("");
                println!(
                    "{key:<10} OK  {name} ({river})  {source_id} = {value} @ {ts}  [{} stations]",
                    stations.len()
                );
            }
            None => println!(
                "{key:<10} {} stations, but no readings from the first {MAX_TRIES} tried",
                stations.len()
            ),
        }
    }

    Ok(())
}
