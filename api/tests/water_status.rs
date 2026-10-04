//! Which gauge reading a section's level is judged by. Each test runs on a
//! fresh database that `sqlx::test` builds from the migrations.

use paddlemate_api::query::gauges::water_status_for_section;
use sqlx::PgPool;

/// One section with a calibrated range on a gauge polled every ten minutes,
/// and one reading measured `age` ago. Returns the section id.
async fn section_with_reading(pool: &PgPool, age: &str) -> i64 {
    sqlx::query("INSERT INTO waterways (id, waterway_type, name) VALUES (1, 'river', 'River')")
        .execute(pool)
        .await
        .unwrap();
    let section: i64 = sqlx::query_scalar(
        "INSERT INTO water_sections (waterway_id, name, location) \
         VALUES (1, 'Run', ST_GeomFromText('LINESTRING(9.8 46.4, 9.9 46.5)', 4326)) RETURNING id",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    let feature: i64 = sqlx::query_scalar(
        "INSERT INTO features (section_id, feature_type, location, created_by) \
         VALUES ($1, 'whitewater', ST_GeomFromText('POINT(9.8 46.4)', 4326), 'test') RETURNING id",
    )
    .bind(section)
    .fetch_one(pool)
    .await
    .unwrap();
    let gauge: i64 = sqlx::query_scalar(
        "INSERT INTO gauges (name, provider, source_id, fetch_interval_secs) \
         VALUES ('Inn', 'rivermap', 'inn-q', 600) RETURNING id",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    let series: i64 = sqlx::query_scalar(
        "INSERT INTO gauge_series (gauge_id, measurement_type, unit) \
         VALUES ($1, 'discharge', 'm3s') RETURNING id",
    )
    .bind(gauge)
    .fetch_one(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO feature_water_ranges (feature_id, series_id, range_low, range_medium, range_high) \
         VALUES ($1, $2, 7, 13, 25)",
    )
    .bind(feature)
    .bind(series)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO gauge_readings (series_id, measured_at, value) \
         VALUES ($1, NOW() - $2::interval, 15)",
    )
    .bind(series)
    .bind(age)
    .execute(pool)
    .await
    .unwrap();
    section
}

/// Aggregators republish an authority's readings with a delay, so the newest
/// one is commonly older than our own polling interval. It used to be thrown
/// away as stale, and nearly every section showed no level at all.
#[sqlx::test(migrations = "./migrations")]
async fn a_reading_delayed_by_its_publisher_is_still_current(pool: PgPool) {
    let section = section_with_reading(&pool, "40 minutes").await;
    let status = water_status_for_section(&pool, section).await.unwrap();
    let reading = status.ranges[0].latest_reading.as_ref();
    assert_eq!(reading.map(|r| r.value), Some(15.0));
}

/// A gauge that has really stopped reporting must not keep showing the last
/// level it saw as if it were the present one.
#[sqlx::test(migrations = "./migrations")]
async fn a_gauge_silent_for_hours_has_no_current_reading(pool: PgPool) {
    let section = section_with_reading(&pool, "4 hours").await;
    let status = water_status_for_section(&pool, section).await.unwrap();
    assert!(status.ranges[0].latest_reading.is_none());
}
