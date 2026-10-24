use super::outline::{OutlineSource, element_lines, osm_id, outline_kind};
use crate::models::region::RegionKind;
use crate::overpass::{Element, OverpassResponse};

/// Most regions drawn for one viewport of a tier. Past this the map is a
/// thicket of outlines and the answer is to zoom in.
const BROWSE_LIMIT: i64 = 120;

/// Mountain ranges are few and large: the Alps hold about 190 in an
/// eight degree view, and cutting at 120 dropped the small groups.
const RANGE_LIMIT: i64 = 300;

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

    /// Tier drawing a kind asked for by name. Countries are not a choice.
    pub fn for_kind(kind: RegionKind) -> Option<Self> {
        match kind {
            RegionKind::State => Some(BrowseTier::States),
            RegionKind::Range => Some(BrowseTier::Ranges),
            RegionKind::District => Some(BrowseTier::Districts),
            RegionKind::Valley => Some(BrowseTier::Valleys),
            RegionKind::Country => None,
        }
    }

    /// The kind this tier draws.
    pub fn kind(self) -> RegionKind {
        match self {
            BrowseTier::Countries => RegionKind::Country,
            BrowseTier::States => RegionKind::State,
            BrowseTier::Ranges => RegionKind::Range,
            BrowseTier::Districts => RegionKind::District,
            BrowseTier::Valleys => RegionKind::Valley,
        }
    }

    /// Widest viewport, in degrees, at which a kind asked for by name is
    /// still drawn. Beyond it the outlines are a thicket (or cost too much
    /// to assemble) and the app is told to zoom in.
    pub fn max_span(self) -> f64 {
        match self {
            BrowseTier::Countries => 0.0,
            BrowseTier::States => 12.0,
            BrowseTier::Ranges => 8.0,
            BrowseTier::Districts => 6.0,
            BrowseTier::Valleys => 3.0,
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

    /// Most outlines of this tier returned for one viewport.
    pub fn limit(self) -> i64 {
        match self {
            BrowseTier::Ranges => RANGE_LIMIT,
            _ => BROWSE_LIMIT,
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

/// The tiers a `kinds` list may name, most specific first.
pub const CHOOSABLE_TIERS: [BrowseTier; 4] = [
    BrowseTier::Valleys,
    BrowseTier::Districts,
    BrowseTier::Ranges,
    BrowseTier::States,
];

/// The kinds a `kinds` list may name, as the comma list the API documents.
pub fn choosable_kinds() -> String {
    let names: Vec<&str> = CHOOSABLE_TIERS
        .iter()
        .map(|tier| tier.kind().as_str())
        .collect();
    names.join(", ")
}

/// The widest viewport per choosable kind, as the API documents it.
pub fn span_limits() -> String {
    let limits: Vec<String> = CHOOSABLE_TIERS
        .iter()
        .map(|tier| format!("{} {}", tier.kind().as_str(), tier.max_span()))
        .collect();
    limits.join(", ")
}

/// Parse a `kinds` list into tiers, most specific first, without repeats.
/// The error is the message for the 400.
pub fn parse_kinds(raw: &str) -> Result<Vec<BrowseTier>, String> {
    let mut tiers = vec![];
    for part in raw.split(',').map(str::trim).filter(|p| !p.is_empty()) {
        let tier = RegionKind::parse(part).and_then(BrowseTier::for_kind);
        let Some(tier) = tier else {
            return Err(format!(
                "kinds must be a comma list of {}",
                choosable_kinds()
            ));
        };
        if !tiers.contains(&tier) {
            tiers.push(tier);
        }
    }
    if tiers.is_empty() {
        return Err(format!(
            "kinds must be a comma list of {}",
            choosable_kinds()
        ));
    }
    tiers.sort_by(|a, b| a.max_span().total_cmp(&b.max_span()));
    Ok(tiers)
}

/// The tiers to draw for a viewport span, and the asked-for kinds the span is
/// too wide for. Without a choice the span picks one tier, or none when the
/// map is zoomed out past every tier.
pub fn tiers_for_span(
    chosen: Option<Vec<BrowseTier>>,
    span: f64,
) -> (Vec<BrowseTier>, Vec<RegionKind>) {
    match chosen {
        Some(tiers) => {
            let (shown, hidden): (Vec<_>, Vec<_>) =
                tiers.into_iter().partition(|tier| span <= tier.max_span());
            (shown, hidden.iter().map(|tier| tier.kind()).collect())
        }
        None => (BrowseTier::for_span(span).into_iter().collect(), vec![]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn kinds_parse_sorted_and_deduplicated() {
        let tiers = parse_kinds("state, valley,state,range").unwrap();
        assert_eq!(
            tiers,
            [BrowseTier::Valleys, BrowseTier::Ranges, BrowseTier::States]
        );
    }

    #[test]
    fn kinds_reject_unknown_empty_and_country() {
        for raw in ["", " , ", "lake", "valley,country", "Valley"] {
            let err = parse_kinds(raw).unwrap_err();
            assert!(err.contains("valley, district, range, state"), "{raw}");
        }
    }

    #[test]
    fn wide_views_hide_the_kinds_they_are_too_wide_for() {
        let chosen = parse_kinds("valley,district,state").unwrap();
        let (shown, hidden) = tiers_for_span(Some(chosen), 4.0);
        assert_eq!(shown, [BrowseTier::Districts, BrowseTier::States]);
        assert_eq!(hidden, [RegionKind::Valley]);
    }

    #[test]
    fn no_choice_lets_the_span_pick_one_tier() {
        assert_eq!(
            tiers_for_span(None, 1.0),
            (vec![BrowseTier::Districts], vec![])
        );
        assert_eq!(tiers_for_span(None, 20.0), (vec![], vec![]));
    }
}
