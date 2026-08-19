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
use paddlemate_api::models::geometry::Geometry;
use paddlemate_api::models::osm_geometry::OsmElementKind;
use paddlemate_api::query::osm_geometry::replace_elements;
use serde::Deserialize;
use sqlx::PgPool;

const OVERPASS_URLS: [&str; 3] = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
];
const REQUEST_GAP: Duration = Duration::from_secs(1);
/// Bbox margin around the sections, in degrees (~15 km).
const BBOX_BUFFER_DEG: f64 = 0.15;
const MAX_CONSECUTIVE_FAILURES: u32 = 15;

#[derive(Deserialize)]
struct OverpassResponse {
    #[serde(default)]
    elements: Vec<Element>,
}

#[derive(Deserialize)]
struct Element {
    #[serde(rename = "type")]
    element_type: String,
    id: i64,
    #[serde(default)]
    geometry: Vec<Node>,
}

#[derive(Deserialize)]
struct Node {
    lat: f64,
    lon: f64,
}

/// Escape characters that are regex metacharacters in Overpass filters,
/// mirroring the frontend's escapeOverpassRegex.
fn escape_overpass_regex(name: &str) -> String {
    name.chars()
        .flat_map(|c| match c {
            '(' | ')' | '+' | '.' | '\\' => vec!['\\', c],
            _ => vec![c],
        })
        .collect()
}

/// The wizard's centerline query: river/stream ways matching the name
/// (default or German) inside the bbox, with per-node geometry.
fn centerline_query(name: &str, bbox: (f64, f64, f64, f64)) -> String {
    let safe = escape_overpass_regex(name);
    let (south, west, north, east) = bbox;
    format!(
        r#"[out:json][timeout:30];
(
  way["waterway"~"river|stream"]["name"~"{safe}",i]({south},{west},{north},{east});
  way["waterway"~"river|stream"]["name:de"~"{safe}",i]({south},{west},{north},{east});
);
out geom;"#
    )
}

/// Convert Overpass way elements to cache rows, dropping degenerate ones.
fn to_cache_elements(response: OverpassResponse) -> Vec<(String, i64, Geometry)> {
    response
        .elements
        .into_iter()
        .filter(|e| e.element_type == "way" && e.geometry.len() >= 2)
        .map(|e| {
            let coordinates = e.geometry.iter().map(|n| [n.lon, n.lat]).collect();
            (e.element_type, e.id, Geometry::LineString { coordinates })
        })
        .collect()
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let pool = PgPool::connect(&database_url).await?;
    let client = reqwest::Client::builder()
        .user_agent("paddlemate-osm-geometry-cache")
        .local_address(std::net::IpAddr::from([0, 0, 0, 0]))
        .timeout(Duration::from_secs(40))
        .build()?;

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
        let mut response: Option<OverpassResponse> = None;
        for url in OVERPASS_URLS {
            match client.post(url).body(query.clone()).send().await {
                Ok(resp) => match resp.error_for_status() {
                    Ok(resp) => match resp.json::<OverpassResponse>().await {
                        Ok(parsed) => {
                            response = Some(parsed);
                            break;
                        }
                        Err(err) => eprintln!("  #{} {}: parse error: {err}", w.id, w.name),
                    },
                    Err(err) => eprintln!("  #{} {}: server error ({url}): {err}", w.id, w.name),
                },
                Err(err) => eprintln!("  #{} {}: request failed ({url}): {err}", w.id, w.name),
            }
        }
        let Some(response) = response else {
            consecutive_failures += 1;
            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                anyhow::bail!(
                    "aborting after {MAX_CONSECUTIVE_FAILURES} consecutive failed fetches - \
                     network problem, {cached} waterways cached so far"
                );
            }
            continue;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_regex_metacharacters() {
        assert_eq!(
            escape_overpass_regex("Rio (Grande) 1+1."),
            "Rio \\(Grande\\) 1\\+1\\."
        );
        assert_eq!(escape_overpass_regex("Isar"), "Isar");
    }

    #[test]
    fn converts_ways_and_drops_degenerates() {
        let response: OverpassResponse = serde_json::from_str(
            r#"{"elements": [
                {"type": "way", "id": 1, "geometry": [
                    {"lat": 47.1, "lon": 10.9}, {"lat": 47.2, "lon": 11.0}]},
                {"type": "way", "id": 2, "geometry": [{"lat": 47.0, "lon": 10.0}]},
                {"type": "node", "id": 3}
            ]}"#,
        )
        .expect("parses");
        let elements = to_cache_elements(response);
        assert_eq!(elements.len(), 1);
        let (osm_type, osm_id, geometry) = &elements[0];
        assert_eq!(osm_type, "way");
        assert_eq!(*osm_id, 1);
        match geometry {
            Geometry::LineString { coordinates } => {
                assert_eq!(coordinates, &vec![[10.9, 47.1], [11.0, 47.2]]);
            }
            other => panic!("expected LineString, got {other:?}"),
        }
    }

    #[test]
    fn query_contains_name_and_bbox() {
        let q = centerline_query("Isar", (47.0, 10.8, 47.5, 11.3));
        assert!(q.contains(r#""name"~"Isar",i"#));
        assert!(q.contains("(47,10.8,47.5,11.3)"));
        assert!(q.contains("out geom"));
    }
}
