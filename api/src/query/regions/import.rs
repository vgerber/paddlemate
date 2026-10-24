use sqlx::{PgPool, Row};

use crate::models::region::RegionKind;

/// Ways of one named region, ready to be stored. The lines are the member
/// ways of every OSM element that makes the region up; PostGIS assembles the
/// area from them, so a boundary split across dozens of ways needs no ring
/// stitching here.
pub struct RegionImport<'a> {
    pub name: &'a str,
    pub kind: RegionKind,
    pub country: Option<&'a str>,
    pub osm_ids: &'a [String],
    /// The member ways as a GeoJSON MultiLineString.
    pub lines: &'a str,
}

/// How far a section may sit from a line-shaped region and still count as
/// inside it. Valleys are OSM lines along the valley floor, so a river in the
/// valley is beside the line, never on it.
const LINE_MATCH_RADIUS_M: i32 = 2_000;

/// Simplification tolerance in degrees (~55 m). Region outlines are drawn on
/// a map and used for coarse membership; full OSM detail would be megabytes
/// per state for no visible gain.
const SIMPLIFY_TOLERANCE_DEG: f64 = 0.0005;

/// Store one region's outline, replacing any previous import of the same
/// name and kind. Returns None when the ways did not yield a usable geometry.
pub async fn upsert(pool: &PgPool, import: RegionImport<'_>) -> Result<Option<i64>, sqlx::Error> {
    // Simplify the ways before assembling, not after: noding and building an
    // area from full OSM resolution costs seconds on a boundary the size of
    // a mountain range. ST_SimplifyPreserveTopology keeps every way's
    // endpoints, so neighbouring ways still meet and the rings still close.
    //
    // ST_BuildArea then turns the ways into an area whenever they do close,
    // which is every administrative boundary and mountain range. A valley
    // never closes, so its lines are kept as they are.
    let row = sqlx::query(
        "WITH src AS (
             SELECT ST_SimplifyPreserveTopology(
                 ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), $6) AS lines
         ),
         built AS (
             SELECT lines, ST_BuildArea(ST_Node(lines)) AS area FROM src
         ),
         shaped AS (
             SELECT ST_Multi(CASE WHEN area IS NULL OR ST_IsEmpty(area)
                                  THEN lines ELSE ST_MakeValid(area) END) AS geom
             FROM built
         )
         INSERT INTO regions (name, kind, country, osm_ids, geom, match_radius_m, fetched_at)
         SELECT $1, $2, $3, $4, geom,
                CASE WHEN ST_Dimension(geom) < 2 THEN $7 ELSE 0 END, NOW()
         FROM shaped
         WHERE NOT ST_IsEmpty(geom)
         ON CONFLICT (name, kind) DO UPDATE
         SET country = EXCLUDED.country, osm_ids = EXCLUDED.osm_ids, geom = EXCLUDED.geom,
             match_radius_m = EXCLUDED.match_radius_m, fetched_at = NOW()
         RETURNING id",
    )
    .bind(import.name)
    .bind(import.kind.as_str())
    .bind(import.country)
    .bind(import.osm_ids)
    .bind(import.lines)
    .bind(SIMPLIFY_TOLERANCE_DEG)
    .bind(LINE_MATCH_RADIUS_M)
    .fetch_optional(pool)
    .await?;
    row.map(|row| row.try_get("id")).transpose()
}

/// A region name carried by sections, with points inside it to look it up
/// from.
pub struct ClaimedRegion {
    pub name: String,
    /// Most common country of the sections carrying the name.
    pub country: Option<String>,
    /// Points on the sections carrying the name, best candidate first.
    pub points: Vec<(f64, f64)>,
    pub imported: bool,
}

/// Every distinct region name on a section, with points to look it up from.
/// The lookup starts on a section that carries the name, so a name that
/// exists in several countries resolves to the one our rivers are in.
///
/// The points are the same start/middle/end samples the names were derived
/// from, longest section first and midpoints first: a section along a
/// district border has its midpoint in either district, and a valley 2 km
/// from the section's start is out of reach from its end.
pub async fn claimed(pool: &PgPool) -> Result<Vec<ClaimedRegion>, sqlx::Error> {
    let rows = sqlx::query(
        "WITH claims AS (
             SELECT n.name, ws.location,
                    row_number() OVER (PARTITION BY n.name
                                       ORDER BY ST_Length(ws.location::geography) DESC) AS rank
             FROM water_sections ws, unnest(ws.regions) AS n(name)
         ),
         points AS (
             SELECT c.name, c.rank, f.frac,
                    ST_LineInterpolatePoint(c.location, f.frac) AS pt
             FROM claims c, (VALUES (0.5), (0.0), (1.0)) AS f(frac)
             WHERE c.rank <= 2
         )
         SELECT p.name,
                (SELECT ws2.country FROM water_sections ws2
                 WHERE ws2.country IS NOT NULL AND p.name = ANY(ws2.regions)
                 GROUP BY ws2.country ORDER BY COUNT(*) DESC, ws2.country LIMIT 1) AS country,
                array_agg(ST_Y(p.pt) ORDER BY p.rank, abs(p.frac - 0.5)) AS lats,
                array_agg(ST_X(p.pt) ORDER BY p.rank, abs(p.frac - 0.5)) AS lons,
                EXISTS (SELECT 1 FROM regions r WHERE r.name = p.name) AS imported
         FROM points p
         GROUP BY p.name
         ORDER BY p.name",
    )
    .fetch_all(pool)
    .await?;
    rows.iter()
        .map(|row| {
            let lats: Vec<f64> = row.try_get("lats")?;
            let lons: Vec<f64> = row.try_get("lons")?;
            Ok(ClaimedRegion {
                name: row.try_get("name")?,
                country: row.try_get("country")?,
                points: lats.into_iter().zip(lons).collect(),
                imported: row.try_get("imported")?,
            })
        })
        .collect()
}
