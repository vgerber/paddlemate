use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::gauge::{
    CatalogGaugeRef, CatalogRiver, FeatureWaterRange, Gauge, GaugeId, GaugeMapPoint, GaugeMapState,
    GaugeOption, GaugeReading, GaugeSeries, GaugeSource, GaugeWithSeries, MeasurementType,
    SectionWaterStatus, SeriesId, WaterLevel, WaterRangeWithStatus,
};
use river_gauge::StationInfo;

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

/// Fetch the upstream sources (attribution/licensing) for a set of
/// `data_source_id`s, keyed by id.
async fn fetch_sources_by_ids(
    pool: &PgPool,
    ids: &[String],
) -> Result<std::collections::HashMap<String, GaugeSource>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let sources = sqlx::query_as!(
        GaugeSource,
        "SELECT id, name, short_name, licensing_terms, website, country_code,
                license_name, license_url
         FROM sources WHERE id = ANY($1)",
        ids
    )
    .fetch_all(pool)
    .await?;
    Ok(sources.into_iter().map(|s| (s.id.clone(), s)).collect())
}

/// The gauge's own source link, or its provider's mapped authority.
/// Directly-polled providers carry no per-station source, so attribution
/// falls back to the provider_sources mapping.
async fn effective_source_id(
    pool: &PgPool,
    gauges: &[Gauge],
) -> Result<std::collections::HashMap<GaugeId, String>, sqlx::Error> {
    let providers: Vec<String> = {
        let mut ps: Vec<String> = gauges
            .iter()
            .filter(|g| g.data_source_id.is_none())
            .map(|g| g.provider.clone())
            .collect();
        ps.sort();
        ps.dedup();
        ps
    };
    let mapped: std::collections::HashMap<String, String> = if providers.is_empty() {
        std::collections::HashMap::new()
    } else {
        sqlx::query!(
            "SELECT provider, source_id FROM provider_sources WHERE provider = ANY($1)",
            &providers
        )
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|r| (r.provider, r.source_id))
        .collect()
    };
    Ok(gauges
        .iter()
        .filter_map(|g| {
            g.data_source_id
                .clone()
                .or_else(|| mapped.get(&g.provider).cloned())
                .map(|id| (g.id, id))
        })
        .collect())
}

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

/// Search active gauges by name and/or proximity to a point, returning them
/// with their series so a picker can offer measurement types immediately.
/// With `lat`/`lon` results are ordered nearest-first, otherwise by name.
pub async fn search_gauges(
    pool: &PgPool,
    q: Option<&str>,
    lat: Option<f64>,
    lon: Option<f64>,
    limit: i64,
) -> Result<Vec<GaugeWithSeries>, sqlx::Error> {
    let order = if lat.is_some() && lon.is_some() {
        // Squared equirectangular distance - fine for ranking at picker scale
        "((lat - $2) * (lat - $2)) + ((lon - $3) * (lon - $3) * cos(radians($2)) * cos(radians($2)))"
    } else {
        "name"
    };
    let sql = format!(
        "SELECT {GAUGE_COLS} FROM gauges \
         WHERE active = TRUE \
           AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%') \
           AND ($2::float8 IS NULL OR $3::float8 IS NULL \
                OR (lat IS NOT NULL AND lon IS NOT NULL)) \
         ORDER BY {order} \
         LIMIT $4"
    );
    let gauges: Vec<Gauge> = sqlx::query(&sql)
        .bind(q)
        .bind(lat)
        .bind(lon)
        .bind(limit)
        .fetch_all(pool)
        .await?
        .iter()
        .map(row_to_gauge)
        .collect::<Result<_, _>>()?;

    let ids: Vec<GaugeId> = gauges.iter().map(|g| g.id).collect();
    let series_rows = sqlx::query(&format!(
        "SELECT {SERIES_COLS} FROM gauge_series WHERE gauge_id = ANY($1) ORDER BY gauge_id, id"
    ))
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    let mut series_by_gauge: std::collections::HashMap<GaugeId, Vec<GaugeSeries>> =
        std::collections::HashMap::new();
    for row in &series_rows {
        let series = row_to_series(row)?;
        series_by_gauge
            .entry(series.gauge_id)
            .or_default()
            .push(series);
    }

    let effective = effective_source_id(pool, &gauges).await?;
    let source_ids: Vec<String> = {
        let mut ids: Vec<String> = effective.values().cloned().collect();
        ids.sort();
        ids.dedup();
        ids
    };
    let sources = fetch_sources_by_ids(pool, &source_ids).await?;

    Ok(gauges
        .into_iter()
        .map(|gauge| {
            let series = series_by_gauge.remove(&gauge.id).unwrap_or_default();
            let source = effective
                .get(&gauge.id)
                .and_then(|id| sources.get(id).cloned());
            GaugeWithSeries::from_parts(gauge, series, source)
        })
        .collect())
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
    let effective = effective_source_id(pool, std::slice::from_ref(&gauge)).await?;
    let source = match effective.get(&gauge.id) {
        Some(id) => fetch_sources_by_ids(pool, std::slice::from_ref(id))
            .await?
            .remove(id),
        None => None,
    };
    Ok(Some(GaugeWithSeries::from_parts(gauge, series, source)))
}

