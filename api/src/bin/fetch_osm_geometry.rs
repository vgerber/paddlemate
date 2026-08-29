//! Fill the OSM geometry cache for waterways that have sections.
//!
//! For each waterway without cached centerlines, the union bbox of its
//! sections (buffered ~15 km) bounds an Overpass query for waterway=river/
//! stream ways matching the waterway's name - the same query the section
//! wizard runs live, so a cache hit and a live fetch return the same
//! fragments. Results land in waterway_osm_elements; the wizard's endpoint
//! serves them without touching Overpass.
//!
//! Waterways with no OSM match are not cached and simply retried on the
//! next run. Respects Overpass fair use (one request per second), binds
//! IPv4 (the production container has no IPv6 route), falls back across
//! three endpoints and aborts after too many consecutive network failures.
//! Resumable and idempotent.

use std::time::Duration;

use anyhow::Context;
use paddlemate_api::models::osm_geometry::OsmElementKind;
use paddlemate_api::overpass::{
    BBOX_BUFFER_DEG, centerline_query, client, run_query, to_cache_elements,
};
use paddlemate_api::query::osm_geometry::replace_elements;
use sqlx::PgPool;

const REQUEST_GAP: Duration = Duration::from_secs(1);
const MAX_CONSECUTIVE_FAILURES: u32 = 15;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let pool = PgPool::connect(&database_url).await?;
    let client = client();

    // Waterways with sections but no cached centerlines, with the sections'
    // union bbox as the Overpass search area.
    let waterways = sqlx::query!(
        r#"SELECT w.id, w.name,
                  MIN(ST_YMin(ws.location::geometry)) AS "south!",
                  MIN(ST_XMin(ws.location::geometry)) AS "west!",
                  MAX(ST_YMax(ws.location::geometry)) AS "north!",
                  MAX(ST_XMax(ws.location::geometry)) AS "east!"
           FROM waterways w
           JOIN water_sections ws ON ws.waterway_id = w.id
           WHERE NOT EXISTS (
               SELECT 1 FROM waterway_osm_elements e
               WHERE e.waterway_id = w.id AND e.kind = 'centerline')
           GROUP BY w.id, w.name
           ORDER BY w.id"#
    )
    .fetch_all(&pool)
    .await?;
    println!("{} waterways to fetch", waterways.len());

    let mut cached = 0u32;
    let mut empty = 0u32;
    let mut consecutive_failures = 0u32;
    for w in waterways {
        let bbox = (
            w.south - BBOX_BUFFER_DEG,
            w.west - BBOX_BUFFER_DEG,
            w.north + BBOX_BUFFER_DEG,
            w.east + BBOX_BUFFER_DEG,
        );
        let query = centerline_query(&w.name, bbox);

        tokio::time::sleep(REQUEST_GAP).await;
        let response = match run_query(client, &query).await {
            Ok(response) => response,
            Err(err) => {
                eprintln!("  #{} {}: all endpoints failed: {err}", w.id, w.name);
                consecutive_failures += 1;
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    anyhow::bail!(
                        "aborting after {MAX_CONSECUTIVE_FAILURES} consecutive failed fetches - \
                         network problem, {cached} waterways cached so far"
                    );
                }
                continue;
            }
        };
        consecutive_failures = 0;

        let elements = to_cache_elements(response);
        if elements.is_empty() {
            empty += 1;
            continue;
        }
        let count = elements.len();
        replace_elements(&pool, w.id, OsmElementKind::Centerline, &elements).await?;
        println!("  #{} {}: {count} way fragments", w.id, w.name);
        cached += 1;
    }

    println!("OSM geometry cache complete: {cached} waterways cached, {empty} without a match");
    Ok(())
}
