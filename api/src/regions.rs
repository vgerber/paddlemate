//! Region derivation for sections, from OpenStreetMap.
//!
//! A section's LineString is sampled at up to three points; one Overpass
//! request per point returns (a) containing administrative areas (district
//! admin_level 6, state admin_level 4) and mountain-range regions
//! (place=region + region:type=mountain_area), and (b) named natural=valley
//! ways/relations within 2 km - OSM valleys are lines, never polygons, so
//! proximity is the only way to get names like "Oetztal" or "Engadin".
//!
//! Regions are stored most specific first: valleys, districts, states,
//! ranges. Valleys keep only the names seen by the most sample points, which
//! filters out side valleys that happen to be near one endpoint.
//!
//! `run_worker` is the live path: a background loop that fills any section
//! whose regions array is empty, woken right after a section is created (or
//! a section proposal approved) so new sections get their regions within
//! seconds without a manual backfill. The derive_section_regions bin reuses
//! the same pieces for bulk runs.

use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tokio::sync::Notify;

use crate::models::region::{Region, RegionKind};
use crate::overpass::{OverpassResponse, client, run_query};

const VALLEY_RADIUS_M: u32 = 2_000;
pub const REQUEST_GAP: Duration = Duration::from_secs(1);
/// Idle time between worker cycles; the wake Notify cuts it short.
const WORKER_INTERVAL: Duration = Duration::from_secs(30 * 60);

/// Region names found around one sample point, by kind.
#[derive(Default)]
pub struct PointRegions {
    pub valleys: Vec<String>,
    pub districts: Vec<String>,
    pub states: Vec<String>,
    pub ranges: Vec<String>,
    /// ISO 3166-1 alpha-2 codes of containing countries (admin_level 2).
    pub countries: Vec<String>,
}

