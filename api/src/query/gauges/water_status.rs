use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use super::parse_measurement_type;
use crate::models::gauge::*;

/// The least a reading may lag and still count as the present level. Most
/// gauges come through an aggregator that republishes the authority's
/// measurements with a delay: the newest is typically 20-60 minutes old when we
/// fetch it, whatever our own polling interval. In production 94% of ranged
/// series are within 3 hours and the next step up is a gauge silent for a day.
const MIN_FRESHNESS_SECS: i32 = 3 * 60 * 60;

/// Fetch water status for a section, using the latest available reading.
pub async fn water_status_for_section(
    pool: &PgPool,
    section_id: i64,
) -> Result<SectionWaterStatus, sqlx::Error> {
    water_status_for_section_at(pool, section_id, None).await
}

/// Fetch water status for a section. When `at` is `Some`, picks the reading
/// closest to (and not after) that timestamp; when `None`, uses the absolute
/// latest reading.
pub async fn water_status_for_section_at(
    pool: &PgPool,
    section_id: i64,
    at: impl Into<Option<DateTime<Utc>>>,
) -> Result<SectionWaterStatus, sqlx::Error> {
    let mut all = water_status_for_sections_at(pool, &[section_id], at.into()).await?;
    Ok(all.remove(&section_id).unwrap_or_default())
}

/// Water status of many sections in one query. Every requested id has an
/// entry, with no ranges when the section has none or does not exist, as the
/// single-section call answers.
pub async fn water_status_for_sections(
    pool: &PgPool,
    section_ids: &[i64],
) -> Result<HashMap<i64, SectionWaterStatus>, sqlx::Error> {
    water_status_for_sections_at(pool, section_ids, None).await
}

async fn water_status_for_sections_at(
    pool: &PgPool,
    section_ids: &[i64],
    at: Option<DateTime<Utc>>,
) -> Result<HashMap<i64, SectionWaterStatus>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            f.section_id        AS section_id,
            fwr.id,
            fwr.feature_id,
            fwr.range_low,
            fwr.range_medium,
            fwr.range_high,
            fwr.created_at,
            fwr.updated_at,
            gs.id               AS gs_id,
            gs.gauge_id         AS gs_gauge_id,
            gs.measurement_type::text AS gs_measurement_type,
            gs.unit             AS gs_unit,
            gs.label            AS gs_label,
            gs.source_id        AS gs_source_id,
            gs.created_at       AS gs_created_at,
            g.id                AS g_id,
            g.name              AS g_name,
            g.provider          AS g_provider,
            g.source_id         AS g_source_id,
            g.data_source_id    AS g_data_source_id,
            g.lat               AS g_lat,
            g.lon               AS g_lon,
            g.active            AS g_active,
            g.fetch_interval_secs AS g_fetch_interval_secs,
            g.created_at        AS g_created_at,
            g.updated_at        AS g_updated_at,
            src.id              AS src_id,
            src.name            AS src_name,
            src.short_name      AS src_short_name,
            src.licensing_terms AS src_licensing_terms,
            src.website         AS src_website,
            src.country_code    AS src_country_code,
            src.license_name    AS src_license_name,
            src.license_url     AS src_license_url,
            lr.series_id        AS lr_series_id,
            lr.measured_at      AS lr_measured_at,
            lr.value            AS lr_value
        FROM features f
        JOIN feature_water_ranges fwr ON fwr.feature_id = f.id
        JOIN gauge_series gs ON gs.id = fwr.series_id
        JOIN gauges g ON g.id = gs.gauge_id
        LEFT JOIN provider_sources ps ON ps.provider = g.provider
        LEFT JOIN sources src ON src.id = COALESCE(g.data_source_id, ps.source_id)
        LEFT JOIN LATERAL (
            SELECT series_id, measured_at, value
            FROM gauge_readings
            WHERE series_id = gs.id
              AND ($2::timestamptz IS NULL OR measured_at <= $2)
              -- Stale = nothing within twice the gauge's fetch interval, or
              -- the publishing delay ($3), whichever is longer. Silent gauges
              -- must not keep reporting their last value as the present level.
              AND measured_at > COALESCE($2, NOW())
                  - make_interval(secs => GREATEST(g.fetch_interval_secs * 2, $3))
            ORDER BY measured_at DESC
            LIMIT 1
        ) lr ON TRUE
        WHERE f.section_id = ANY($1)
        ORDER BY fwr.id
        "#,
    )
    .bind(section_ids)
    .bind(at)
    .bind(MIN_FRESHNESS_SECS)
    .fetch_all(pool)
    .await?;

    let mut out: HashMap<i64, SectionWaterStatus> = section_ids
        .iter()
        .map(|id| (*id, SectionWaterStatus::default()))
        .collect();
    for row in &rows {
        let section_id: i64 = row.try_get("section_id")?;
        out.entry(section_id)
            .or_default()
            .ranges
            .push(row_to_water_range_with_status(row)?);
    }
    Ok(out)
}

