//! Shared Overpass client for the OSM geometry cache: query building,
//! response parsing and the read-through fill used by the osm-geometry
//! endpoint on a cache miss. The fetch_osm_geometry bin reuses the same
//! pieces so a backfilled and a request-time fetch store identical rows.

use std::sync::OnceLock;
use std::time::Duration;

use serde::Deserialize;
use sqlx::PgPool;
use tokio::sync::Mutex;

use crate::models::{geometry::Geometry, osm_geometry::OsmElementKind};
use crate::query::osm_geometry::{cached_envelope, merge_elements};

/// Public fallback instances, used when OVERPASS_URLS is not set.
const PUBLIC_OVERPASS_URLS: [&str; 3] = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
];

/// Endpoints tried in order per query. OVERPASS_URLS (comma-separated)
/// overrides the default public list - production puts the self-hosted
/// rivers-only instance first and keeps the public ones as fallback.
pub fn endpoints() -> &'static [String] {
    static ENDPOINTS: OnceLock<Vec<String>> = OnceLock::new();
    ENDPOINTS.get_or_init(|| {
        let configured: Vec<String> = std::env::var("OVERPASS_URLS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect();
        if configured.is_empty() {
            PUBLIC_OVERPASS_URLS.iter().map(|s| s.to_string()).collect()
        } else {
            configured
        }
    })
}
/// Bbox margin around the sections, in degrees (~15 km).
pub const BBOX_BUFFER_DEG: f64 = 0.15;

#[derive(Deserialize)]
pub struct OverpassResponse {
    #[serde(default)]
    pub elements: Vec<Element>,
}