/// Every column a caller may set on a gauge. Create and update write the same
/// set, so they take the same struct rather than eight positional arguments
/// each, where two of the same type are easy to swap by accident.
pub struct GaugeFields<'a> {
    pub name: &'a str,
    pub provider: &'a str,
    pub source_id: &'a str,
    pub data_source_id: Option<&'a str>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub active: bool,
    pub fetch_interval_secs: i32,
}

pub async fn create_gauge(pool: &PgPool, fields: GaugeFields<'_>) -> Result<Gauge, sqlx::Error> {
    let GaugeFields {
        name,
        provider,
        source_id,
        data_source_id,
        lat,
        lon,
        active,
        fetch_interval_secs,
    } = fields;
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
    fields: GaugeFields<'_>,
) -> Result<Option<Gauge>, sqlx::Error> {
    let GaugeFields {
        name,
        provider,
        source_id,
        data_source_id,
        lat,
        lon,
        active,
        fetch_interval_secs,
    } = fields;
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
              -- Stale = the gauge missed its last tick: no reading within
              -- twice its own fetch interval (2x absorbs publish/fetch
              -- jitter). Silent gauges must not keep reporting their last
              -- value as the present level.
              AND measured_at > COALESCE($2, NOW())
                  - make_interval(secs => g.fetch_interval_secs * 2)
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

// ---------------------------------------------------------------------------
// Gauge catalog: the multi-provider discovery surface (see migration 0029).
// ---------------------------------------------------------------------------

/// Default unit for a measurement type when the catalog station omits one.
fn default_unit(mt: MeasurementType) -> &'static str {
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
                WHERE g.provider = c.provider AND g.source_id = c.station_id)
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
        ORDER BY COUNT(*) DESC, river
        LIMIT $2
        "#,
        q,
        limit
    )
    .fetch_all(pool)
    .await
}

/// Resolve a catalog station reference to a `gauge_series.id`, creating the
/// gauge and series if they do not yet exist and marking the gauge active so
/// the poller fetches it. Returns (series_id, gauge_id, created) where
/// `created` is true only when the gauge row was newly inserted (for the
/// caller to trigger a one-time history backfill). Idempotent; runs inside the
/// caller's transaction.
pub async fn resolve_or_create_series_for_ref(
    conn: &mut sqlx::PgConnection,
    r: &CatalogGaugeRef,
) -> Result<(SeriesId, GaugeId, bool), sqlx::Error> {
    // Upsert the gauge; xmax = 0 on the returned row iff it was freshly inserted.
    let gauge_row = sqlx::query(
        "INSERT INTO gauges (name, provider, source_id, lat, lon, active, fetch_interval_secs)
         VALUES ($1, $2, $3, $4, $5, TRUE, 600)
         ON CONFLICT (provider, source_id) DO UPDATE SET active = TRUE, updated_at = NOW()
         RETURNING id, (xmax = 0) AS inserted",
    )
    .bind(r.name.as_deref().unwrap_or(&r.station_id))
    .bind(&r.provider)
    .bind(&r.station_id)
    .bind(r.lat)
    .bind(r.lon)
    .fetch_one(&mut *conn)
    .await?;
    let gauge_id: GaugeId = gauge_row.try_get("id")?;
    let created: bool = gauge_row.try_get("inserted")?;

    // Upsert the series. Its source_id (`station:param`) is what the poller
    // fetches; measurement_type is unique per gauge.
    let unit = r
        .unit
        .as_deref()
        .unwrap_or_else(|| default_unit(r.measurement_type));
    let series_source_id = format!("{}:{}", r.station_id, r.param);
    let series_row = sqlx::query(
        "INSERT INTO gauge_series (gauge_id, measurement_type, unit, label, source_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (gauge_id, measurement_type) DO UPDATE SET source_id = EXCLUDED.source_id
         RETURNING id",
    )
    .bind(gauge_id)
    .bind(r.measurement_type)
    .bind(unit)
    .bind(r.name.as_deref())
    .bind(&series_source_id)
    .fetch_one(&mut *conn)
    .await?;
    let series_id: SeriesId = series_row.try_get("id")?;

    Ok((series_id, gauge_id, created))
}

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
                WHERE g.provider = c.provider AND g.source_id = c.station_id)",
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
