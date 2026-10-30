mod catalog;
mod providers;
mod summary;
mod water_ranges;
mod water_status;

pub use catalog::*;
pub use providers::*;
pub use summary::{bucket_step, series_on_gauge, summarize_readings};
pub use water_ranges::*;
pub use water_status::*;

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::gauge::{
    CatalogGaugeRef, Gauge, GaugeId, GaugeReading, GaugeSeries, GaugeSource, GaugeWithSeries,
    MeasurementType, SeriesId,
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
