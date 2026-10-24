//! The `readings/summary` route: raw below the point budget, `date_bin`
//! buckets above it, range and scoping guards.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::StatusCode};
use common::{get, state};
use paddlemate_api::routes::gauges::gauges_routes;
use serde_json::Value;
use sqlx::PgPool;

fn app(pool: PgPool) -> Router {
    let state = state(pool);
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/gauges", gauges_routes(state))
        .finish_api(&mut api)
}

async fn gauge(pool: &PgPool, source: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO gauges (name, provider, source_id, fetch_interval_secs) \
         VALUES ($1, 'rivermap', $1, 600) RETURNING id",
    )
    .bind(source)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// A series on `gauge` whose readings are `value = n` at `start + n * step_min`
/// minutes for `n` in `0..count`.
async fn series(
    pool: &PgPool,
    gauge: i64,
    kind: &str,
    start: &str,
    step_min: i32,
    count: i32,
) -> i64 {
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO gauge_series (gauge_id, measurement_type, unit) \
         VALUES ($1, $2::measurement_type, 'm3s') RETURNING id",
    )
    .bind(gauge)
    .bind(kind)
    .fetch_one(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO gauge_readings (series_id, measured_at, value) \
         SELECT $1, $2::timestamptz + n * make_interval(mins => $3), n \
         FROM generate_series(0, $4 - 1) n",
    )
    .bind(id)
    .bind(start)
    .bind(step_min)
    .bind(count)
    .execute(pool)
    .await
    .unwrap();
    id
}

fn url(g: i64, s: i64, query: &str) -> String {
    format!("/gauges/{g}/series/{s}/readings/summary?{query}")
}

const TWO_DAYS: &str = "from=2026-01-01T00:00:00Z&to=2026-01-03T00:00:00Z";

/// 193 readings, one per 15 minutes, 2026-01-01 00:00 to 2026-01-03 00:00.
async fn two_days(pool: &PgPool) -> (i64, i64) {
    let g = gauge(pool, "a").await;
    (
        g,
        series(pool, g, "discharge", "2026-01-01T00:00:00Z", 15, 193).await,
    )
}

fn items(body: &Value) -> &Vec<Value> {
    body["items"].as_array().unwrap()
}

#[sqlx::test]
async fn raw_when_the_range_fits_the_budget(pool: PgPool) {
    let (g, s) = two_days(&pool).await;
    let r = get(&app(pool), &url(g, s, &format!("{TWO_DAYS}&points=300"))).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["bucket_seconds"], 0);
    let list = items(&r.body);
    assert_eq!(list.len(), 193);
    assert_eq!(list[1]["measured_at"], "2026-01-01T00:15:00Z");
    for it in list {
        assert_eq!(it["min"], it["value"]);
        assert_eq!(it["max"], it["value"]);
        assert_eq!(it["count"], 1);
    }
}

#[sqlx::test]
async fn budget_boundary_is_inclusive(pool: PgPool) {
    let (g, s) = two_days(&pool).await;
    let app = app(pool);
    let at = get(&app, &url(g, s, &format!("{TWO_DAYS}&points=193"))).await;
    assert_eq!(at.body["bucket_seconds"], 0);
    let over = get(&app, &url(g, s, &format!("{TWO_DAYS}&points=192"))).await;
    assert_ne!(over.body["bucket_seconds"], 0);
}

#[sqlx::test]
async fn buckets_carry_average_min_max_count(pool: PgPool) {
    let (g, s) = two_days(&pool).await;
    let r = get(&app(pool), &url(g, s, &format!("{TWO_DAYS}&points=10"))).await;
    assert_eq!(r.body["bucket_seconds"], 21600);
    let list = items(&r.body);
    assert_eq!(list.len(), 9);
    let first = &list[0];
    assert_eq!(first["measured_at"], "2026-01-01T00:00:00Z");
    assert_eq!(first["value"], 11.5);
    assert_eq!(first["min"], 0.0);
    assert_eq!(first["max"], 23.0);
    assert_eq!(first["count"], 24);
    assert_eq!(list[1]["measured_at"], "2026-01-01T06:00:00Z");
    assert_eq!(list[1]["min"], 24.0);
    let last = &list[8];
    assert_eq!(last["measured_at"], "2026-01-03T00:00:00Z");
    assert_eq!(last["count"], 1);
    assert_eq!(last["value"], 192.0);
}

