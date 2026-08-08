//! Sync the gauge discovery catalog from every provider's `list_stations()`.
//!
//! Populates `gauge_catalog` (metadata only, not fetched) so the picker can
//! offer "all available gauges" across providers. Rivermap is skipped - its
//! stations already live in `gauges`. Each provider is fetched under a timeout
//! and isolated: one provider failing logs and continues, it never aborts the
//! run. Idempotent; run on a schedule.

use std::time::Duration;

use anyhow::Context;
use paddlemate_api::query::gauges::upsert_catalog_stations;
use river_gauge::build_registry;
use sqlx::PgPool;
use tokio::time::timeout;

const PER_PROVIDER_TIMEOUT: Duration = Duration::from_secs(120);

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let pool = PgPool::connect(&database_url).await?;

    let mut total = 0u64;
    for reader in build_registry() {
        let provider = reader.provider_key();
        if provider == "rivermap" {
            continue; // already materialised in `gauges`
        }
        match timeout(PER_PROVIDER_TIMEOUT, reader.list_stations()).await {
            Ok(Ok(stations)) if stations.is_empty() => {
                println!("  {provider}: no stations listed");
            }
            Ok(Ok(stations)) => {
                match upsert_catalog_stations(&pool, provider, &stations).await {
                    Ok(n) => {
                        total += n;
                        println!("  {provider}: {} stations", stations.len());
                    }
                    Err(err) => {
                        // A write failure for one provider must not abort the run.
                        eprintln!("  {provider}: upsert failed: {err}");
                    }
                }
            }
            Ok(Err(err)) => eprintln!("  {provider}: list_stations failed: {err}"),
            Err(_) => eprintln!("  {provider}: timed out after {PER_PROVIDER_TIMEOUT:?}"),
        }
    }

    println!("Catalog sync complete: {total} rows upserted");
    Ok(())
}
