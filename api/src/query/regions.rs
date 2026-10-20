use std::collections::{HashMap, HashSet};

use sqlx::{PgPool, Row, postgres::PgRow, types::Json};

use super::FUZZY_MIN_CHARS;
use crate::models::{
    geometry::Geometry,
    region::{CountryBorder, Region, RegionKind, RegionOutline, RegionRef},
};

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

fn to_region(row: &PgRow) -> Result<Region, sqlx::Error> {
    let kind: String = row.try_get("kind")?;
    Ok(Region {
        id: Some(row.try_get("id")?),
        name: row.try_get("name")?,
        kind: RegionKind::parse(&kind)
            .ok_or_else(|| sqlx::Error::Decode(format!("unknown region kind '{kind}'").into()))?,
        country: row.try_get("country")?,
        bbox: Some([
            row.try_get("west")?,
            row.try_get("south")?,
            row.try_get("east")?,
            row.try_get("north")?,
        ]),
        parents: match row.try_get::<Option<Json<Vec<RegionRef>>>, _>("parents") {
            Ok(parents) => parents.map(|p| p.0).unwrap_or_default(),
            Err(err) => return Err(err),
        },
    })
}

/// Parent chain of the region aliased `r`: at most one region per kind,
/// containing a point on `r`, most specific first. Valleys and districts
/// nest in districts and states; every kind but a country lists its country,
/// and a range skips the states it spans.
const PARENTS_SQL: &str = "(SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind)
                                      ORDER BY array_position(ARRAY['district', 'state', 'country'], x.kind))
         FROM (SELECT DISTINCT ON (p.kind) p.id, p.name, p.kind
               FROM regions p
               WHERE p.id <> r.id
                 AND p.match_radius_m = 0
                 AND r.kind <> 'country'
                 AND (p.kind = 'country'
                      OR (r.kind <> 'range'
                          AND p.kind IN ('district', 'state')
                          AND array_position(ARRAY['valley', 'district', 'state'], p.kind)
                              > array_position(ARRAY['valley', 'district', 'state'], r.kind)))
                 AND p.geom && ST_PointOnSurface(r.geom)
                 AND ST_Contains(p.geom, ST_PointOnSurface(r.geom))
               ORDER BY p.kind, ST_Area(ST_Envelope(p.geom))) x) AS parents";

/// Half-width of the corridor a valley is drawn as.
///
/// Deliberately far below `match_radius_m`. That radius is the tolerance the
/// filter allows around the centreline, and it has to be generous because
/// OSM often traces one side of a valley rather than its axis - in the
/// Oetztal a real section sits 1.4 km off the line. Drawing the tolerance
/// would claim every valley is four kilometres wide with rounded ends, and
/// the median valley line is only two kilometres long, so that comes out as
/// a circle bigger than the valley itself. This is a valley floor's
/// half-width instead, cut flat at the ends so a short valley still reads as
/// a corridor rather than a blob.
const DRAWN_VALLEY_RADIUS_M: i32 = 800;

/// Geometry as drawn: the boundary itself for an area, and for a valley a
/// corridor along its centreline. Drawn bare, a valley line vanishes under
/// the river it follows.
fn drawn_geom() -> String {
    format!(
        "CASE WHEN match_radius_m > 0 \
         THEN ST_Buffer(geom::geography, {DRAWN_VALLEY_RADIUS_M}, 'endcap=flat')::geometry \
         ELSE geom END"
    )
}

const BBOX_COLUMNS: &str = "ST_XMin(drawn) AS west, ST_YMin(drawn) AS south, \
                            ST_XMax(drawn) AS east, ST_YMax(drawn) AS north";

/// Simplification tolerance is the viewport width over this many pixels, so
/// a drawn outline loses about a pixel of detail. Outlines are drawn in a
/// card narrower than the full screen, hence fewer pixels than borders.
const OUTLINE_PIXELS: f64 = 1500.0;

/// The same for country borders, which are drawn across a screen about this
/// many pixels wide.
const BORDER_PIXELS: f64 = 1000.0;

/// Finest tolerance for a border, in degrees (a few meters).
const MIN_TOLERANCE_DEG: f64 = 0.00005;

/// Order that puts the largest region first, so the small ones draw on top
/// of it and win the click. Envelope area covers lines too.
const BY_SIZE: &str = "ORDER BY ST_Area(ST_Envelope(geom)) DESC, name";

/// Countries whose English name matches the search term `$1`.
const COUNTRY_MATCH: &str = "SELECT cn.country FROM country_names cn
     WHERE public.search_key(cn.name) LIKE public.search_key($1) || '%'
        OR ($5 AND public.search_key(cn.name) %> public.search_key($1))";

