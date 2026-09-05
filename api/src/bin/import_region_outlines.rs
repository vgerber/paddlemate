//! Import the boundary of every region a section is tagged with, from
//! OpenStreetMap, so the river filter can offer regions as selectable areas.
//!
//! One Overpass request per distinct region name, bounded by the sections
//! that carry it. Already-imported regions are skipped unless --refresh is
//! given, so a rerun after new sections appeared only fetches the new names.
//! Idempotent.

use anyhow::Context;
use paddlemate_api::overpass::{client, run_query};
use paddlemate_api::query::regions::claimed;
use paddlemate_api::regions::{REQUEST_GAP, collect_outline, outline_query, store_outline};
use sqlx::PgPool;

/// Abort after this many consecutive names that returned nothing usable -
/// the endpoint is down, not the data.
const MAX_CONSECUTIVE_FAILURES: u32 = 15;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let refresh = std::env::args().any(|a| a == "--refresh");

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let pool = PgPool::connect(&database_url).await?;

    let claimed = claimed(&pool).await?;
    let pending: Vec<_> = claimed
        .into_iter()
        .filter(|region| refresh || !region.imported)
        .collect();
    println!("{} region names to import", pending.len());

    let mut imported = 0u32;
    let mut consecutive_failures = 0u32;
    for region in pending {
        // A section midpoint can fall just outside its region on a border
        // river, so try the next section before giving the name up.
        let mut response = None;
        for (lat, lon) in &region.points {
            tokio::time::sleep(REQUEST_GAP).await;
            match run_query(client(), &outline_query(&region.name, *lat, *lon)).await {
                Ok(found) if found.elements.is_empty() => continue,
                Ok(found) => {
                    response = Some(found);
                    break;
                }
                Err(err) => {
                    eprintln!("  {}: request failed: {err}", region.name);
                    consecutive_failures += 1;
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        anyhow::bail!(
                            "aborting after {MAX_CONSECUTIVE_FAILURES} consecutive failures - \
                             likely a network problem, {imported} imported so far"
                        );
                    }
                    break;
                }
            }
        }
        let Some(response) = response else {
            println!("  {}: no matching boundary in OSM", region.name);
            continue;
        };
        consecutive_failures = 0;

        let Some(outline) = collect_outline(response, &region.name) else {
            println!("  {}: no matching boundary in OSM", region.name);
            continue;
        };
        let stored = store_outline(
            &pool,
            &region.name,
            region.country.as_deref(),
            &outline,
        )
        .await?;
        match stored {
            Some(id) => {
                println!(
                    "  {} ({}): #{id} from {} element(s)",
                    region.name,
                    outline.kind.as_str(),
                    outline.osm_ids.len()
                );
                imported += 1;
            }
            None => println!("  {}: ways did not form a usable outline", region.name),
        }
    }

    println!("Region outline import complete: {imported} regions stored");
    Ok(())
}
