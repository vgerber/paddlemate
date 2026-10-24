use std::collections::{HashMap, HashSet};

use sqlx::{PgPool, Row};

use super::rows::{BBOX_COLUMNS, BY_SIZE, OUTLINE_COLUMNS, drawn_geom, to_outline};

use crate::models::{
    geometry::Geometry,
    region::{CountryBorder, RegionKind, RegionOutline},
};

/// Simplification tolerance is the viewport width over this many pixels, so
/// a drawn outline loses about a pixel of detail. Outlines are drawn in a
/// card narrower than the full screen, hence fewer pixels than borders.
const OUTLINE_PIXELS: f64 = 1500.0;

/// The same for country borders, which are drawn across a screen about this
/// many pixels wide.
const BORDER_PIXELS: f64 = 1000.0;

/// Finest tolerance for a border, in degrees (a few meters).
const MIN_TOLERANCE_DEG: f64 = 0.00005;

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
