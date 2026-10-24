use sqlx::PgPool;

use super::VALLEY_RADIUS_M;
use crate::models::region::RegionKind;
use crate::overpass::{Element, OverpassResponse, escape_overpass_literal};
use crate::query::regions::{RegionImport, upsert};

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
pub(super) fn outline_kind(element: &Element) -> Option<RegionKind> {
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

/// Provenance of one OSM element, as "way/123" or "relation/456".
pub(super) fn osm_id(element: &Element) -> String {
    format!("{}/{}", element.element_type, element.id)
}

/// Every drawable way of an element: its own geometry for a way, its member
/// ways for a relation fetched with `out geom`.
pub(super) fn element_lines(element: &Element) -> Vec<Vec<[f64; 2]>> {
    std::iter::once(&element.geometry)
        .chain(element.members.iter().map(|member| &member.geometry))
        .filter(|way| way.len() >= 2)
        .map(|way| way.iter().map(|node| [node.lon, node.lat]).collect())
        .collect()
}

/// Pick the region an outline response describes: the most specific kind it
/// contains, with every element of that kind merged. Merging matters for
/// valleys, which OSM splits into a chain of separate named ways.
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
