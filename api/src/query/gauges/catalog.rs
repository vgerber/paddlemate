use sqlx::{PgPool, Row};

use super::search_gauges;
use crate::models::gauge::*;
use river_gauge::StationInfo;

// ---------------------------------------------------------------------------
// Gauge catalog: the multi-provider discovery surface (see migration 0029).
// ---------------------------------------------------------------------------

/// Default unit for a measurement type when the catalog station omits one.
pub(super) fn default_unit(mt: MeasurementType) -> &'static str {
    match mt {
        MeasurementType::WaterLevel => "cm",
        MeasurementType::Discharge => "m3s",
        MeasurementType::Temperature => "C",
    }
}

/// Upsert one provider's stations into the catalog. Idempotent on
/// (provider, station_id); refreshes metadata and `last_seen_at`.
pub async fn upsert_catalog_stations(
    pool: &PgPool,
    provider: &str,
    stations: &[StationInfo],
) -> Result<u64, sqlx::Error> {
    let mut n = 0u64;
    for s in stations {
        let res = sqlx::query(
            "INSERT INTO gauge_catalog
                 (provider, station_id, name, river, lat, lon, geom, params, last_seen_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6,
                     CASE WHEN $5 IS NOT NULL AND $6 IS NOT NULL
                          THEN ST_SetSRID(ST_MakePoint($6, $5), 4326) END,
                     $7, NOW(), NOW())
             ON CONFLICT (provider, station_id) DO UPDATE SET
                 name = EXCLUDED.name,
                 river = EXCLUDED.river,
                 lat = EXCLUDED.lat,
                 lon = EXCLUDED.lon,
                 geom = EXCLUDED.geom,
                 params = EXCLUDED.params,
                 last_seen_at = NOW(),
                 updated_at = NOW()",
        )
        .bind(provider)
        .bind(&s.station_id)
        .bind(&s.name)
        .bind(&s.river)
        .bind(s.latitude)
        .bind(s.longitude)
        .bind(&s.params)
        .execute(pool)
        .await?;
        n += res.rows_affected();
    }
    Ok(n)
}

/// Search the catalog for the picker: existing real gauges (via `search_gauges`)
/// plus catalog-only stations, nearest-first. Catalog rows already backed by a
/// real gauge are suppressed so a station never appears twice. With `river`
/// set, only catalog stations of that river (exact name, case-insensitive)
/// are returned - the real-gauge union is skipped since gauges carry no
/// river column.
pub async fn search_gauge_catalog(
    pool: &PgPool,
    q: Option<&str>,
    river: Option<&str>,
    lat: Option<f64>,
    lon: Option<f64>,
    radius_km: Option<f64>,
    limit: i64,
) -> Result<Vec<GaugeOption>, sqlx::Error> {
    // Real gauges first (already fetched), reusing the existing search.
    let mut options: Vec<GaugeOption> = if river.is_none() {
        search_gauges(pool, q, lat, lon, limit)
            .await?
            .into_iter()
            .map(|gauge| GaugeOption::Gauge {
                gauge: Box::new(gauge),
            })
            .collect()
    } else {
        Vec::new()
    };

    // Catalog-only stations. Spatial radius when a point is given, else name.
    let has_point = lat.is_some() && lon.is_some();
    let order = if has_point {
        "geom <-> ST_SetSRID(ST_MakePoint($3, $2), 4326)"
    } else {
        "name"
    };
    let radius_m = radius_km.map(|km| km * 1000.0);
    let sql = format!(
        "SELECT provider, station_id, name, river, country, lat, lon, params
         FROM gauge_catalog c
         WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
           AND ($2::float8 IS NULL OR $3::float8 IS NULL OR $4::float8 IS NULL
                OR (geom IS NOT NULL
                    AND ST_DWithin(geom::geography,
                                   ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4)))
           AND ($6::text IS NULL OR river ILIKE $6)
           AND NOT EXISTS (
                SELECT 1 FROM gauges g
                WHERE g.provider = c.provider
                  AND (g.source_id = c.station_id
                       OR starts_with(g.source_id, c.station_id || ':')))
         ORDER BY {order}
         LIMIT $5"
    );
    let rows = sqlx::query(&sql)
        .bind(q)
        .bind(lat)
        .bind(lon)
        .bind(radius_m)
        .bind(limit)
        .bind(river)
        .fetch_all(pool)
        .await?;
    for row in &rows {
        options.push(GaugeOption::Catalog {
            provider: row.try_get("provider")?,
            station_id: row.try_get("station_id")?,
            name: row.try_get("name")?,
            river: row.try_get("river")?,
            country: row.try_get("country")?,
            lat: row.try_get("lat")?,
            lon: row.try_get("lon")?,
            params: row.try_get("params")?,
        });
    }
    Ok(options)
}

/// Distinct river names from the gauge catalog matching `q`, stations-richest
/// first. Suggests gauge-backed rivers when a user proposes a new river.
pub async fn search_catalog_rivers(
    pool: &PgPool,
    q: Option<&str>,
    limit: i64,
) -> Result<Vec<CatalogRiver>, sqlx::Error> {
    sqlx::query_as!(
        CatalogRiver,
        r#"
        SELECT river AS "river!", country, COUNT(*) AS "gauge_count!",
               MIN(lat) AS min_lat, MIN(lon) AS min_lon,
               MAX(lat) AS max_lat, MAX(lon) AS max_lon
        FROM gauge_catalog
        WHERE river IS NOT NULL AND river <> ''
          AND ($1::text IS NULL OR river ILIKE '%' || $1 || '%')
        GROUP BY river, country
        ORDER BY ($1::text IS NOT NULL AND LOWER(river) = LOWER($1)) DESC,
                 COUNT(*) DESC, river
        LIMIT $2
        "#,
        q,
        limit
    )
    .fetch_all(pool)
    .await
}
