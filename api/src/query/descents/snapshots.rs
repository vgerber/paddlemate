use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::{
    descent::DescentId,
    gauge::{SectionWaterSnapshot, WaterLevel, WaterRangeWithStatus},
};

pub(super) const SNAPSHOT_COLS: &str = "descent_id, section_id, series_id, gauge_id, gauge_name, unit, \
    value, level::text AS level, measured_at, \
    range_low, range_medium, range_high, \
    value_min, value_max, value_avg";

/// Keyed by (descent_id, section_id): several descents can cover the same
/// section, and each carries only the snapshots taken when *it* was logged.
pub(super) fn collect_snapshots(
    rows: &[PgRow],
) -> Result<HashMap<(i64, i64), Vec<SectionWaterSnapshot>>, sqlx::Error> {
    let mut map: HashMap<(i64, i64), Vec<SectionWaterSnapshot>> = HashMap::new();
    for r in rows {
        let descent_id: i64 = r.try_get("descent_id")?;
        let section_id: i64 = r.try_get("section_id")?;
        map.entry((descent_id, section_id))
            .or_default()
            .push(row_to_snapshot(r)?);
    }
    Ok(map)
}

pub(super) async fn load_snapshots_for_descent(
    pool: &PgPool,
    descent_id: DescentId,
) -> Result<HashMap<(i64, i64), Vec<SectionWaterSnapshot>>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {SNAPSHOT_COLS} \
         FROM descent_section_water_snapshots \
         WHERE descent_id = $1 \
         ORDER BY section_id, id",
    ))
    .bind(descent_id)
    .fetch_all(pool)
    .await?;

    collect_snapshots(&rows)
}

pub(super) async fn batch_load_snapshots(
    pool: &PgPool,
    descent_ids: &[DescentId],
) -> Result<HashMap<(i64, i64), Vec<SectionWaterSnapshot>>, sqlx::Error> {
    if descent_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(&format!(
        "SELECT {SNAPSHOT_COLS} \
         FROM descent_section_water_snapshots \
         WHERE descent_id = ANY($1) \
         ORDER BY section_id, id",
    ))
    .bind(descent_ids)
    .fetch_all(pool)
    .await?;

    collect_snapshots(&rows)
}

pub(super) fn row_to_snapshot(
    r: &sqlx::postgres::PgRow,
) -> Result<SectionWaterSnapshot, sqlx::Error> {
    let level = match r.try_get::<String, _>("level")?.as_str() {
        "low" => WaterLevel::Low,
        "medium" => WaterLevel::Medium,
        "high" => WaterLevel::High,
        _ => WaterLevel::Empty,
    };
    Ok(SectionWaterSnapshot {
        series_id: r.try_get("series_id")?,
        gauge_id: r.try_get("gauge_id")?,
        gauge_name: r.try_get("gauge_name")?,
        unit: r.try_get("unit")?,
        value: r.try_get("value")?,
        level,
        measured_at: r.try_get("measured_at")?,
        range_low: r.try_get("range_low")?,
        range_medium: r.try_get("range_medium")?,
        range_high: r.try_get("range_high")?,
        value_min: r.try_get("value_min")?,
        value_max: r.try_get("value_max")?,
        value_avg: r.try_get("value_avg")?,
    })
}

pub(super) async fn insert_water_snapshots(
    pool: &PgPool,
    descent_id: DescentId,
    section_id: i64,
    ranges: &[WaterRangeWithStatus],
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    // One snapshot per gauge series - the section-level reading - not one
    // per feature range. The whitewater feature's calibration wins, like the
    // section display; then any calibrated range, then the first.
    let whitewater_ids: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM features WHERE section_id = $1 AND feature_type = 'whitewater'",
    )
    .bind(section_id)
    .fetch_all(pool)
    .await?;

    let is_calibrated = |r: &WaterRangeWithStatus| {
        r.range_low.is_some() || r.range_medium.is_some() || r.range_high.is_some()
    };
    let rank = |r: &WaterRangeWithStatus| {
        if whitewater_ids.contains(&r.feature_id) && is_calibrated(r) {
            0
        } else if is_calibrated(r) {
            1
        } else {
            2
        }
    };
    let mut by_series: std::collections::BTreeMap<i64, &WaterRangeWithStatus> =
        std::collections::BTreeMap::new();
    for range in ranges {
        by_series
            .entry(range.series.id)
            .and_modify(|best| {
                if rank(range) < rank(best) {
                    *best = range;
                }
            })
            .or_insert(range);
    }

    for range in by_series.into_values() {
        let value = range.latest_reading.as_ref().map(|r| r.value);
        let measured_at = range.latest_reading.as_ref().map(|r| r.measured_at);
        let level_str = match &range.level {
            WaterLevel::Low => "low",
            WaterLevel::Medium => "medium",
            WaterLevel::High => "high",
            WaterLevel::Empty => "empty",
        };

        // Compute min/max/avg over the descent time range.
        let agg = sqlx::query(
            "SELECT MIN(value) AS value_min, MAX(value) AS value_max, AVG(value) AS value_avg \
             FROM gauge_readings \
             WHERE series_id = $1 AND measured_at >= $2 AND measured_at <= $3",
        )
        .bind(range.series.id)
        .bind(start_time)
        .bind(end_time)
        .fetch_one(pool)
        .await?;

        let value_min: Option<f64> = agg.try_get("value_min")?;
        let value_max: Option<f64> = agg.try_get("value_max")?;
        let value_avg: Option<f64> = agg.try_get("value_avg")?;

        sqlx::query(
            "INSERT INTO descent_section_water_snapshots \
                (descent_id, section_id, series_id, gauge_id, gauge_name, unit, \
                 value, level, measured_at, range_low, range_medium, range_high, \
                 value_min, value_max, value_avg) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::water_level, $9, $10, $11, $12, $13, $14, $15)",
        )
        .bind(descent_id)
        .bind(section_id)
        .bind(range.series.id)
        .bind(range.gauge.id)
        .bind(&range.gauge.name)
        .bind(&range.series.unit)
        .bind(value)
        .bind(level_str)
        .bind(measured_at)
        .bind(range.range_low)
        .bind(range.range_medium)
        .bind(range.range_high)
        .bind(value_min)
        .bind(value_max)
        .bind(value_avg)
        .execute(pool)
        .await?;
    }
    Ok(())
}