pub fn region_query(lat: f64, lon: f64) -> String {
    format!(
        r#"[out:json][timeout:25];
is_in({lat},{lon})->.a;
(
  area.a[boundary=administrative][admin_level~"^(2|4|6)$"];
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

pub fn classify(response: OverpassResponse) -> PointRegions {
    let mut out = PointRegions::default();
    for el in response.elements {
        if el.element_type == "area" && el.tags.get("admin_level").map(String::as_str) == Some("2")
        {
            if let Some(code) = el
                .tags
                .get("ISO3166-1")
                .or_else(|| el.tags.get("ISO3166-1:alpha2"))
            {
                out.countries.push(code.clone());
            }
            continue;
        }
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
pub fn sample_points(location: &serde_json::Value) -> Vec<(f64, f64)> {
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

/// Picks a sample's names for one region kind. Valleys are merged by vote
/// and handled separately.
type KindPicker = (RegionKind, fn(&PointRegions) -> &Vec<String>);

/// Kinds appended after the valleys, least specific last.
const NON_VALLEY_KINDS: [KindPicker; 3] = [
    (RegionKind::District, |s| &s.districts),
    (RegionKind::State, |s| &s.states),
    (RegionKind::Range, |s| &s.ranges),
];

/// Merge per-point results into one ordered region list: valleys agreed on by
/// the most sample points, then districts, states and ranges (deduplicated,
/// first-seen order). With several sample points a valley needs at least two
/// votes - single sightings are side gorges near one point (a river canyon
/// can have a dozen), not the valley the section runs through.
/// `requested_points` is the number of points sampled, not the number that
/// succeeded - a partial failure must not re-admit single-vote gorges.
pub fn merge_regions(samples: &[PointRegions], requested_points: usize) -> Vec<Region> {
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
    let min_votes = if requested_points > 1 { 2 } else { 1 };

    let mut regions: Vec<Region> = if max_votes >= min_votes {
        valley_votes
            .into_iter()
            .filter(|(_, n)| *n == max_votes)
            .map(|(name, _)| Region {
                name,
                kind: RegionKind::Valley,
            })
            .collect()
    } else {
        vec![]
    };
    for (kind, names_of) in NON_VALLEY_KINDS {
        for s in samples {
            for name in names_of(s) {
                if !regions.iter().any(|r| &r.name == name) {
                    regions.push(Region {
                        name: name.clone(),
                        kind,
                    });
                }
            }
        }
    }
    regions
}

/// The country most sample points lie in (first-seen tiebreak, so a border
/// section gets the country it starts in).
pub fn merge_country(samples: &[PointRegions]) -> Option<String> {
    let mut votes: Vec<(String, usize)> = vec![];
    for s in samples {
        for c in &s.countries {
            match votes.iter_mut().find(|(code, _)| code == c) {
                Some((_, n)) => *n += 1,
                None => votes.push((c.clone(), 1)),
            }
        }
    }
    votes
        .into_iter()
        .max_by_key(|(_, n)| *n)
        .map(|(code, _)| code)
}

pub struct DerivedRegions {
    pub regions: Vec<Region>,
    pub country: Option<String>,
}

impl DerivedRegions {
    /// Region names in order, as stored in `water_sections.regions`.
    pub fn names(&self) -> Vec<String> {
        self.regions.iter().map(|r| r.name.clone()).collect()
    }

    /// The regions plus the country as a trailing entry - the shape the
    /// regions endpoint returns.
    pub fn with_country(self) -> Vec<Region> {
        let mut regions = self.regions;
        if let Some(name) = self.country {
            regions.push(Region {
                name,
                kind: RegionKind::Country,
            });
        }
        regions
    }
}

/// Derive regions and country for one section line (GeoJSON LineString).
/// Failed sample points are skipped; empty results mean nothing was found or
/// no request got through.
pub async fn derive_for_location(location: &serde_json::Value) -> DerivedRegions {
    let points = sample_points(location);
    let requested_points = points.len();
    let mut samples = vec![];
    for (lat, lon) in points {
        tokio::time::sleep(REQUEST_GAP).await;
        match run_query(client(), &region_query(lat, lon)).await {
            Ok(response) => samples.push(classify(response)),
            Err(err) => tracing::warn!("Region sample ({lat},{lon}) failed: {err}"),
        }
    }
    DerivedRegions {
        regions: merge_regions(&samples, requested_points),
        country: merge_country(&samples),
    }
}

/// Background worker: fill regions and country for sections where they are
/// empty. Runs a cycle on start, then whenever `wake` is notified (a section
/// was created) and at a slow interval as a catch-up. Hand-edited values are
/// never touched - each field is only written while still empty.
pub fn run_worker(pool: PgPool, wake: Arc<Notify>) {
    tokio::spawn(async move {
        loop {
            if let Err(err) = run_cycle(&pool).await {
                tracing::error!("Region worker cycle failed: {err}");
            }
            tokio::select! {
                _ = wake.notified() => {}
                _ = tokio::time::sleep(WORKER_INTERVAL) => {}
            }
        }
    });
}

async fn run_cycle(pool: &PgPool) -> anyhow::Result<()> {
    // Newest first: a freshly created section gets its regions right after
    // the wake even when a backlog of older sections is still queued.
    let sections = sqlx::query!(
        r#"SELECT id, name, ST_AsGeoJSON(location) AS "location!"
           FROM water_sections
           WHERE regions = '{}' OR country IS NULL OR country = ''
           ORDER BY id DESC"#
    )
    .fetch_all(pool)
    .await?;

    for section in sections {
        let location: serde_json::Value = match serde_json::from_str(&section.location) {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!("Section {} has bad geometry: {err}", section.id);
                continue;
            }
        };
        let derived = derive_for_location(&location).await;
        let names = derived.names();
        if names.is_empty() && derived.country.is_none() {
            continue;
        }
        sqlx::query!(
            "UPDATE water_sections
             SET regions = CASE WHEN regions = '{}' THEN $1 ELSE regions END,
                 country = COALESCE(NULLIF(country, ''), $2),
                 updated_at = NOW()
             WHERE id = $3",
            &names,
            derived.country.as_deref(),
            section.id
        )
        .execute(pool)
        .await?;
        tracing::info!(
            "Derived section {} ({}): regions [{}], country {}",
            section.id,
            section.name,
            names.join(", "),
            derived.country.as_deref().unwrap_or("-")
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Region names in order, for comparing merge results.
    fn names(regions: &[Region]) -> Vec<String> {
        regions.iter().map(|r| r.name.clone()).collect()
    }

    fn regions(valleys: &[&str], districts: &[&str], states: &[&str]) -> PointRegions {
        PointRegions {
            valleys: valleys.iter().map(|s| s.to_string()).collect(),
            districts: districts.iter().map(|s| s.to_string()).collect(),
            states: states.iter().map(|s| s.to_string()).collect(),
            ranges: vec![],
            countries: vec![],
        }
    }

    #[test]
    fn merge_keeps_majority_valley_and_orders_admin_after() {
        let samples = vec![
            regions(&["Oetztal", "Sulztal"], &["Bezirk Imst"], &["Tirol"]),
            regions(&["Oetztal"], &["Bezirk Imst"], &["Tirol"]),
            regions(&["Oetztal"], &[], &["Tirol"]),
        ];
        let merged = merge_regions(&samples, samples.len());
        assert_eq!(names(&merged), ["Oetztal", "Bezirk Imst", "Tirol"]);
        assert_eq!(merged[0].kind, RegionKind::Valley);
        assert_eq!(merged[1].kind, RegionKind::District);
        assert_eq!(merged[2].kind, RegionKind::State);
    }

    #[test]
    fn merge_keeps_tied_valleys() {
        let samples = vec![
            regions(&["Engadin", "Oberengadin"], &["Maloja"], &["Graubuenden"]),
            regions(&["Engadin", "Oberengadin"], &["Maloja"], &["Graubuenden"]),
        ];
        let merged = merge_regions(&samples, samples.len());
        assert_eq!(
            names(&merged),
            ["Engadin", "Oberengadin", "Maloja", "Graubuenden"]
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

    #[test]
    fn merge_drops_unagreed_valleys() {
        // River canyon: every sample point sees different side gorges - none
        // reach two votes, so no valley survives, only the admin areas.
        let samples = vec![
            regions(
                &["Mordgrund", "Amselgrund"],
                &["Saechsische Schweiz"],
                &["Sachsen"],
            ),
            regions(&["Wehlgrund"], &["Saechsische Schweiz"], &["Sachsen"]),
            regions(&["Erlsgrund"], &[], &["Sachsen"]),
        ];
        let merged = merge_regions(&samples, samples.len());
        assert_eq!(names(&merged), ["Saechsische Schweiz", "Sachsen"]);

        // Two of three sample requests failed: the surviving single sample
        // must not re-admit its single-vote gorges.
        let partial = vec![regions(
            &["Mordgrund", "Amselgrund"],
            &["Saechsische Schweiz"],
            &["Sachsen"],
        )];
        assert_eq!(
            names(&merge_regions(&partial, 3)),
            ["Saechsische Schweiz", "Sachsen"]
        );

        // A single sample point keeps its single sighting.
        let single = vec![regions(&["Oetztal"], &["Bezirk Imst"], &["Tirol"])];
        assert_eq!(
            names(&merge_regions(&single, 1)),
            ["Oetztal", "Bezirk Imst", "Tirol"]
        );
    }

    #[test]
    fn merge_country_takes_majority() {
        let mut a = PointRegions::default();
        a.countries.push("AT".into());
        let mut b = PointRegions::default();
        b.countries.push("AT".into());
        let mut c = PointRegions::default();
        c.countries.push("DE".into());
        assert_eq!(merge_country(&[a, b, c]), Some("AT".to_string()));
        assert_eq!(merge_country(&[]), None);
    }

    #[test]
    fn classify_sorts_areas_and_valleys() {
        let response: OverpassResponse = serde_json::from_str(
            r#"{"elements": [
                {"type": "area", "id": 0, "tags": {"name": "Österreich", "admin_level": "2", "ISO3166-1": "AT"}},
                {"type": "area", "id": 1, "tags": {"name": "Tirol", "admin_level": "4"}},
                {"type": "area", "id": 2, "tags": {"name": "Bezirk Imst", "admin_level": "6"}},
                {"type": "area", "id": 3, "tags": {"name": "Stubaier Alpen"}},
                {"type": "way", "id": 4, "tags": {"name": "Oetztal", "natural": "valley"}},
                {"type": "way", "id": 5, "tags": {"natural": "valley"}}
            ]}"#,
        )
        .expect("parses");
        let out = classify(response);
        assert_eq!(out.states, vec!["Tirol"]);
        assert_eq!(out.districts, vec!["Bezirk Imst"]);
        assert_eq!(out.ranges, vec!["Stubaier Alpen"]);
        assert_eq!(out.valleys, vec!["Oetztal"]);
        assert_eq!(out.countries, vec!["AT"]);
    }
}
