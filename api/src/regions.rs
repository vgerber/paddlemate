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
//! `outline_query` and `collect_outline` are the other direction: given a
//! region name and a point inside it, they fetch the OSM elements that draw
//! its boundary, for the import_region_outlines bin to store.
//!
//! `run_worker` is the live path: a background loop that fills any section
//! whose regions array is empty, woken right after a section is created (or
//! a section proposal approved) so new sections get their regions within
//! seconds without a manual backfill. The derive_section_regions bin reuses
//! the same pieces for bulk runs.

use std::collections::HashSet;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use sqlx::PgPool;
use tokio::sync::Notify;

use crate::models::region::{Region, RegionKind};
use crate::overpass::{
    Element, FETCH_LOCK, OverpassResponse, client, escape_overpass_literal, run_query,
};
use crate::query::regions::{
    RegionImport, assign_countries, mark_tiles, missing_tiles, upsert,
};

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

/// The OSM elements that draw one named region.
pub struct OutlineSource {
    pub kind: RegionKind,
    /// Provenance, as "way/123" or "relation/456".
    pub osm_ids: Vec<String>,
    /// Every way the region is made of. Administrative boundaries and
    /// mountain ranges close into rings, valleys do not; PostGIS decides
    /// which of the two it got.
    pub lines: Vec<Vec<[f64; 2]>>,
}

/// The OSM elements that draw the region named `name` around one of its
/// sections. Resolved the same way the names were derived: `is_in` for the
/// areas and a proximity search for the valleys, so the outline belongs to
/// exactly the element the name came from. `pivot` turns each area back into
/// the way or relation it was built from, which is what carries geometry.
pub fn outline_query(name: &str, lat: f64, lon: f64) -> String {
    let safe = escape_overpass_literal(name);
    format!(
        r#"[out:json][timeout:180];
is_in({lat},{lon})->.a;
(
  area.a[boundary=administrative][admin_level~"^(4|6)$"]["name"="{safe}"];
  area.a[place=region]["region:type"="mountain_area"]["name"="{safe}"];
)->.areas;
(
  relation(pivot.areas);
  way(pivot.areas);
  way(around:{VALLEY_RADIUS_M},{lat},{lon})[natural=valley]["name"="{safe}"];
  relation(around:{VALLEY_RADIUS_M},{lat},{lon})[natural=valley]["name"="{safe}"];
);
out geom;"#
    )
}

/// Which kind an outline candidate stands for, or None when its tags do not
/// match any kind we store.
fn outline_kind(element: &Element) -> Option<RegionKind> {
    let tag = |key: &str| element.tags.get(key).map(String::as_str);
    if tag("natural") == Some("valley") {
        return Some(RegionKind::Valley);
    }
    if tag("boundary") == Some("administrative") {
        return match tag("admin_level") {
            Some("6") => Some(RegionKind::District),
            Some("4") => Some(RegionKind::State),
            Some("2") => Some(RegionKind::Country),
            _ => None,
        };
    }
    if tag("place") == Some("region") {
        return Some(RegionKind::Range);
    }
    None
}

/// Kinds an outline may resolve to, most specific first.
const OUTLINE_KINDS: [RegionKind; 4] = [
    RegionKind::Valley,
    RegionKind::District,
    RegionKind::State,
    RegionKind::Range,
];

/// Pick the region an outline response describes: the most specific kind it
/// contains, with every element of that kind merged. Merging matters for
/// valleys, which OSM splits into a chain of separate named ways.
/// Provenance of one OSM element, as "way/123" or "relation/456".
fn osm_id(element: &Element) -> String {
    format!("{}/{}", element.element_type, element.id)
}

/// Every drawable way of an element: its own geometry for a way, its member
/// ways for a relation fetched with `out geom`.
fn element_lines(element: &Element) -> Vec<Vec<[f64; 2]>> {
    std::iter::once(&element.geometry)
        .chain(element.members.iter().map(|member| &member.geometry))
        .filter(|way| way.len() >= 2)
        .map(|way| way.iter().map(|node| [node.lon, node.lat]).collect())
        .collect()
}

