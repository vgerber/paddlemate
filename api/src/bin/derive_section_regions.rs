//! Backfill region names for sections that have none, from OpenStreetMap.
//!
//! For each section the LineString is sampled at up to three points; one
//! Overpass request per point returns (a) containing administrative areas
//! (district admin_level 6, state admin_level 4) and mountain-range regions
//! (place=region + region:type=mountain_area), and (b) named natural=valley
//! ways/relations within 5 km - OSM valleys are lines, never polygons, so
//! proximity is the only way to get names like "Oetztal" or "Engadin".
//!
//! Regions are stored most specific first: valleys, districts, states,
//! ranges. Valleys keep only the names seen by the most sample points, which
//! filters out side valleys that happen to be near one endpoint.
//!
//! Respects Overpass fair use: one request per second. Run manually or after
//! an import; only sections with an empty regions array are touched, so
//! hand-edited lists are never overwritten. Idempotent.

use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;
use sqlx::PgPool;

const OVERPASS_URL: &str = "https://overpass-api.de/api/interpreter";
const VALLEY_RADIUS_M: u32 = 2_000;
const REQUEST_GAP: Duration = Duration::from_secs(1);

#[derive(Deserialize)]
struct OverpassResponse {
    #[serde(default)]
    elements: Vec<Element>,
}

#[derive(Deserialize)]
struct Element {
    #[serde(rename = "type")]
    element_type: String,
    #[serde(default)]
    tags: std::collections::HashMap<String, String>,
}

/// Region names found around one sample point, by kind.
#[derive(Default)]
struct PointRegions {
    valleys: Vec<String>,
    districts: Vec<String>,
    states: Vec<String>,
    ranges: Vec<String>,
}

fn overpass_query(lat: f64, lon: f64) -> String {
    format!(
        r#"[out:json][timeout:25];
is_in({lat},{lon})->.a;
(
  area.a[boundary=administrative][admin_level~"^(4|6)$"];
  area.a[place=region]["region:type"="mountain_area"];
);
out tags;
(
  way(around:{VALLEY_RADIUS_M},{lat},{lon})[natural=valley][name];
  relation(around:{VALLEY_RADIUS_M},{lat},{lon})[natural=valley][name];
);
out tags;"#
    )
}

fn classify(response: OverpassResponse) -> PointRegions {
    let mut out = PointRegions::default();
    for el in response.elements {
        let Some(name) = el.tags.get("name").cloned() else {
            continue;
        };
        if el.element_type == "area" {
            match el.tags.get("admin_level").map(String::as_str) {
                Some("6") => out.districts.push(name),
                Some("4") => out.states.push(name),
                _ => out.ranges.push(name),
            }
        } else if el.tags.get("natural").map(String::as_str) == Some("valley") {
            out.valleys.push(name);
        }
    }
    out
}

/// Sample up to three points (start, middle, end) from a GeoJSON LineString.
fn sample_points(location: &serde_json::Value) -> Vec<(f64, f64)> {
    let Some(coords) = location.get("coordinates").and_then(|c| c.as_array()) else {
        return vec![];
    };
    let point = |v: &serde_json::Value| -> Option<(f64, f64)> {
        let a = v.as_array()?;
        Some((a.get(1)?.as_f64()?, a.first()?.as_f64()?))
    };
    let mut points = vec![];
    for idx in [0, coords.len() / 2, coords.len().saturating_sub(1)] {
        if let Some(p) = coords.get(idx).and_then(point) {
            if !points.contains(&p) {
                points.push(p);
            }
        }
    }
    points
}