fn row_to_water_range_with_status(row: &PgRow) -> Result<WaterRangeWithStatus, sqlx::Error> {
    let src_id: Option<String> = row.try_get("src_id")?;
    let source = src_id
        .map(|id| {
            Ok::<GaugeSource, sqlx::Error>(GaugeSource {
                id,
                name: row.try_get("src_name")?,
                short_name: row.try_get("src_short_name")?,
                licensing_terms: row.try_get("src_licensing_terms")?,
                website: row.try_get("src_website")?,
                country_code: row.try_get("src_country_code")?,
                license_name: row.try_get("src_license_name")?,
                license_url: row.try_get("src_license_url")?,
            })
        })
        .transpose()?;

    let lr_series_id: Option<SeriesId> = row.try_get("lr_series_id")?;
    let latest_reading = lr_series_id
        .map(|_| {
            Ok::<GaugeReading, sqlx::Error>(GaugeReading {
                series_id: row.try_get("lr_series_id")?,
                measured_at: row.try_get("lr_measured_at")?,
                value: row.try_get("lr_value")?,
            })
        })
        .transpose()?;

    Ok(WaterRangeWithStatus {
        id: row.try_get("id")?,
        feature_id: row.try_get("feature_id")?,
        range_low: row.try_get::<Option<f64>, _>("range_low")?,
        range_medium: row.try_get::<Option<f64>, _>("range_medium")?,
        range_high: row.try_get::<Option<f64>, _>("range_high")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        series: GaugeSeries {
            id: row.try_get("gs_id")?,
            gauge_id: row.try_get("gs_gauge_id")?,
            measurement_type: parse_measurement_type(
                &row.try_get::<String, _>("gs_measurement_type")?,
            ),
            unit: row.try_get("gs_unit")?,
            label: row.try_get("gs_label")?,
            source_id: row.try_get("gs_source_id").ok().flatten(),
            created_at: row.try_get("gs_created_at")?,
        },
        gauge: Gauge {
            id: row.try_get("g_id")?,
            name: row.try_get("g_name")?,
            provider: row.try_get("g_provider")?,
            source_id: row.try_get("g_source_id")?,
            data_source_id: row.try_get("g_data_source_id")?,
            lat: row.try_get("g_lat")?,
            lon: row.try_get("g_lon")?,
            active: row.try_get("g_active")?,
            fetch_interval_secs: row.try_get("g_fetch_interval_secs")?,
            created_at: row.try_get("g_created_at")?,
            updated_at: row.try_get("g_updated_at")?,
        },
        level: WaterLevel::from_reading(
            latest_reading.as_ref().map(|r| r.value),
            row.try_get::<Option<f64>, _>("range_low")?,
            row.try_get::<Option<f64>, _>("range_medium")?,
            row.try_get::<Option<f64>, _>("range_high")?,
        ),
        latest_reading,
        source,
    })
}
