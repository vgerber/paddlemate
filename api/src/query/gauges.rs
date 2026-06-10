use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::gauge::{
    FeatureWaterRange, Gauge, GaugeId, GaugeReading, GaugeSeries, GaugeWithSeries, MeasurementType,
    SectionWaterStatus, SeriesId, WaterLevel, WaterRangeWithStatus,
};

fn parse_measurement_type(s: &str) -> MeasurementType {
    match s {
        "discharge" => MeasurementType::Discharge,
        "temperature" => MeasurementType::Temperature,
        _ => MeasurementType::WaterLevel,
    }
}

fn row_to_gauge(row: &PgRow) -> Result<Gauge, sqlx::Error> {
    Ok(Gauge {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        provider: row.try_get("provider")?,
        source_id: row.try_get("source_id")?,
        data_source_id: row.try_get("data_source_id")?,
        lat: row.try_get("lat")?,
        lon: row.try_get("lon")?,
        active: row.try_get("active")?,
        fetch_interval_secs: row.try_get("fetch_interval_secs")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn row_to_series(row: &PgRow) -> Result<GaugeSeries, sqlx::Error> {
    Ok(GaugeSeries {
        id: row.try_get("id")?,
        gauge_id: row.try_get("gauge_id")?,
        measurement_type: parse_measurement_type(&row.try_get::<String, _>("measurement_type")?),
        unit: row.try_get("unit")?,
        label: row.try_get("label")?,
        source_id: row.try_get("source_id")?,
        created_at: row.try_get("created_at")?,
    })
}

fn row_to_reading(row: &PgRow) -> Result<GaugeReading, sqlx::Error> {
    Ok(GaugeReading {
        series_id: row.try_get("series_id")?,
        measured_at: row.try_get("measured_at")?,
        value: row.try_get("value")?,
    })
}

const GAUGE_COLS: &str = "id, name, provider, source_id, data_source_id, lat, lon, active, fetch_interval_secs, created_at, updated_at";
const SERIES_COLS: &str =
    "id, gauge_id, measurement_type::text AS measurement_type, unit, label, source_id, created_at";

// --- Gauge CRUD ---

pub async fn list_gauges(pool: &PgPool, active_only: bool) -> Result<Vec<Gauge>, sqlx::Error> {
    let sql = if active_only {
        format!("SELECT {GAUGE_COLS} FROM gauges WHERE active = TRUE ORDER BY name")
    } else {
        format!("SELECT {GAUGE_COLS} FROM gauges ORDER BY name")
    };
    sqlx::query(&sql)
        .fetch_all(pool)
        .await?
        .iter()
        .map(row_to_gauge)
        .collect()
}

pub async fn fetch_gauge(pool: &PgPool, gauge_id: GaugeId) -> Result<Option<Gauge>, sqlx::Error> {
    sqlx::query(&format!("SELECT {GAUGE_COLS} FROM gauges WHERE id = $1"))
        .bind(gauge_id)
        .fetch_optional(pool)
        .await?
        .map(|r| row_to_gauge(&r))
        .transpose()
}

pub async fn fetch_gauge_with_series(
    pool: &PgPool,
    gauge_id: GaugeId,
) -> Result<Option<GaugeWithSeries>, sqlx::Error> {
    let gauge = match fetch_gauge(pool, gauge_id).await? {
        Some(g) => g,
        None => return Ok(None),
    };
    let series = list_series(pool, gauge_id).await?;
    Ok(Some(GaugeWithSeries {
        id: gauge.id,
        name: gauge.name,
        provider: gauge.provider,
        source_id: gauge.source_id,
        data_source_id: gauge.data_source_id,
        lat: gauge.lat,
        lon: gauge.lon,
        active: gauge.active,
        fetch_interval_secs: gauge.fetch_interval_secs,
        created_at: gauge.created_at,
        updated_at: gauge.updated_at,
        series,
    }))
}

pub async fn create_gauge(
    pool: &PgPool,
    name: &str,
    provider: &str,
    source_id: &str,
    data_source_id: Option<&str>,
    lat: Option<f64>,
    lon: Option<f64>,
    active: bool,
    fetch_interval_secs: i32,
) -> Result<Gauge, sqlx::Error> {
    let row = sqlx::query(&format!(
        "INSERT INTO gauges (name, provider, source_id, data_source_id, lat, lon, active, fetch_interval_secs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING {GAUGE_COLS}"
    ))
    .bind(name)
    .bind(provider)
    .bind(source_id)
    .bind(data_source_id)
    .bind(lat)
    .bind(lon)
    .bind(active)
    .bind(fetch_interval_secs)
    .fetch_one(pool)
    .await?;
    row_to_gauge(&row)
}

pub async fn update_gauge(
    pool: &PgPool,
    gauge_id: GaugeId,
    name: &str,
    provider: &str,
    source_id: &str,
    data_source_id: Option<&str>,
    lat: Option<f64>,
    lon: Option<f64>,
    active: bool,
    fetch_interval_secs: i32,
) -> Result<Option<Gauge>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "UPDATE gauges
         SET name = $2, provider = $3, source_id = $4, data_source_id = $5, lat = $6, lon = $7,
             active = $8, fetch_interval_secs = $9, updated_at = NOW()
         WHERE id = $1
         RETURNING {GAUGE_COLS}"
    ))
    .bind(gauge_id)
    .bind(name)
    .bind(provider)
    .bind(source_id)
    .bind(data_source_id)
    .bind(lat)
    .bind(lon)
    .bind(active)
    .bind(fetch_interval_secs)
    .fetch_optional(pool)
    .await?;
    row.map(|r| row_to_gauge(&r)).transpose()
}