#[derive(Deserialize)]
pub struct Element {
    #[serde(rename = "type")]
    pub element_type: String,
    pub id: i64,
    #[serde(default)]
    pub geometry: Vec<Node>,
    /// Member ways of a relation, present when it was fetched with `out geom`.
    #[serde(default)]
    pub members: Vec<Member>,
    #[serde(default)]
    pub tags: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct Member {
    #[serde(default)]
    pub geometry: Vec<Node>,
}

#[derive(Deserialize)]
pub struct Node {
    pub lat: f64,
    pub lon: f64,
}

/// Escape characters that are regex metacharacters in Overpass filters,
/// mirroring the frontend's escapeOverpassRegex.
pub fn escape_overpass_regex(name: &str) -> String {
    name.chars()
        .flat_map(|c| match c {
            '(' | ')' | '+' | '.' | '\\' => vec!['\\', c],
            _ => vec![c],
        })
        .collect()
}

/// Escape a value used inside an exact Overpass tag filter ("name"="X").
pub fn escape_overpass_literal(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

/// The wizard's centerline query: river/stream ways matching the name
/// (default or German) inside the bbox, with per-node geometry.
pub fn centerline_query(name: &str, bbox: (f64, f64, f64, f64)) -> String {
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
pub fn to_cache_elements(response: OverpassResponse) -> Vec<(String, i64, Geometry)> {
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

/// IPv4-bound client (the production container has no IPv6 route).
pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("paddlemate-osm-geometry-cache")
            .local_address(std::net::IpAddr::from([0, 0, 0, 0]))
            .timeout(Duration::from_secs(40))
            .build()
            .expect("reqwest client builds")
    })
}

/// Run one query against the mirrors in order, returning the first success.
pub async fn run_query(client: &reqwest::Client, query: &str) -> anyhow::Result<OverpassResponse> {
    let mut last_error = None;
    for url in endpoints() {
        let result = async {
            let resp = client.post(url).body(query.to_string()).send().await?;
            let resp = resp.error_for_status()?;
            Ok::<_, anyhow::Error>(resp.json::<OverpassResponse>().await?)
        }
        .await;
        match result {
            Ok(parsed) => return Ok(parsed),
            Err(err) => {
                tracing::warn!("Overpass request failed ({url}): {err}");
                last_error = Some(err);
            }
        }
    }
    Err(last_error.expect("at least one endpoint was tried"))
}

/// One Overpass fetch at a time across all requests - Overpass allows very
/// few requests per IP, and concurrent misses must not stampede it.
pub static FETCH_LOCK: Mutex<()> = Mutex::const_new(());

/// Margin (degrees) when testing whether a cached envelope covers a request.
const COVER_MARGIN_DEG: f64 = 0.02;

fn envelope_covers(envelope: (f64, f64, f64, f64), bbox: (f64, f64, f64, f64)) -> bool {
    let (cs, cw, cn, ce) = envelope;
    let (s, w, n, e) = bbox;
    s >= cs - COVER_MARGIN_DEG
        && w >= cw - COVER_MARGIN_DEG
        && n <= cn + COVER_MARGIN_DEG
        && e <= ce + COVER_MARGIN_DEG
}

/// Fill or extend the centerline cache for one waterway on demand. The
/// Overpass query is bounded by the waterway's sections bbox when it has
/// sections, otherwise by the caller-provided bbox (the wizard's viewport).
/// When rows are already cached but the requested bbox falls outside their
/// envelope, the requested area is fetched and merged in. Returns false when
/// nothing could be cached (no bbox to bound the query, no OSM match, or
/// Overpass down).
pub async fn fill_centerline(
    pool: &PgPool,
    waterway_id: i64,
    bbox_hint: Option<(f64, f64, f64, f64)>,
) -> anyhow::Result<bool> {
    let covered = |envelope: Option<(f64, f64, f64, f64)>| match (envelope, bbox_hint) {
        (Some(_), None) => true,
        (Some(envelope), Some(hint)) => envelope_covers(envelope, hint),
        (None, _) => false,
    };

    // Fast path without the lock, so covered requests never wait behind a
    // running Overpass fetch.
    if covered(cached_envelope(pool, waterway_id, OsmElementKind::Centerline).await?) {
        return Ok(true);
    }

    let _guard = FETCH_LOCK.lock().await;

    // A concurrent request may have filled the cache while we waited.
    let envelope = cached_envelope(pool, waterway_id, OsmElementKind::Centerline).await?;
    if covered(envelope) {
        return Ok(true);
    }

    let Some(w) = sqlx::query!(
        r#"SELECT w.name,
                  MIN(ST_YMin(ws.location::geometry)) AS "south",
                  MIN(ST_XMin(ws.location::geometry)) AS "west",
                  MAX(ST_YMax(ws.location::geometry)) AS "north",
                  MAX(ST_XMax(ws.location::geometry)) AS "east"
           FROM waterways w
           LEFT JOIN water_sections ws ON ws.waterway_id = w.id
           WHERE w.id = $1
           GROUP BY w.id, w.name"#,
        waterway_id
    )
    .fetch_optional(pool)
    .await?
    else {
        return Ok(false);
    };

    let sections_bbox = match (w.south, w.west, w.north, w.east) {
        (Some(s), Some(west), Some(n), Some(e)) => Some((
            s - BBOX_BUFFER_DEG,
            west - BBOX_BUFFER_DEG,
            n + BBOX_BUFFER_DEG,
            e + BBOX_BUFFER_DEG,
        )),
        _ => None,
    };
    // With cached rows the miss is a coverage gap - fetch the requested
    // area; on a fresh fill prefer the sections bbox (whole known course).
    let fetch_bbox = if envelope.is_some() {
        bbox_hint.or(sections_bbox)
    } else {
        sections_bbox.or(bbox_hint)
    };
    let Some(bbox) = fetch_bbox else {
        return Ok(false);
    };

    let query = centerline_query(&w.name, bbox);
    let response = run_query(client(), &query).await?;
    let elements = to_cache_elements(response);
    if elements.is_empty() {
        return Ok(envelope.is_some());
    }
    let count = elements.len();
    merge_elements(pool, waterway_id, OsmElementKind::Centerline, &elements).await?;
    tracing::info!(
        "Cached OSM centerline for waterway {waterway_id} on demand ({count} fragments)"
    );
    Ok(true)
}

/// All waterway=river ways within `radius_m` of the corridor polyline - the
/// raw material for routing across confluences. Proxied server-side so the
/// client never talks to Overpass; not cached (the corridor is ad hoc).
pub async fn fetch_network_around_line(
    line: &[(f64, f64)],
    radius_m: f64,
) -> anyhow::Result<Vec<Geometry>> {
    let _guard = FETCH_LOCK.lock().await;
    let line_string = line
        .iter()
        .map(|(lon, lat)| format!("{lat},{lon}"))
        .collect::<Vec<_>>()
        .join(",");
    let query = format!(
        r#"[out:json][timeout:30];
way["waterway"="river"](around:{},{line_string});
out geom qt;"#,
        radius_m.round()
    );
    let response = run_query(client(), &query).await?;
    Ok(to_cache_elements(response)
        .into_iter()
        .map(|(_, _, geometry)| geometry)
        .collect())
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
