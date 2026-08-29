//! Backfill region names for sections that have none, from OpenStreetMap.
//!
//! Derivation lives in paddlemate_api::regions (shared with the API's live
//! region worker); this bin runs it over the whole table for bulk backfills
//! after an import. Only sections with an empty regions array are touched,
//! so hand-edited lists are never overwritten. Idempotent.
//!
//! `--refresh-imported` additionally re-derives rivermap-imported sections
//! whose regions came from the import's coarse regionName (country-level),
//! replacing them with the OSM-derived list.

use anyhow::Context;
use paddlemate_api::regions::derive_for_location;
use sqlx::PgPool;

/// Abort the run after this many consecutive sections with zero successful
/// requests - the network is down, not the data.
const MAX_CONSECUTIVE_FAILURES: u32 = 15;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let refresh_imported = std::env::args().any(|a| a == "--refresh-imported");

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let pool = PgPool::connect(&database_url).await?;

    // The single-element check makes --refresh-imported resumable: the
    // import wrote exactly one coarse regionName, while derived lists are
    // multi-entry, so already-refreshed rows are skipped on a rerun.
    let sections = sqlx::query!(
        r#"SELECT id, name, ST_AsGeoJSON(location) AS "location!"
           FROM water_sections
           WHERE regions = '{}'
              OR ($1
                  AND created_by = 'rivermap-import'
                  AND cardinality(regions) <= 1)
           ORDER BY id"#,
        refresh_imported
    )
    .fetch_all(&pool)
    .await?;
    println!("{} sections to derive", sections.len());

    let mut updated = 0u32;
    let mut consecutive_failures = 0u32;
    for section in sections {
        let location: serde_json::Value = match serde_json::from_str(&section.location) {
            Ok(v) => v,
            Err(err) => {
                eprintln!("  #{} {}: bad geometry: {err}", section.id, section.name);
                continue;
            }
        };
        let derived = derive_for_location(&location).await;
        let names = derived.names();
        if names.is_empty() && derived.country.is_none() {
            println!("  #{} {}: nothing found", section.id, section.name);
            consecutive_failures += 1;
            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                anyhow::bail!(
                    "aborting after {MAX_CONSECUTIVE_FAILURES} consecutive sections with \
                     no result - likely a network problem, {updated} updated so far"
                );
            }
            continue;
        }
        consecutive_failures = 0;
        sqlx::query!(
            "UPDATE water_sections
             SET regions = $1,
                 country = COALESCE(NULLIF(country, ''), $2),
                 updated_at = NOW()
             WHERE id = $3",
            &names,
            derived.country.as_deref(),
            section.id
        )
        .execute(&pool)
        .await?;
        println!(
            "  #{} {}: {} ({})",
            section.id,
            section.name,
            names.join(", "),
            derived.country.as_deref().unwrap_or("-")
        );
        updated += 1;
    }

    println!("Region backfill complete: {updated} sections updated");
    Ok(())
}