pub fn collect_outline(response: OverpassResponse, name: &str) -> Option<OutlineSource> {
    let candidates: Vec<(RegionKind, Element)> = response
        .elements
        .into_iter()
        .filter(|el| el.tags.get("name").map(String::as_str) == Some(name))
        .filter_map(|el| outline_kind(&el).map(|kind| (kind, el)))
        .collect();

    let kind = OUTLINE_KINDS
        .into_iter()
        .find(|kind| candidates.iter().any(|(c, _)| c == kind))?;

    let mut osm_ids = vec![];
    let mut lines = vec![];
    for (_, element) in candidates.iter().filter(|(c, _)| *c == kind) {
        osm_ids.push(osm_id(element));
        lines.extend(element_lines(element));
    }
    if lines.is_empty() {
        return None;
    }
    Some(OutlineSource {
        kind,
        osm_ids,
        lines,
    })
}

/// Zoom tier for browsing regions on the map. Which kind is worth drawing
/// depends on how much ground the viewport covers: every valley in a
/// country-sized view is thousands of outlines, a state in a valley-sized
/// view is a rectangle entirely off screen.
///
/// One kind per tier. A mountain range covers whole districts and a district
/// covers whole valleys, so drawing two kinds at once stacks outlines that
/// say nothing about each other and leaves neither readable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BrowseTier {
    /// Not a zoom tier - never drawn, and never returned by `for_span`.
    /// Countries are fetched so that every other region can be told which
    /// one it sits in.
    Countries,
    States,
    Ranges,
    Districts,
    Valleys,
}

/// A viewport wider than this gets no tier at all - the map is showing
/// continents, where even the states alone are thousands of outlines.
const MAX_BROWSE_SPAN_DEG: f64 = 12.0;

impl BrowseTier {
    /// Tier for a viewport this many degrees wide, None when the map is
    /// zoomed too far out to draw anything useful.
    pub fn for_span(span_deg: f64) -> Option<Self> {
        match span_deg {
            s if s > MAX_BROWSE_SPAN_DEG => None,
            s if s >= 4.0 => Some(BrowseTier::States),
            s if s >= 1.5 => Some(BrowseTier::Ranges),
            s if s >= 0.8 => Some(BrowseTier::Districts),
            _ => Some(BrowseTier::Valleys),
        }
    }

    /// The value stored in `region_tiles.tier`.
    pub fn as_str(self) -> &'static str {
        match self {
            BrowseTier::Countries => "countries",
            BrowseTier::States => "states",
            BrowseTier::Ranges => "ranges",
            BrowseTier::Districts => "districts",
            BrowseTier::Valleys => "valleys",
        }
    }

    /// Side of one cache tile in degrees, close to the viewport width that
    /// lands in this tier so a pan crosses only a few tiles.
    pub fn tile_deg(self) -> f64 {
        match self {
            // A country is the coarsest thing there is, and its boundary is
            // the most expensive to assemble - fetch a wide patch at once.
            BrowseTier::Countries => 8.0,
            BrowseTier::States => 4.0,
            BrowseTier::Ranges => 2.0,
            BrowseTier::Districts => 1.0,
            BrowseTier::Valleys => 0.25,
        }
    }

    pub fn kinds(self) -> &'static [RegionKind] {
        match self {
            BrowseTier::Countries => &[RegionKind::Country],
            BrowseTier::States => &[RegionKind::State],
            BrowseTier::Ranges => &[RegionKind::Range],
            BrowseTier::Districts => &[RegionKind::District],
            BrowseTier::Valleys => &[RegionKind::Valley],
        }
    }
}

/// Tiles of the tier's grid covering a bbox, as (x, y) indices.
pub fn tiles_for_bbox(tier: BrowseTier, bbox: (f64, f64, f64, f64)) -> Vec<(i32, i32)> {
    let (south, west, north, east) = bbox;
    let size = tier.tile_deg();
    let index = |value: f64| (value / size).floor() as i32;
    let mut tiles = vec![];
    for x in index(west)..=index(east) {
        for y in index(south)..=index(north) {
            tiles.push((x, y));
        }
    }
    tiles
}