/// Imported regions matching a name fragment, most specific kind first.
/// Diacritics and common misspellings fold the same way as the river search,
/// so "Otztal" finds "Ötztal" and "Tirool" finds "Tirol". An English country
/// name ("Austria") lists the regions of that country, after name matches.
pub async fn search(
    pool: &PgPool,
    name: Option<&str>,
    kind: Option<RegionKind>,
    country: Option<&str>,
    limit: i64,
) -> Result<Vec<Region>, sqlx::Error> {
    let drawn = drawn_geom();
    let fuzzy = name.is_some_and(|n| n.chars().count() >= FUZZY_MIN_CHARS);
    // Tier 0 exact, 1 contains, 2 only the country matched, 3 misspelt.
    // Within the country tier the larger kinds lead: thirty valleys would
    // say little about a country.
    let ranking = "ORDER BY tier,
                   array_position(CASE WHEN tier = 2
                                       THEN ARRAY['state', 'range', 'district', 'valley']
                                       ELSE ARRAY['valley', 'district', 'state', 'range'] END, kind),
                   name";
    let rows = sqlx::query(&format!(
        "SELECT id, name, kind, country, parents, {BBOX_COLUMNS}
         FROM (
             SELECT id, name, kind, country, {drawn} AS drawn, {PARENTS_SQL}, tier
             FROM (
                 SELECT r.*,
                        CASE WHEN $1::text IS NULL OR public.search_key(r.name) = public.search_key($1) THEN 0
                             WHEN public.search_key(r.name) LIKE '%' || public.search_key($1) || '%' THEN 1
                             WHEN r.country IN ({COUNTRY_MATCH}) THEN 2
                             ELSE 3 END AS tier
                 FROM regions r
                 WHERE r.kind <> 'country'
                   AND ($1::text IS NULL
                        OR public.search_key(r.name) LIKE '%' || public.search_key($1) || '%'
                        OR ($5 AND public.search_key(r.name) %> public.search_key($1))
                        OR r.country IN ({COUNTRY_MATCH}))
                   AND ($2::text IS NULL OR r.kind = $2)
                   AND ($3::text IS NULL OR r.country = $3)
             ) r
             {ranking}
             LIMIT $4
         ) matched
         {ranking}"
    ))
    .bind(name)
    .bind(kind.map(RegionKind::as_str))
    .bind(country.map(str::to_uppercase))
    .bind(limit)
    .bind(fuzzy)
    .fetch_all(pool)
    .await?;
    rows.iter().map(to_region).collect()
}

fn to_outline(row: &PgRow) -> Result<RegionOutline, sqlx::Error> {
    let region = to_region(row)?;
    Ok(RegionOutline {
        id: region.id.expect("id column is selected"),
        name: region.name,
        kind: region.kind,
        country: region.country,
        bbox: region.bbox.expect("bbox columns are selected"),
        geometry: Geometry::from_db(row.try_get("geometry")?)?,
        palette_index: 0,
    })
}

/// Columns of one drawable region, over a subselect aliased `drawn`.
const OUTLINE_COLUMNS: &str = "id, name, kind, country, ST_AsGeoJSON(drawn) AS geometry";

