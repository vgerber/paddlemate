use sqlx::{Row, postgres::PgRow, types::Json};

use crate::models::{
    geometry::Geometry,
    region::{Region, RegionKind, RegionOutline, RegionRef},
};

pub(super) fn to_region(row: &PgRow) -> Result<Region, sqlx::Error> {
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
pub(super) const PARENTS_SQL: &str = "(SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind)
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
pub(super) fn drawn_geom() -> String {
    format!(
        "CASE WHEN match_radius_m > 0 \
         THEN ST_Buffer(geom::geography, {DRAWN_VALLEY_RADIUS_M}, 'endcap=flat')::geometry \
         ELSE geom END"
    )
}

pub(super) const BBOX_COLUMNS: &str = "ST_XMin(drawn) AS west, ST_YMin(drawn) AS south, \
                            ST_XMax(drawn) AS east, ST_YMax(drawn) AS north";

/// Order that puts the largest region first, so the small ones draw on top
/// of it and win the click. Envelope area covers lines too.
pub(super) const BY_SIZE: &str = "ORDER BY ST_Area(ST_Envelope(geom)) DESC, name";

pub(super) fn to_outline(row: &PgRow) -> Result<RegionOutline, sqlx::Error> {
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
pub(super) const OUTLINE_COLUMNS: &str = "id, name, kind, country, ST_AsGeoJSON(drawn) AS geometry";
