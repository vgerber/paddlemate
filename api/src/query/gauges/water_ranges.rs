use sqlx::{PgPool, Row, postgres::PgRow};

use super::parse_measurement_type;
use crate::models::gauge::*;

fn row_to_water_range(row: &PgRow) -> Result<FeatureWaterRange, sqlx::Error> {
    Ok(FeatureWaterRange {
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
    })
}

const WATER_RANGE_JOIN: &str = r#"
    SELECT
        fwr.id, fwr.feature_id, fwr.range_low, fwr.range_medium, fwr.range_high, fwr.created_at, fwr.updated_at,
        gs.id               AS gs_id,
        gs.gauge_id         AS gs_gauge_id,
        gs.measurement_type::text AS gs_measurement_type,
        gs.unit             AS gs_unit,
        gs.label            AS gs_label,
        gs.source_id        AS gs_source_id,
        gs.created_at       AS gs_created_at
    FROM feature_water_ranges fwr
    JOIN gauge_series gs ON fwr.series_id = gs.id
"#;

pub async fn list_feature_water_ranges(
    pool: &PgPool,
    feature_id: i64,
) -> Result<Vec<FeatureWaterRange>, sqlx::Error> {
    sqlx::query(&format!(
        "{WATER_RANGE_JOIN} WHERE fwr.feature_id = $1 ORDER BY fwr.id"
    ))
    .bind(feature_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(row_to_water_range)
    .collect()
}

/// Upsert a water range; individual thresholds may be absent. The single
/// write path for ranges - bundled feature creation and the standalone
/// endpoint both go through it.
pub async fn upsert_feature_water_range_partial(
    executor: impl sqlx::PgExecutor<'_>,
    feature_id: i64,
    series_id: SeriesId,
    range_low: Option<f64>,
    range_medium: Option<f64>,
    range_high: Option<f64>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO feature_water_ranges (feature_id, series_id, range_low, range_medium, range_high)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (feature_id, series_id) DO UPDATE
         SET range_low = EXCLUDED.range_low, range_medium = EXCLUDED.range_medium, range_high = EXCLUDED.range_high, updated_at = NOW()",
    )
    .bind(feature_id)
    .bind(series_id)
    .bind(range_low)
    .bind(range_medium)
    .bind(range_high)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn upsert_feature_water_range(
    pool: &PgPool,
    feature_id: i64,
    series_id: SeriesId,
    range_low: f64,
    range_medium: f64,
    range_high: f64,
) -> Result<FeatureWaterRange, sqlx::Error> {
    upsert_feature_water_range_partial(
        pool,
        feature_id,
        series_id,
        Some(range_low),
        Some(range_medium),
        Some(range_high),
    )
    .await?;

    let row = sqlx::query(&format!(
        "{WATER_RANGE_JOIN} WHERE fwr.feature_id = $1 AND fwr.series_id = $2"
    ))
    .bind(feature_id)
    .bind(series_id)
    .fetch_one(pool)
    .await?;
    row_to_water_range(&row)
}

pub async fn update_feature_water_range(
    pool: &PgPool,
    range_id: i64,
    feature_id: i64,
    range_low: f64,
    range_medium: f64,
    range_high: f64,
) -> Result<Option<FeatureWaterRange>, sqlx::Error> {
    let updated = sqlx::query(
        "UPDATE feature_water_ranges
         SET range_low = $3, range_medium = $4, range_high = $5, updated_at = NOW()
         WHERE id = $1 AND feature_id = $2
         RETURNING series_id",
    )
    .bind(range_id)
    .bind(feature_id)
    .bind(range_low)
    .bind(range_medium)
    .bind(range_high)
    .fetch_optional(pool)
    .await?;

    let series_id: SeriesId = match updated {
        Some(r) => r.try_get("series_id")?,
        None => return Ok(None),
    };

    let row = sqlx::query(&format!(
        "{WATER_RANGE_JOIN} WHERE fwr.id = $1 AND fwr.series_id = $2"
    ))
    .bind(range_id)
    .bind(series_id)
    .fetch_optional(pool)
    .await?;
    row.map(|r| row_to_water_range(&r)).transpose()
}

pub async fn delete_feature_water_range(
    pool: &PgPool,
    range_id: i64,
    feature_id: i64,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM feature_water_ranges WHERE id = $1 AND feature_id = $2")
        .bind(range_id)
        .bind(feature_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