/// Merge per-point results into one ordered region list: valleys agreed on by
/// the most sample points, then districts, states and ranges (deduplicated,
/// first-seen order).
fn merge_regions(samples: &[PointRegions]) -> Vec<String> {
    let mut valley_votes: Vec<(String, usize)> = vec![];
    for s in samples {
        for v in &s.valleys {
            match valley_votes.iter_mut().find(|(name, _)| name == v) {
                Some((_, n)) => *n += 1,
                None => valley_votes.push((v.clone(), 1)),
            }
        }
    }
    let max_votes = valley_votes.iter().map(|(_, n)| *n).max().unwrap_or(0);

    let mut regions: Vec<String> = valley_votes
        .into_iter()
        .filter(|(_, n)| *n == max_votes)
        .map(|(name, _)| name)
        .collect();
    for pick in [
        |s: &PointRegions| s.districts.clone(),
        |s: &PointRegions| s.states.clone(),
        |s: &PointRegions| s.ranges.clone(),
    ] {
        for s in samples {
            for name in pick(s) {
                if !regions.contains(&name) {
                    regions.push(name);
                }
            }
        }
    }
    regions
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let pool = PgPool::connect(&database_url).await?;
    let client = reqwest::Client::builder()
        .user_agent("paddlemate-region-backfill")
        .build()?;

    let sections = sqlx::query!(
        r#"SELECT id, name, ST_AsGeoJSON(location) AS "location!"
           FROM water_sections
           WHERE regions = '{}'
           ORDER BY id"#
    )
    .fetch_all(&pool)
    .await?;
    println!("{} sections without regions", sections.len());

    let mut updated = 0u32;
    for section in sections {
        let location: serde_json::Value = match serde_json::from_str(&section.location) {
            Ok(v) => v,
            Err(err) => {
                eprintln!("  #{} {}: bad geometry: {err}", section.id, section.name);
                continue;
            }
        };
        let points = sample_points(&location);
        if points.is_empty() {
            eprintln!("  #{} {}: no sample points", section.id, section.name);
            continue;
        }

        let mut samples = vec![];
        for (lat, lon) in &points {
            tokio::time::sleep(REQUEST_GAP).await;
            let resp = client
                .post(OVERPASS_URL)
                .body(overpass_query(*lat, *lon))
                .send()
                .await;
            match resp {
                Ok(resp) => match resp.error_for_status() {
                    Ok(resp) => match resp.json::<OverpassResponse>().await {
                        Ok(parsed) => samples.push(classify(parsed)),
                        Err(err) => eprintln!("  #{}: parse error: {err}", section.id),
                    },
                    Err(err) => eprintln!("  #{}: server error: {err}", section.id),
                },
                Err(err) => eprintln!("  #{}: request failed: {err}", section.id),
            }
        }
        if samples.is_empty() {
            continue;
        }

        let regions = merge_regions(&samples);
        if regions.is_empty() {
            println!("  #{} {}: nothing found", section.id, section.name);
            continue;
        }
        sqlx::query!(
            "UPDATE water_sections SET regions = $1, updated_at = NOW() WHERE id = $2",
            &regions,
            section.id
        )
        .execute(&pool)
        .await?;
        println!("  #{} {}: {}", section.id, section.name, regions.join(", "));
        updated += 1;
    }

    println!("Region backfill complete: {updated} sections updated");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn regions(valleys: &[&str], districts: &[&str], states: &[&str]) -> PointRegions {
        PointRegions {
            valleys: valleys.iter().map(|s| s.to_string()).collect(),
            districts: districts.iter().map(|s| s.to_string()).collect(),
            states: states.iter().map(|s| s.to_string()).collect(),
            ranges: vec![],
        }
    }

    #[test]
    fn merge_keeps_majority_valley_and_orders_admin_after() {
        let samples = vec![
            regions(&["Oetztal", "Sulztal"], &["Bezirk Imst"], &["Tirol"]),
            regions(&["Oetztal"], &["Bezirk Imst"], &["Tirol"]),
            regions(&["Oetztal"], &[], &["Tirol"]),
        ];
        let merged = merge_regions(&samples);
        assert_eq!(merged, vec!["Oetztal", "Bezirk Imst", "Tirol"]);
    }

    #[test]
    fn merge_keeps_tied_valleys() {
        let samples = vec![
            regions(&["Engadin", "Oberengadin"], &["Maloja"], &["Graubuenden"]),
            regions(&["Engadin", "Oberengadin"], &["Maloja"], &["Graubuenden"]),
        ];
        let merged = merge_regions(&samples);
        assert_eq!(
            merged,
            vec!["Engadin", "Oberengadin", "Maloja", "Graubuenden"]
        );
    }

    #[test]
    fn sample_points_dedupes_and_bounds() {
        let line: serde_json::Value = serde_json::json!({
            "type": "LineString",
            "coordinates": [[10.9, 47.1], [10.95, 47.15], [11.0, 47.2]]
        });
        let points = sample_points(&line);
        assert_eq!(points, vec![(47.1, 10.9), (47.15, 10.95), (47.2, 11.0)]);

        let degenerate: serde_json::Value = serde_json::json!({
            "type": "LineString",
            "coordinates": [[10.9, 47.1], [10.9, 47.1]]
        });
        assert_eq!(sample_points(&degenerate), vec![(47.1, 10.9)]);
    }
}
