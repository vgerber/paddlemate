use sqlx::{PgPool, Row};

use super::{GAUGE_COLS, fetch_gauge_with_series, row_to_gauge};
use crate::models::gauge::*;

/// Distinct providers that currently have at least one active gauge. Used by
/// the poll supervisor to decide which per-provider tasks must exist.
pub async fn list_active_providers(pool: &PgPool) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query("SELECT DISTINCT provider FROM gauges WHERE active = TRUE")
        .fetch_all(pool)
        .await?;
    rows.iter().map(|r| r.try_get("provider")).collect()
}

/// Active gauges for one provider. A provider's poll loop re-reads this every
/// cycle so a newly linked gauge is fetched without a restart.
pub async fn list_active_gauges_by_provider(
    pool: &PgPool,
    provider: &str,
) -> Result<Vec<Gauge>, sqlx::Error> {
    sqlx::query(&format!(
        "SELECT {GAUGE_COLS} FROM gauges WHERE active = TRUE AND provider = $1 ORDER BY id"
    ))
    .bind(provider)
    .fetch_all(pool)
    .await?
    .iter()
    .map(row_to_gauge)
    .collect()
}

/// Distinct gauges already linked to any section of a waterway, with series.
/// Feeds the "on this river" recommendation in the gauge picker.
pub async fn list_waterway_gauges(
    pool: &PgPool,
    waterway_id: i64,
) -> Result<Vec<GaugeWithSeries>, sqlx::Error> {
    let ids: Vec<GaugeId> = sqlx::query(
        "SELECT DISTINCT g.id
         FROM gauges g
         JOIN gauge_series gs ON gs.gauge_id = g.id
         JOIN feature_water_ranges fwr ON fwr.series_id = gs.id
         JOIN features f ON f.id = fwr.feature_id
         JOIN water_sections ws ON ws.id = f.section_id
         WHERE ws.waterway_id = $1",
    )
    .bind(waterway_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|r| r.try_get("id"))
    .collect::<Result<_, _>>()?;

    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(g) = fetch_gauge_with_series(pool, id).await? {
            out.push(g);
        }
    }
    Ok(out)
}

/// Every gauge as a point for the coverage map, each classified `used` (linked
/// to a section feature), `fetched` (polled but unlinked) or `available` (a
/// catalog station not yet backed by a real gauge). Real gauges union catalog
/// stations; a catalog row already present as a real gauge is suppressed so a
/// station is never plotted twice. Read-only, one shot - the client clusters.
pub async fn list_gauge_map(pool: &PgPool) -> Result<Vec<GaugeMapPoint>, sqlx::Error> {
    // Collapse real gauges by station (rivermap stores one row per parameter,
    // e.g. `<station>:W` / `<station>:Q`), merging params into one point.
    let rows = sqlx::query(
        "SELECT g.provider,
                split_part(g.source_id, ':', 1) AS station_id,
                (array_agg(g.name ORDER BY g.id))[1] AS name,
                NULL::text AS river,
                (array_agg(g.lat ORDER BY g.id))[1] AS lat,
                (array_agg(g.lon ORDER BY g.id))[1] AS lon,
                CASE WHEN bool_or(EXISTS (
                    SELECT 1 FROM feature_water_ranges f WHERE f.series_id = s.id
                )) THEN 'used' ELSE 'fetched' END AS state,
                COALESCE(array_agg(DISTINCT s.measurement_type::text)
                         FILTER (WHERE s.id IS NOT NULL), '{}'::text[]) AS params
         FROM gauges g
         LEFT JOIN gauge_series s ON s.gauge_id = g.id
         WHERE g.lat IS NOT NULL AND g.lon IS NOT NULL AND g.active = TRUE
         GROUP BY g.provider, split_part(g.source_id, ':', 1)
         UNION ALL
         SELECT c.provider, c.station_id, c.name, c.river, c.lat, c.lon,
                'available' AS state, c.params
         FROM gauge_catalog c
         WHERE c.lat IS NOT NULL AND c.lon IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM gauges g
                WHERE g.provider = c.provider AND split_part(g.source_id, ':', 1) = c.station_id)",
    )
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(|row| {
            let state = match row.try_get::<String, _>("state")?.as_str() {
                "used" => GaugeMapState::Used,
                "available" => GaugeMapState::Available,
                _ => GaugeMapState::Fetched,
            };
            Ok(GaugeMapPoint {
                provider: row.try_get("provider")?,
                station_id: row.try_get("station_id")?,
                name: row.try_get("name")?,
                river: row.try_get("river")?,
                lat: row.try_get("lat")?,
                lon: row.try_get("lon")?,
                state,
                params: row.try_get("params")?,
            })
        })
        .collect()
}
