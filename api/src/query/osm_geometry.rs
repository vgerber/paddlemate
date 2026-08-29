use sqlx::{PgPool, Row};

use crate::models::{
    geometry::Geometry,
    osm_geometry::{OsmElement, OsmElementKind, WaterwayOsmGeometry},
};

/// Fetch the cached OSM elements of a waterway, optionally one kind only.
/// Returns `None` when nothing is cached (distinct from a cached-but-empty
/// result, which cannot occur - the bin only writes rows it found).
pub async fn fetch_elements(
    pool: &PgPool,
    waterway_id: i64,
    kind: Option<OsmElementKind>,
) -> Result<Option<WaterwayOsmGeometry>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT osm_type, osm_id, kind, ST_AsGeoJSON(geom) AS geometry, fetched_at
         FROM waterway_osm_elements
         WHERE waterway_id = $1 AND ($2::text IS NULL OR kind = $2)
         ORDER BY osm_type, osm_id",
    )
    .bind(waterway_id)
    .bind(kind.map(|k| k.as_str()))
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(None);
    }

    let mut fetched_at: Option<chrono::DateTime<chrono::Utc>> = None;
    let mut elements = Vec::with_capacity(rows.len());
    for row in &rows {
        let row_fetched: chrono::DateTime<chrono::Utc> = row.try_get("fetched_at")?;
        fetched_at = Some(match fetched_at {
            Some(latest) if latest >= row_fetched => latest,
            _ => row_fetched,
        });
        let kind_str: String = row.try_get("kind")?;
        let kind = OsmElementKind::parse(&kind_str)
            .ok_or_else(|| sqlx::Error::Decode(format!("unknown kind '{kind_str}'").into()))?;
        elements.push(OsmElement {
            osm_type: row.try_get("osm_type")?,
            osm_id: row.try_get("osm_id")?,
            kind,
            geometry: Geometry::from_db(row.try_get("geometry")?)?,
        });
    }

    Ok(Some(WaterwayOsmGeometry {
        waterway_id,
        fetched_at: fetched_at.expect("non-empty rows have a timestamp"),
        elements,
    }))
}

/// Drop a waterway's cached elements. Returns how many rows were removed.
pub async fn delete_elements(pool: &PgPool, waterway_id: i64) -> Result<u64, sqlx::Error> {
    let result = sqlx::query("DELETE FROM waterway_osm_elements WHERE waterway_id = $1")
        .bind(waterway_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

/// Bounding box (south, west, north, east) of a waterway's cached elements
/// of one kind, or None when nothing is cached.
pub async fn cached_envelope(
    pool: &PgPool,
    waterway_id: i64,
    kind: OsmElementKind,
) -> Result<Option<(f64, f64, f64, f64)>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT ST_YMin(e.box) AS south, ST_XMin(e.box) AS west,
                ST_YMax(e.box) AS north, ST_XMax(e.box) AS east
         FROM (SELECT ST_Extent(geom) AS box
               FROM waterway_osm_elements
               WHERE waterway_id = $1 AND kind = $2) e
         WHERE e.box IS NOT NULL",
    )
    .bind(waterway_id)
    .bind(kind.as_str())
    .fetch_optional(pool)
    .await?;
    match row {
        None => Ok(None),
        Some(row) => Ok(Some((
            row.try_get("south")?,
            row.try_get("west")?,
            row.try_get("north")?,
            row.try_get("east")?,
        ))),
    }
}

/// Upsert elements into a waterway's cache without dropping existing rows -
/// used to extend coverage when a request falls outside the cached area.
pub async fn merge_elements(
    pool: &PgPool,
    waterway_id: i64,
    kind: OsmElementKind,
    elements: &[(String, i64, Geometry)],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for (osm_type, osm_id, geometry) in elements {
        let geojson = serde_json::to_string(geometry).map_err(|e| sqlx::Error::Decode(e.into()))?;
        sqlx::query(
            "INSERT INTO waterway_osm_elements (waterway_id, osm_type, osm_id, kind, geom)
             VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
             ON CONFLICT (waterway_id, osm_type, osm_id) DO UPDATE
             SET kind = EXCLUDED.kind, geom = EXCLUDED.geom, fetched_at = NOW()",
        )
        .bind(waterway_id)
        .bind(osm_type)
        .bind(osm_id)
        .bind(kind.as_str())
        .bind(&geojson)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}

/// Replace a waterway's cached elements of one kind with a fresh fetch.
/// Used only by the fetch_osm_geometry bin; runs in one transaction so a
/// reader never sees a half-written cache.
pub async fn replace_elements(
    pool: &PgPool,
    waterway_id: i64,
    kind: OsmElementKind,
    elements: &[(String, i64, Geometry)],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM waterway_osm_elements WHERE waterway_id = $1 AND kind = $2")
        .bind(waterway_id)
        .bind(kind.as_str())
        .execute(&mut *tx)
        .await?;
    for (osm_type, osm_id, geometry) in elements {
        let geojson = serde_json::to_string(geometry).map_err(|e| sqlx::Error::Decode(e.into()))?;
        sqlx::query(
            "INSERT INTO waterway_osm_elements (waterway_id, osm_type, osm_id, kind, geom)
             VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
             ON CONFLICT (waterway_id, osm_type, osm_id) DO UPDATE
             SET kind = EXCLUDED.kind, geom = EXCLUDED.geom, fetched_at = NOW()",
        )
        .bind(waterway_id)
        .bind(osm_type)
        .bind(osm_id)
        .bind(kind.as_str())
        .bind(&geojson)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}