/// Bbox covering the given tiles whole, as (south, west, north, east).
pub fn tiles_bbox(tier: BrowseTier, tiles: &[(i32, i32)]) -> Option<(f64, f64, f64, f64)> {
    let size = tier.tile_deg();
    let (mut min_x, mut max_x) = (i32::MAX, i32::MIN);
    let (mut min_y, mut max_y) = (i32::MAX, i32::MIN);
    for (x, y) in tiles {
        min_x = min_x.min(*x);
        max_x = max_x.max(*x);
        min_y = min_y.min(*y);
        max_y = max_y.max(*y);
    }
    if tiles.is_empty() {
        return None;
    }
    Some((
        f64::from(min_y) * size,
        f64::from(min_x) * size,
        f64::from(max_y + 1) * size,
        f64::from(max_x + 1) * size,
    ))
}

/// Every OSM element of the tier's kinds overlapping the bbox, with the
/// geometry to draw it. Bbox is (south, west, north, east).
pub fn browse_query(tier: BrowseTier, bbox: (f64, f64, f64, f64)) -> String {
    let (south, west, north, east) = bbox;
    let area = format!("({south},{west},{north},{east})");
    let selectors = match tier {
        // The ISO code is required, not just wanted: OSM also files the
        // border *between* two countries at admin_level 2, and those carry
        // a name like "Deutschland - Osterreich" but no code.
        BrowseTier::Countries => {
            format!(
                r#"relation[boundary=administrative][admin_level="2"][name]["ISO3166-1"]{area};"#
            )
        }
        BrowseTier::States => {
            format!(r#"relation[boundary=administrative][admin_level="4"][name]{area};"#)
        }
        BrowseTier::Ranges => {
            format!(r#"relation[place=region]["region:type"="mountain_area"][name]{area};"#)
        }
        BrowseTier::Districts => {
            format!(r#"relation[boundary=administrative][admin_level="6"][name]{area};"#)
        }
        BrowseTier::Valleys => format!(
            r#"way[natural=valley][name]{area};
  relation[natural=valley][name]{area};"#
        ),
    };
    format!(
        r#"[out:json][timeout:120];
(
  {selectors}
);
out geom;"#
    )
}

/// One region found by a browse query, ready to store.
pub struct BrowsedRegion {
    pub name: String,
    /// ISO 3166-1 alpha-2 code, when the boundary carries one.
    pub country: Option<String>,
    pub source: OutlineSource,
}

/// ISO 3166-1 alpha-2 from a boundary's own tags. States carry ISO3166-2
/// like "AT-7", whose prefix is the country; valleys carry nothing.
fn element_country(element: &Element) -> Option<String> {
    let tags = &element.tags;
    if let Some(code) = tags
        .get("ISO3166-1")
        .or_else(|| tags.get("ISO3166-1:alpha2"))
    {
        return Some(code.to_uppercase());
    }
    let (country, _) = tags.get("ISO3166-2")?.split_once('-')?;
    (country.len() == 2).then(|| country.to_uppercase())
}

/// Group a browse response into one region per name and kind. A boundary
/// split across several OSM elements merges into a single outline, which is
/// what the (name, kind) key on the table expects.
pub fn collect_browse(response: OverpassResponse) -> Vec<BrowsedRegion> {
    let mut out: Vec<BrowsedRegion> = vec![];
    for element in response.elements {
        let (Some(name), Some(kind)) = (element.tags.get("name").cloned(), outline_kind(&element))
        else {
            continue;
        };
        let lines = element_lines(&element);
        if lines.is_empty() {
            continue;
        }
        let country = element_country(&element);
        match out
            .iter_mut()
            .find(|region| region.name == name && region.source.kind == kind)
        {
            Some(existing) => {
                existing.country = existing.country.take().or(country);
                existing.source.osm_ids.push(osm_id(&element));
                existing.source.lines.extend(lines);
            }
            None => out.push(BrowsedRegion {
                name,
                country,
                source: OutlineSource {
                    kind,
                    osm_ids: vec![osm_id(&element)],
                    lines,
                },
            }),
        }
    }
    out
}

/// Store one collected outline, wrapping its ways in the GeoJSON PostGIS
/// assembles the geometry from.
pub async fn store_outline(
    pool: &PgPool,
    name: &str,
    country: Option<&str>,
    outline: &OutlineSource,
) -> Result<Option<i64>, sqlx::Error> {
    let lines = serde_json::json!({
        "type": "MultiLineString",
        "coordinates": outline.lines,
    })
    .to_string();
    upsert(
        pool,
        RegionImport {
            name,
            kind: outline.kind,
            country,
            osm_ids: &outline.osm_ids,
            lines: &lines,
        },
    )
    .await
}

/// Most regions drawn for one viewport. Past this the map is a thicket of
/// outlines and the answer is to zoom in.
pub const BROWSE_LIMIT: i64 = 120;

/// Tiles a fill is working on right now. Panning over uncovered ground asks
/// for overlapping viewports in quick succession, and assembling a district
/// boundary takes seconds - without this they would all fetch the same
/// ground at once.
static FILLING: LazyLock<Mutex<HashSet<(BrowseTier, i32, i32)>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

/// Make sure a viewport's regions are on their way, and say whether any are
/// still missing. Assembling boundaries takes long enough that the fetch
/// runs detached: the caller answers from what is stored and asks again.
pub async fn ensure_browse_fill(
    pool: &PgPool,
    tier: BrowseTier,
    bbox: (f64, f64, f64, f64),
) -> Result<bool, sqlx::Error> {
    // Countries come first: the tier's own regions are told which country
    // they are in once both are stored, and only the country boundaries can
    // say so.
    let wanted = [BrowseTier::Countries, tier];
    let mut pending = false;
    let mut work: Vec<(BrowseTier, Vec<(i32, i32)>)> = vec![];
    for tier in wanted {
        if work.iter().any(|(done, _)| *done == tier) {
            continue;
        }
        let missing = missing_tiles(pool, tier.as_str(), &tiles_for_bbox(tier, bbox)).await?;
        if missing.is_empty() {
            continue;
        }
        pending = true;
        let claimed: Vec<(i32, i32)> = {
            let mut filling = FILLING.lock().expect("fill set is not poisoned");
            missing
                .iter()
                .copied()
                .filter(|(x, y)| filling.insert((tier, *x, *y)))
                .collect()
        };
        if !claimed.is_empty() {
            work.push((tier, claimed));
        }
    }

    if !work.is_empty() {
        let pool = pool.clone();
        tokio::spawn(async move {
            for (tier, tiles) in &work {
                if let Err(err) = fill_tiles(&pool, *tier, tiles).await {
                    tracing::warn!("Filling {} region tiles failed: {err}", tier.as_str());
                }
            }
            // Over the whole country tile, not just the viewport that
            // asked: one country boundary places every region under it,
            // including those stored before it was fetched.
            let covered = tiles_for_bbox(BrowseTier::Countries, bbox);
            if let Some(area) = tiles_bbox(BrowseTier::Countries, &covered) {
                match assign_countries(&pool, area).await {
                    Ok(0) => {}
                    Ok(count) => tracing::info!("Placed {count} region(s) in their country"),
                    Err(err) => tracing::warn!("Placing regions in their country failed: {err}"),
                }
            }
            let mut filling = FILLING.lock().expect("fill set is not poisoned");
            for (tier, tiles) in &work {
                for (x, y) in tiles {
                    filling.remove(&(*tier, *x, *y));
                }
            }
        });
    }
    Ok(pending)
}

/// Fetch the tier's regions for a set of tiles from OSM and store them.
/// Tiles are marked even when they held nothing, so empty ground is asked
/// for exactly once.
async fn fill_tiles(
    pool: &PgPool,
    tier: BrowseTier,
    tiles: &[(i32, i32)],
) -> anyhow::Result<()> {
    let Some(bbox) = tiles_bbox(tier, tiles) else {
        return Ok(());
    };

    let _guard = FETCH_LOCK.lock().await;
    let response = run_query(client(), &browse_query(tier, bbox)).await?;
    let found = collect_browse(response);
    for region in &found {
        store_outline(pool, &region.name, region.country.as_deref(), &region.source).await?;
    }
    mark_tiles(pool, tier.as_str(), tiles).await?;
    tracing::info!(
        "Stored {} {} region(s) over {} tile(s)",
        found.len(),
        tier.as_str(),
        tiles.len()
    );
    Ok(())
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
            .map(|(name, _)| Region::named(name, RegionKind::Valley))
            .collect()
    } else {
        vec![]
    };
    for (kind, names_of) in NON_VALLEY_KINDS {
        for s in samples {
            for name in names_of(s) {
                if !regions.iter().any(|r| &r.name == name) {
                    regions.push(Region::named(name.clone(), kind));
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
            regions.push(Region::named(name, RegionKind::Country));
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
    fn outline_query_pivots_areas_and_searches_valleys() {
        let q = outline_query("Bezirk Imst", 47.14, 10.9);
        assert!(q.contains("is_in(47.14,10.9)"));
        assert!(q.contains(r#"["name"="Bezirk Imst"]"#));
        assert!(q.contains("relation(pivot.areas)"));
        assert!(q.contains("way(around:2000,47.14,10.9)[natural=valley]"));
        assert!(q.contains("out geom"));
    }

    #[test]
    fn collect_outline_takes_the_most_specific_kind() {
        // A valley way and the district it lies in come back together; the
        // valley is what the name stands for.
        let response: OverpassResponse = serde_json::from_str(
            r#"{"elements": [
                {"type": "relation", "id": 1, "tags": {"name": "X", "boundary": "administrative", "admin_level": "6"},
                 "members": [{"geometry": [{"lat": 47.0, "lon": 10.0}, {"lat": 47.1, "lon": 10.1}]}]},
                {"type": "way", "id": 2, "tags": {"name": "X", "natural": "valley"},
                 "geometry": [{"lat": 47.2, "lon": 10.2}, {"lat": 47.3, "lon": 10.3}]}
            ]}"#,
        )
        .expect("parses");
        let outline = collect_outline(response, "X").expect("found");
        assert_eq!(outline.kind, RegionKind::Valley);
        assert_eq!(outline.osm_ids, ["way/2"]);
        assert_eq!(outline.lines, vec![vec![[10.2, 47.2], [10.3, 47.3]]]);
    }

    #[test]
    fn collect_outline_merges_every_element_of_the_kind() {
        // OSM splits a long valley into a chain of same-named ways.
        let response: OverpassResponse = serde_json::from_str(
            r#"{"elements": [
                {"type": "way", "id": 1, "tags": {"name": "X", "natural": "valley"},
                 "geometry": [{"lat": 47.0, "lon": 10.0}, {"lat": 47.1, "lon": 10.1}]},
                {"type": "way", "id": 2, "tags": {"name": "X", "natural": "valley"},
                 "geometry": [{"lat": 47.1, "lon": 10.1}, {"lat": 47.2, "lon": 10.2}]},
                {"type": "way", "id": 3, "tags": {"name": "Other", "natural": "valley"},
                 "geometry": [{"lat": 40.0, "lon": 1.0}, {"lat": 40.1, "lon": 1.1}]}
            ]}"#,
        )
        .expect("parses");
        let outline = collect_outline(response, "X").expect("found");
        assert_eq!(outline.osm_ids, ["way/1", "way/2"]);
        assert_eq!(outline.lines.len(), 2);
    }

    #[test]
    fn collect_outline_rejects_untagged_and_geometryless_results() {
        let untracked: OverpassResponse = serde_json::from_str(
            r#"{"elements": [{"type": "way", "id": 1, "tags": {"name": "X", "natural": "wood"},
                 "geometry": [{"lat": 47.0, "lon": 10.0}, {"lat": 47.1, "lon": 10.1}]}]}"#,
        )
        .expect("parses");
        assert!(collect_outline(untracked, "X").is_none());

        let bare: OverpassResponse = serde_json::from_str(
            r#"{"elements": [{"type": "relation", "id": 1,
                 "tags": {"name": "X", "boundary": "administrative", "admin_level": "4"}}]}"#,
        )
        .expect("parses");
        assert!(collect_outline(bare, "X").is_none());
    }

    #[test]
    fn browse_tier_follows_the_viewport_width() {
        assert_eq!(BrowseTier::for_span(30.0), None);
        assert_eq!(BrowseTier::for_span(6.0), Some(BrowseTier::States));
        assert_eq!(BrowseTier::for_span(2.0), Some(BrowseTier::Ranges));
        assert_eq!(BrowseTier::for_span(1.0), Some(BrowseTier::Districts));
        assert_eq!(BrowseTier::for_span(0.7), Some(BrowseTier::Valleys));
        assert_eq!(BrowseTier::for_span(0.2), Some(BrowseTier::Valleys));
    }

    #[test]
    fn tiles_cover_the_viewport_and_snap_outwards() {
        let tiles = tiles_for_bbox(BrowseTier::Valleys, (47.1, 10.9, 47.3, 11.1));
        assert_eq!(tiles.len(), 2 * 2);
        let bbox = tiles_bbox(BrowseTier::Valleys, &tiles).expect("tiles are not empty");
        assert_eq!(bbox, (47.0, 10.75, 47.5, 11.25));
        assert_eq!(tiles_bbox(BrowseTier::Valleys, &[]), None);
    }

    #[test]
    fn browse_query_asks_only_for_the_tiers_kinds() {
        let states = browse_query(BrowseTier::States, (47.0, 10.0, 48.0, 11.0));
        assert!(states.contains(r#"[admin_level="4"]"#));
        assert!(states.contains("(47,10,48,11)"));
        assert!(!states.contains("natural=valley"));

        let districts = browse_query(BrowseTier::Districts, (47.0, 10.0, 48.0, 11.0));
        assert!(districts.contains(r#"[admin_level="6"]"#));
        assert!(!districts.contains("mountain_area"));

        let valleys = browse_query(BrowseTier::Valleys, (47.0, 10.0, 47.5, 10.5));
        assert!(valleys.contains("way[natural=valley][name]"));
        assert!(valleys.contains("relation[natural=valley][name]"));
        assert!(!valleys.contains("admin_level"));
    }

    #[test]
    fn collect_browse_groups_by_name_and_kind() {
        let response: OverpassResponse = serde_json::from_str(
            r#"{"elements": [
                {"type": "way", "id": 1, "tags": {"name": "Oetztal", "natural": "valley"},
                 "geometry": [{"lat": 47.1, "lon": 10.9}, {"lat": 47.2, "lon": 11.0}]},
                {"type": "way", "id": 2, "tags": {"name": "Oetztal", "natural": "valley"},
                 "geometry": [{"lat": 47.2, "lon": 11.0}, {"lat": 47.3, "lon": 11.1}]},
                {"type": "relation", "id": 3,
                 "tags": {"name": "Tirol", "boundary": "administrative", "admin_level": "4",
                          "ISO3166-2": "AT-7"},
                 "members": [{"geometry": [{"lat": 47.0, "lon": 10.0}, {"lat": 47.5, "lon": 10.5}]}]},
                {"type": "way", "id": 4, "tags": {"natural": "valley"},
                 "geometry": [{"lat": 47.0, "lon": 10.0}, {"lat": 47.1, "lon": 10.1}]},
                {"type": "relation", "id": 5, "tags": {"name": "Nowhere", "natural": "valley"}}
            ]}"#,
        )
        .expect("parses");
        let found = collect_browse(response);
        assert_eq!(found.len(), 2);

        let valley = &found[0];
        assert_eq!(valley.name, "Oetztal");
        assert_eq!(valley.source.kind, RegionKind::Valley);
        assert_eq!(valley.source.osm_ids, vec!["way/1", "way/2"]);
        assert_eq!(valley.source.lines.len(), 2);
        assert_eq!(valley.country, None);

        let state = &found[1];
        assert_eq!(state.name, "Tirol");
        assert_eq!(state.source.kind, RegionKind::State);
        assert_eq!(state.country.as_deref(), Some("AT"));
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