#[sqlx::test]
async fn step_rounds_up_to_a_listed_width(pool: PgPool) {
    let (g, s) = two_days(&pool).await;
    // 172800 s / 50 = 3456 s, rounded up to the hour.
    let r = get(&app(pool), &url(g, s, &format!("{TWO_DAYS}&points=50"))).await;
    assert_eq!(r.body["bucket_seconds"], 3600);
    let list = items(&r.body);
    assert_eq!(list.len(), 49);
    assert_eq!(list[0]["count"], 4);
    assert_eq!(list[0]["value"], 1.5);
}

#[sqlx::test]
async fn empty_buckets_are_left_out(pool: PgPool) {
    let g = gauge(&pool, "gap").await;
    // Day one 15-minute readings, then twelve more at noon on day two.
    let s = series(&pool, g, "discharge", "2026-01-01T00:00:00Z", 15, 96).await;
    sqlx::query(
        "INSERT INTO gauge_readings (series_id, measured_at, value) \
         SELECT $1, '2026-01-02T12:00:00Z'::timestamptz + n * interval '15 minutes', 500 \
         FROM generate_series(0, 11) n",
    )
    .bind(s)
    .execute(&pool)
    .await
    .unwrap();
    let r = get(&app(pool), &url(g, s, &format!("{TWO_DAYS}&points=10"))).await;
    let starts: Vec<&str> = items(&r.body)
        .iter()
        .map(|i| i["measured_at"].as_str().unwrap())
        .collect();
    assert_eq!(
        starts,
        [
            "2026-01-01T00:00:00Z",
            "2026-01-01T06:00:00Z",
            "2026-01-01T12:00:00Z",
            "2026-01-01T18:00:00Z",
            "2026-01-02T12:00:00Z",
        ]
    );
}

#[sqlx::test]
async fn points_are_clamped(pool: PgPool) {
    let (g, s) = two_days(&pool).await;
    let long = series(&pool, g, "temperature", "2026-02-01T00:00:00Z", 1, 1500).await;
    let app = app(pool);
    // 1 is raised to 10: the same buckets as points=10.
    let low = get(&app, &url(g, s, &format!("{TWO_DAYS}&points=1"))).await;
    assert_eq!(low.body["bucket_seconds"], 21600);
    // 100000 is lowered to 1000: 1500 readings are still bucketed.
    let range = "from=2026-02-01T00:00:00Z&to=2026-02-02T01:00:00Z";
    let high = get(&app, &url(g, long, &format!("{range}&points=100000"))).await;
    assert_eq!(high.body["bucket_seconds"], 300);
    assert!(items(&high.body).len() <= 1000);
}

#[sqlx::test]
async fn bad_ranges_are_400(pool: PgPool) {
    let (g, s) = two_days(&pool).await;
    let app = app(pool);
    for q in [
        "from=2026-01-03T00:00:00Z&to=2026-01-01T00:00:00Z",
        "from=2026-01-01T00:00:00Z&to=2026-01-01T00:00:00Z",
        "from=2026-01-01T00:00:00Z&to=2031-01-10T00:00:00Z",
        "from=2999-01-01T00:00:00Z",
    ] {
        let r = get(&app, &url(g, s, q)).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{q}");
        assert_eq!(r.body["error"]["code"], "validation_failed", "{q}");
    }
    // Exactly five years is allowed.
    let ok = get(
        &app,
        &url(g, s, "from=2026-01-01T00:00:00Z&to=2030-12-31T00:00:00Z"),
    )
    .await;
    assert_eq!(ok.status, StatusCode::OK);
}

#[sqlx::test]
async fn defaults_cover_the_last_week(pool: PgPool) {
    let (g, s) = two_days(&pool).await;
    let r = get(&app(pool), &url(g, s, "")).await;
    assert_eq!(r.status, StatusCode::OK);
    let from = chrono::DateTime::parse_from_rfc3339(r.body["from"].as_str().unwrap()).unwrap();
    let to = chrono::DateTime::parse_from_rfc3339(r.body["to"].as_str().unwrap()).unwrap();
    assert_eq!((to - from).num_days(), 7);
}

#[sqlx::test]
async fn series_must_belong_to_the_gauge(pool: PgPool) {
    let (g, s) = two_days(&pool).await;
    let other = gauge(&pool, "b").await;
    let app = app(pool);
    for uri in [
        url(other, s, TWO_DAYS),
        url(g, s + 1000, TWO_DAYS),
        url(other + 1000, s, TWO_DAYS),
    ] {
        let r = get(&app, &uri).await;
        assert_eq!(r.status, StatusCode::NOT_FOUND, "{uri}");
    }
}