pub async fn delete_gauge(pool: &PgPool, gauge_id: GaugeId) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM gauges WHERE id = $1")
        .bind(gauge_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

// --- Series ---

pub async fn list_series(
    pool: &PgPool,
    gauge_id: GaugeId,
) -> Result<Vec<GaugeSeries>, sqlx::Error> {
    sqlx::query(&format!(
        "SELECT {SERIES_COLS} FROM gauge_series WHERE gauge_id = $1 ORDER BY id"
    ))
    .bind(gauge_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(row_to_series)
    .collect()
}

pub async fn create_series(
    pool: &PgPool,
    gauge_id: GaugeId,
    measurement_type: &str,
    unit: &str,
    label: Option<&str>,
) -> Result<GaugeSeries, sqlx::Error> {
    let row = sqlx::query(&format!(
        "INSERT INTO gauge_series (gauge_id, measurement_type, unit, label)
         VALUES ($1, $2::measurement_type, $3, $4)
         RETURNING {SERIES_COLS}"
    ))
    .bind(gauge_id)
    .bind(measurement_type)
    .bind(unit)
    .bind(label)
    .fetch_one(pool)
    .await?;
    row_to_series(&row)
}

pub async fn update_series(
    pool: &PgPool,
    series_id: SeriesId,
    measurement_type: &str,
    unit: &str,
    label: Option<&str>,
) -> Result<Option<GaugeSeries>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "UPDATE gauge_series
         SET measurement_type = $2::measurement_type, unit = $3, label = $4
         WHERE id = $1
         RETURNING {SERIES_COLS}"
    ))
    .bind(series_id)
    .bind(measurement_type)
    .bind(unit)
    .bind(label)
    .fetch_optional(pool)
    .await?;
    row.map(|r| row_to_series(&r)).transpose()
}

pub async fn delete_series(pool: &PgPool, series_id: SeriesId) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM gauge_series WHERE id = $1")
        .bind(series_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

// --- Readings ---

pub async fn fetch_readings(
    pool: &PgPool,
    series_id: SeriesId,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
    limit: i64,
) -> Result<Vec<GaugeReading>, sqlx::Error> {
    sqlx::query(
        "SELECT series_id, measured_at, value
         FROM gauge_readings
         WHERE series_id = $1
           AND ($2::timestamptz IS NULL OR measured_at >= $2)
           AND ($3::timestamptz IS NULL OR measured_at <= $3)
         ORDER BY measured_at DESC
         LIMIT $4",
    )
    .bind(series_id)
    .bind(from)
    .bind(to)
    .bind(limit)
    .fetch_all(pool)
    .await?
    .iter()
    .map(row_to_reading)
    .collect()
}

pub async fn fetch_latest_reading(
    pool: &PgPool,
    series_id: SeriesId,
) -> Result<Option<GaugeReading>, sqlx::Error> {
    sqlx::query(
        "SELECT series_id, measured_at, value
         FROM gauge_readings
         WHERE series_id = $1
         ORDER BY measured_at DESC
         LIMIT 1",
    )
    .bind(series_id)
    .fetch_optional(pool)
    .await?
    .map(|r| row_to_reading(&r))
    .transpose()
}

pub async fn insert_readings_batch(
    pool: &PgPool,
    series_id: SeriesId,
    readings: &[(DateTime<Utc>, f64)],
) -> Result<(), sqlx::Error> {
    if readings.is_empty() {
        return Ok(());
    }
    let mut tx = pool.begin().await?;
    for (measured_at, value) in readings {
        sqlx::query(
            "INSERT INTO gauge_readings (series_id, measured_at, value)
             VALUES ($1, $2, $3)
             ON CONFLICT (series_id, measured_at) DO NOTHING",
        )
        .bind(series_id)
        .bind(measured_at)
        .bind(value)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}

// --- Feature water ranges ---

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

pub async fn upsert_feature_water_range(
    pool: &PgPool,
    feature_id: i64,
    series_id: SeriesId,
    range_low: f64,
    range_medium: f64,
    range_high: f64,
) -> Result<FeatureWaterRange, sqlx::Error> {
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
    .execute(pool)
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

// --- Section water status (ranges + latest reading) ---

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
    let at = at.into();
    let rows = sqlx::query(
        r#"
        SELECT
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
            lr.series_id        AS lr_series_id,
            lr.measured_at      AS lr_measured_at,
            lr.value            AS lr_value
        FROM features f
        JOIN feature_water_ranges fwr ON fwr.feature_id = f.id
        JOIN gauge_series gs ON gs.id = fwr.series_id
        JOIN gauges g ON g.id = gs.gauge_id
        LEFT JOIN LATERAL (
            SELECT series_id, measured_at, value
            FROM gauge_readings
            WHERE series_id = gs.id
              AND ($2::timestamptz IS NULL OR measured_at <= $2)
            ORDER BY measured_at DESC
            LIMIT 1
        ) lr ON TRUE
        WHERE f.section_id = $1
        ORDER BY fwr.id
        "#,
    )
    .bind(section_id)
    .bind(at)
    .fetch_all(pool)
    .await?;

    let ranges = rows
        .iter()
        .map(row_to_water_range_with_status)
        .collect::<Result<Vec<_>, sqlx::Error>>()?;

    Ok(SectionWaterStatus { ranges })
}

fn row_to_water_range_with_status(row: &PgRow) -> Result<WaterRangeWithStatus, sqlx::Error> {
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
    })
}