/// One region with its boundary.
pub async fn fetch(pool: &PgPool, id: i64) -> Result<Option<RegionOutline>, sqlx::Error> {
    let drawn = drawn_geom();
    let row = sqlx::query(&format!(
        "SELECT {OUTLINE_COLUMNS}, {BBOX_COLUMNS}, NULL::jsonb AS parents
         FROM (
             SELECT id, name, kind, country, {drawn} AS drawn
             FROM regions WHERE id = $1
         ) one"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;
    row.as_ref().map(to_outline).transpose()
}

/// Every stored region of the given kinds overlapping a viewport, largest
/// first. When more than `limit` overlap, the ones with the most ground
/// inside the viewport are kept, not the ones that are biggest overall. Reads only what is already imported; filling the viewport from OSM
/// is the browse module's job.
pub async fn in_bbox(
    pool: &PgPool,
    bbox: (f64, f64, f64, f64),
    kinds: &[RegionKind],
    limit: i64,
) -> Result<Vec<RegionOutline>, sqlx::Error> {
    let (south, west, north, east) = bbox;
    let drawn = drawn_geom();
    // Stored outlines are far finer than a screen: a Europe-wide state view
    // was 5 MB of vertices. Thin them to about a pixel of the viewport.
    let tolerance = (east - west).max(north - south) / OUTLINE_PIXELS;
    let kinds: Vec<&str> = kinds.iter().copied().map(RegionKind::as_str).collect();
    // Overlaps are found on the thinned shapes, which is what is drawn.
    let rows = sqlx::query(&format!(
        "WITH visible AS MATERIALIZED (
             SELECT id, name, kind, country, rank,
                    ST_SimplifyPreserveTopology({drawn}, $7) AS drawn
             FROM (
                 SELECT *, ROW_NUMBER() OVER ({BY_SIZE}) AS rank FROM (
                     SELECT * FROM regions
                     WHERE kind = ANY($1)
                       AND geom && ST_MakeEnvelope($2, $3, $4, $5, 4326)
                       AND (match_radius_m > 0
                            OR ST_Intersects(geom, ST_MakeEnvelope($2, $3, $4, $5, 4326)))
                     ORDER BY ST_Area(ST_Intersection(ST_Envelope(geom),
                                      ST_MakeEnvelope($2, $3, $4, $5, 4326))) DESC, name
                     LIMIT $6
                 ) cut
             ) picked
         )
         SELECT {OUTLINE_COLUMNS}, {BBOX_COLUMNS}, NULL::jsonb AS parents,
                ARRAY(SELECT o.id FROM visible o
                      WHERE o.id > v.id AND o.drawn && v.drawn
                        AND ST_Intersects(o.drawn, v.drawn)) AS overlaps
         FROM visible v
         ORDER BY rank"
    ))
    .bind(&kinds)
    .bind(west)
    .bind(south)
    .bind(east)
    .bind(north)
    .bind(limit)
    .bind(tolerance)
    .fetch_all(pool)
    .await?;
    let pairs: Vec<(i64, i64)> = rows
        .iter()
        .map(|row| {
            let id: i64 = row.try_get("id")?;
            let overlaps: Vec<i64> = row.try_get("overlaps")?;
            Ok(overlaps.into_iter().map(move |other| (id, other)))
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?
        .into_iter()
        .flatten()
        .collect();
    let mut outlines: Vec<RegionOutline> = rows.iter().map(to_outline).collect::<Result<_, _>>()?;
    let ids: Vec<i64> = outlines.iter().map(|region| region.id).collect();
    let indexes = palette_indexes(&ids, &pairs);
    for region in &mut outlines {
        region.palette_index = indexes.get(&region.id).copied().unwrap_or(0);
    }
    Ok(outlines)
}

/// Give overlapping regions different palette indexes, so the map can colour
/// them apart instead of washing the viewport in one hue.
///
/// Welsh-Powell: take the most crowded region first and give it the lowest
/// index none of its neighbours already has. Four colours are enough to
/// paint a map of countries, but these regions overlap rather than tile the
/// plane - a valley corridor can cross a dozen others - so a busy viewport
/// needs more, and the client repeats its palette if it runs out.
fn palette_indexes(ids: &[i64], overlaps: &[(i64, i64)]) -> HashMap<i64, i32> {
    let mut neighbours: HashMap<i64, Vec<i64>> = HashMap::new();
    for (left, right) in overlaps {
        neighbours.entry(*left).or_default().push(*right);
        neighbours.entry(*right).or_default().push(*left);
    }

    let mut order = ids.to_vec();
    // Most crowded first, then by id so the same viewport always colours the
    // same way and panning back does not reshuffle the map.
    order.sort_by_key(|id| {
        (
            std::cmp::Reverse(neighbours.get(id).map_or(0, Vec::len)),
            *id,
        )
    });

    let mut chosen: HashMap<i64, i32> = HashMap::new();
    for id in order {
        let taken: HashSet<i32> = neighbours
            .get(&id)
            .into_iter()
            .flatten()
            .filter_map(|other| chosen.get(other).copied())
            .collect();
        let index = (0..)
            .find(|i| !taken.contains(i))
            .expect("range is endless");
        chosen.insert(id, index);
    }
    chosen
}

/// Give every region in a bbox that does not know its country the country
/// whose boundary contains it. Only states carry an ISO code in their own
/// OSM tags, so for districts, ranges and valleys this is the only way.
/// Runs after a fill, and picks up rows stored before their country was.
pub async fn assign_countries(
    pool: &PgPool,
    bbox: (f64, f64, f64, f64),
) -> Result<u64, sqlx::Error> {
    let (south, west, north, east) = bbox;
    // The country sharing the most area (or line length, for a valley) wins,
    // so a range straddling a border is labelled by where most of it lies,
    // not by whichever side its centre point happens to fall on.
    let done = sqlx::query(
        "UPDATE regions r
         SET country = (
             SELECT c.country FROM regions c
             WHERE c.kind = 'country' AND c.country IS NOT NULL
               AND c.geom && r.geom AND ST_Intersects(c.geom, r.geom)
             ORDER BY ST_Area(ST_Intersection(c.geom, r.geom))
                    + ST_Length(ST_Intersection(c.geom, r.geom)) DESC, c.country
             LIMIT 1)
         WHERE r.country IS NULL
           AND r.kind <> 'country'
           AND r.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)",
    )
    .bind(west)
    .bind(south)
    .bind(east)
    .bind(north)
    .execute(pool)
    .await?;
    Ok(done.rows_affected())
}

/// Country borders crossing a viewport.
///
/// Only the piece of each boundary that is actually in view is returned:
/// whole a country is hundreds of kilobytes, and clipped to a viewport it is
/// under a kilobyte. Clipping the boundary line rather than the polygon
/// keeps the edge of the screen from looking like a border.
///
/// The country on the far side comes from `country_borders`, kept up to date
/// by a trigger on `regions`; a distance test against whole country
/// polygons took a minute at Europe scale.
pub async fn country_borders(
    pool: &PgPool,
    bbox: (f64, f64, f64, f64),
) -> Result<Vec<CountryBorder>, sqlx::Error> {
    let (south, west, north, east) = bbox;
    // A pixel's worth of detail on a screen about a thousand pixels wide.
    let tolerance = ((east - west) / BORDER_PIXELS).max(MIN_TOLERANCE_DEG);
    let rows = sqlx::query(
        "WITH box AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS g)
         SELECT b.name, b.country,
                ST_AsGeoJSON(ST_SimplifyPreserveTopology(b.line, $5)) AS geometry,
                ARRAY(SELECT n.neighbour::text FROM country_borders n, box
                      WHERE n.country = b.country AND n.line && box.g
                        AND ST_Intersects(n.line, box.g)
                      ORDER BY n.neighbour) AS neighbours
         FROM (SELECT r.name, r.country,
                      ST_Intersection(ST_Boundary(r.geom), box.g) AS line
               FROM regions r, box
               WHERE r.kind = 'country' AND r.country IS NOT NULL
                 AND r.geom && box.g) b
         WHERE NOT ST_IsEmpty(b.line)
         ORDER BY b.country",
    )
    .bind(west)
    .bind(south)
    .bind(east)
    .bind(north)
    .bind(tolerance)
    .fetch_all(pool)
    .await?;
    rows.iter()
        .map(|row| {
            Ok(CountryBorder {
                name: row.try_get("name")?,
                country: row.try_get("country")?,
                neighbours: row.try_get("neighbours")?,
                geometry: Geometry::from_db(row.try_get("geometry")?)?,
            })
        })
        .collect()
}

/// Tiles of a tier the browse layer has never fetched from OSM.
pub async fn missing_tiles(
    pool: &PgPool,
    tier: &str,
    tiles: &[(i32, i32)],
) -> Result<Vec<(i32, i32)>, sqlx::Error> {
    let (xs, ys): (Vec<i32>, Vec<i32>) = tiles.iter().copied().unzip();
    let rows = sqlx::query(
        "SELECT t.x, t.y
         FROM unnest($2::int[], $3::int[]) AS t(x, y)
         WHERE NOT EXISTS (
             SELECT 1 FROM region_tiles r
             WHERE r.tier = $1 AND r.x = t.x AND r.y = t.y
         )",
    )
    .bind(tier)
    .bind(&xs)
    .bind(&ys)
    .fetch_all(pool)
    .await?;
    rows.iter()
        .map(|row| Ok((row.try_get("x")?, row.try_get("y")?)))
        .collect()
}

/// Record tiles as fetched, so panning back over them costs no OSM request.
pub async fn mark_tiles(
    pool: &PgPool,
    tier: &str,
    tiles: &[(i32, i32)],
) -> Result<(), sqlx::Error> {
    let (xs, ys): (Vec<i32>, Vec<i32>) = tiles.iter().copied().unzip();
    sqlx::query(
        "INSERT INTO region_tiles (tier, x, y)
         SELECT $1, t.x, t.y FROM unnest($2::int[], $3::int[]) AS t(x, y)
         ON CONFLICT (tier, x, y) DO UPDATE SET fetched_at = NOW()",
    )
    .bind(tier)
    .bind(&xs)
    .bind(&ys)
    .execute(pool)
    .await?;
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlapping_regions_never_share_a_palette_index() {
        // 1, 2 and 3 all overlap each other; 4 only touches 1.
        let overlaps = [(1, 2), (1, 3), (2, 3), (1, 4)];
        let indexes = palette_indexes(&[1, 2, 3, 4], &overlaps);
        for (left, right) in overlaps {
            assert_ne!(
                indexes[&left], indexes[&right],
                "{left} and {right} overlap but share an index"
            );
        }
        // Three mutually overlapping regions need three indexes, and the
        // fourth reuses one rather than inventing a fourth.
        assert_eq!(indexes.values().copied().max(), Some(2));
    }

    #[test]
    fn regions_that_never_meet_all_take_the_first_index() {
        let indexes = palette_indexes(&[7, 8, 9], &[]);
        assert_eq!(
            indexes.values().copied().collect::<HashSet<_>>(),
            [0].into()
        );
    }
}
