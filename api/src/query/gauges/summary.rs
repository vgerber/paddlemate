use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};

use crate::models::gauge::{GaugeId, ReadingBucket, ReadingsSummary, SeriesId};

/// Allowed bucket widths in seconds, smallest first.
pub const STEPS: [i64; 13] = [
    60, 300, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 259200, 604800,
];

/// The smallest step that fits `span_secs` into at most `points` buckets
/// (the widest step when none does).
pub fn bucket_step(span_secs: i64, points: i64) -> i64 {
    let want = (span_secs + points - 1) / points.max(1);
    STEPS
        .iter()
        .copied()
        .find(|s| *s >= want)
        .unwrap_or(STEPS[STEPS.len() - 1])
}

/// Whether the series exists on that gauge.
pub async fn series_on_gauge(
    pool: &PgPool,
    gauge_id: GaugeId,
    series_id: SeriesId,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM gauge_series WHERE id = $1 AND gauge_id = $2)")
        .bind(series_id)
        .bind(gauge_id)
        .fetch_one(pool)
        .await
}

/// Readings of one series in `[from, to]`, raw when at most `points` fall in
/// the range and bucketed with `date_bin` otherwise.
pub async fn summarize_readings(
    pool: &PgPool,
    series_id: SeriesId,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    points: i64,
) -> Result<ReadingsSummary, sqlx::Error> {
    // Count one past the budget; stops early on dense series.
    let seen: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM (
             SELECT 1 FROM gauge_readings
             WHERE series_id = $1 AND measured_at >= $2 AND measured_at <= $3
             LIMIT $4
         ) r",
    )
    .bind(series_id)
    .bind(from)
    .bind(to)
    .bind(points + 1)
    .fetch_one(pool)
    .await?;

    if seen <= points {
        let rows = sqlx::query(
            "SELECT measured_at, value FROM gauge_readings
             WHERE series_id = $1 AND measured_at >= $2 AND measured_at <= $3
             ORDER BY measured_at",
        )
        .bind(series_id)
        .bind(from)
        .bind(to)
        .fetch_all(pool)
        .await?;
        let items = rows
            .iter()
            .map(|r| {
                let value: f64 = r.try_get("value")?;
                Ok(ReadingBucket {
                    measured_at: r.try_get("measured_at")?,
                    value,
                    min: value,
                    max: value,
                    count: 1,
                })
            })
            .collect::<Result<_, sqlx::Error>>()?;
        return Ok(ReadingsSummary {
            bucket_seconds: 0,
            from,
            to,
            items,
        });
    }

    let step = bucket_step((to - from).num_seconds(), points);
    let rows = sqlx::query(
        "SELECT date_bin(make_interval(secs => $4), measured_at, '1970-01-01 00:00+00') AS bucket,
                avg(value) AS value, min(value) AS min, max(value) AS max, count(*) AS count
         FROM gauge_readings
         WHERE series_id = $1 AND measured_at >= $2 AND measured_at <= $3
         GROUP BY bucket
         ORDER BY bucket",
    )
    .bind(series_id)
    .bind(from)
    .bind(to)
    .bind(step as f64)
    .fetch_all(pool)
    .await?;
    let items = rows
        .iter()
        .map(|r| {
            Ok(ReadingBucket {
                measured_at: r.try_get("bucket")?,
                value: r.try_get("value")?,
                min: r.try_get("min")?,
                max: r.try_get("max")?,
                count: r.try_get("count")?,
            })
        })
        .collect::<Result<_, sqlx::Error>>()?;
    Ok(ReadingsSummary {
        bucket_seconds: step,
        from,
        to,
        items,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step_rounds_up_to_a_listed_width() {
        assert_eq!(bucket_step(7 * 86400, 300), 3600);
        assert_eq!(bucket_step(30 * 86400, 300), 10800);
        assert_eq!(bucket_step(365 * 86400, 300), 172800);
        assert_eq!(bucket_step(730 * 86400, 300), 259200);
        assert_eq!(bucket_step(60, 300), 60);
    }

    #[test]
    fn step_caps_at_the_widest() {
        assert_eq!(bucket_step(5 * 365 * 86400, 10), 604800);
    }
}
