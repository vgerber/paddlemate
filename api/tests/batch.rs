//! The batch reads: waterways by ids, water status of many sections and a
//! section's history with its features'. Each answers what the single calls
//! answer, within the same bounds and parents.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::StatusCode};
use common::{get, state};
use paddlemate_api::routes::waterways::waterways_routes;
use serde_json::Value;
use sqlx::PgPool;

fn app(pool: PgPool) -> Router {
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/waterways", waterways_routes(state(pool)))
        .finish_api(&mut api)
}

async fn waterway(pool: &PgPool, name: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO waterways (waterway_type, name) VALUES ('river', $1) RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn section(pool: &PgPool, waterway: i64, name: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO water_sections (waterway_id, name, location) VALUES ($1, $2, \
         ST_GeomFromText('LINESTRING(9.8 46.4, 9.9 46.5)', 4326)) RETURNING id",
    )
    .bind(waterway)
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn feature(pool: &PgPool, section: i64) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO features (section_id, feature_type, location, created_by) \
         VALUES ($1, 'whitewater', ST_GeomFromText('POINT(9.8 46.4)', 4326), 'test') RETURNING id",
    )
    .bind(section)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn step(pool: &PgPool, kind: &str, id: i64, waterway: i64, section: Option<i64>) {
    sqlx::query(
        "INSERT INTO entity_history (entity_kind, entity_id, waterway_id, section_id, kind) \
         VALUES ($1, $2, $3, $4, 'edited')",
    )
    .bind(kind)
    .bind(id)
    .bind(waterway)
    .bind(section)
    .execute(pool)
    .await
    .unwrap();
}

fn ids(body: &Value) -> Vec<i64> {
    body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|w| w["id"].as_i64().unwrap())
        .collect()
}

#[sqlx::test]
async fn waterways_are_listed_by_ids(pool: PgPool) {
    let (a, b, c) = (
        waterway(&pool, "Alpha").await,
        waterway(&pool, "Beta").await,
        waterway(&pool, "Gamma").await,
    );
    let s = section(&pool, b, "Run").await;
    let app = app(pool);

    let r = get(&app, &format!("/waterways?ids={c},{a}")).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(ids(&r.body), vec![a, c]);
    assert_eq!(r.body["total"], 2);
    assert!(r.body["items"][0].get("sections").is_none());

    // The same item the unfiltered list gives, and the sections the detail gives.
    let all = get(&app, "/waterways").await;
    let listed = all.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["id"] == c)
        .unwrap();
    assert_eq!(listed, &r.body["items"][1]);
    let r = get(&app, &format!("/waterways?ids={b}&include_sections=true")).await;
    let detail = get(&app, &format!("/waterways/{b}")).await;
    assert_eq!(r.body["items"][0]["sections"], detail.body["sections"]);
    assert_eq!(r.body["items"][0]["sections"][0]["id"], s);

    // An unknown id is just absent; other filters still narrow.
    let r = get(&app, &format!("/waterways?ids={a},99999")).await;
    assert_eq!(ids(&r.body), vec![a]);
    let r = get(&app, &format!("/waterways?ids={a},{b}&name=Beta")).await;
    assert_eq!(ids(&r.body), vec![b]);
}

#[sqlx::test]
async fn waterway_ids_are_bounded(pool: PgPool) {
    let app = app(pool);
    let many = |n: usize| (1..=n).map(|i| i.to_string()).collect::<Vec<_>>().join(",");
    for bad in ["", "1,,2", "x", "0", "-1"] {
        let r = get(&app, &format!("/waterways?ids={bad}")).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "ids={bad}");
        assert_eq!(r.body["error"]["code"], "validation_failed");
    }
    let r = get(&app, &format!("/waterways?ids={}", many(101))).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let r = get(&app, &format!("/waterways?ids={}", many(100))).await;
    assert_eq!(r.status, StatusCode::OK);
    let r = get(&app, "/waterways?include_sections=true").await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn ids_return_every_waterway_on_one_page(pool: PgPool) {
    let mut want = Vec::new();
    for i in 0..25 {
        want.push(waterway(&pool, &format!("River {i:02}")).await);
    }
    let app = app(pool);
    let list = want
        .iter()
        .map(i64::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let r = get(&app, &format!("/waterways?ids={list}")).await;
    assert_eq!(r.body["items"].as_array().unwrap().len(), 25);
    assert_eq!(r.body["total_pages"], 1);
}

async fn section_with_range(pool: &PgPool, waterway: i64, reading: Option<f64>) -> i64 {
    let section = section(pool, waterway, &format!("Run {reading:?}")).await;
    let feature = feature(pool, section).await;
    let gauge: i64 = sqlx::query_scalar(
        "INSERT INTO gauges (name, provider, source_id, fetch_interval_secs) \
         VALUES ('Inn', 'rivermap', $1, 600) RETURNING id",
    )
    .bind(format!("g{section}"))
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
    if let Some(value) = reading {
        sqlx::query(
            "INSERT INTO gauge_readings (series_id, measured_at, value) VALUES ($1, NOW(), $2)",
        )
        .bind(series)
        .bind(value)
        .execute(pool)
        .await
        .unwrap();
    }
    section
}

#[sqlx::test]
async fn water_status_of_many_sections_equals_the_single_calls(pool: PgPool) {
    let w = waterway(&pool, "River").await;
    let with_reading = section_with_range(&pool, w, Some(15.0)).await;
    let without = section_with_range(&pool, w, None).await;
    let bare = section(&pool, w, "Bare").await;
    let app = app(pool);

    let ask = format!(
        "/waterways/water-status?section_ids={with_reading},{without},{bare},99999,{with_reading}"
    );
    let r = get(&app, &ask).await;
    assert_eq!(r.status, StatusCode::OK);
    let map = r.body.as_object().unwrap();
    assert_eq!(map.len(), 4);
    for id in [with_reading, without, bare] {
        let single = get(&app, &format!("/waterways/{w}/sections/{id}/water-status")).await;
        assert_eq!(r.body[id.to_string()], single.body, "section {id}");
    }
    assert_eq!(
        r.body[with_reading.to_string()]["ranges"][0]["latest_reading"]["value"],
        15.0
    );
    assert_eq!(r.body["99999"]["ranges"].as_array().unwrap().len(), 0);
}

#[sqlx::test]
async fn water_status_ids_are_bounded(pool: PgPool) {
    let app = app(pool);
    let many = |n: usize| (1..=n).map(|i| i.to_string()).collect::<Vec<_>>().join(",");
    for uri in [
        "/waterways/water-status".to_string(),
        "/waterways/water-status?section_ids=".to_string(),
        "/waterways/water-status?section_ids=1,a".to_string(),
        format!("/waterways/water-status?section_ids={}", many(101)),
    ] {
        let r = get(&app, &uri).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{uri}");
    }
    let r = get(
        &app,
        &format!("/waterways/water-status?section_ids={}", many(100)),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
}

#[sqlx::test]
async fn section_history_can_carry_its_features(pool: PgPool) {
    let w = waterway(&pool, "River").await;
    let s = section(&pool, w, "Run").await;
    let other = section(&pool, w, "Other").await;
    let (f1, f2, quiet) = (
        feature(&pool, s).await,
        feature(&pool, s).await,
        feature(&pool, s).await,
    );
    let foreign = feature(&pool, other).await;
    step(&pool, "section", s, w, Some(s)).await;
    for _ in 0..3 {
        step(&pool, "feature", f1, w, Some(s)).await;
    }
    step(&pool, "feature", f2, w, Some(s)).await;
    // Deleted since: only its steps remain.
    step(&pool, "feature", 7777, w, Some(s)).await;
    step(&pool, "feature", foreign, w, Some(other)).await;
    let app = app(pool);
    let base = format!("/waterways/{w}/sections/{s}/history");

    let plain = get(&app, &base).await;
    assert!(plain.body.get("features").is_none());

    let r = get(&app, &format!("{base}?include_features=true")).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["items"], plain.body["items"]);
    let features = r.body["features"].as_object().unwrap();
    let mut keys: Vec<_> = features.keys().cloned().collect();
    keys.sort();
    let mut want: Vec<_> = [f1, f2, quiet, 7777].iter().map(i64::to_string).collect();
    want.sort();
    assert_eq!(keys, want, "own features only, none of the other section's");
    for id in [f1, f2, quiet] {
        let single = get(
            &app,
            &format!("/waterways/{w}/sections/{s}/features/{id}/history"),
        )
        .await;
        assert_eq!(features[&id.to_string()], single.body, "feature {id}");
    }

    // Paged like the section: the same page of every feature.
    let r = get(
        &app,
        &format!("{base}?include_features=true&per_page=2&page=2"),
    )
    .await;
    let page = &r.body["features"][f1.to_string()];
    assert_eq!(page["items"].as_array().unwrap().len(), 1);
    assert_eq!(
        (page["total"].as_i64(), page["page"].as_i64()),
        (Some(3), Some(2))
    );
    let single = get(
        &app,
        &format!("/waterways/{w}/sections/{s}/features/{f1}/history?per_page=2&page=2"),
    )
    .await;
    assert_eq!(page, &single.body);
}

#[sqlx::test]
async fn section_history_with_features_is_scoped_to_its_waterway(pool: PgPool) {
    let w = waterway(&pool, "River").await;
    let other_w = waterway(&pool, "Other").await;
    let s = section(&pool, w, "Run").await;
    let f = feature(&pool, s).await;
    step(&pool, "feature", f, w, Some(s)).await;
    let app = app(pool);
    let r = get(
        &app,
        &format!("/waterways/{other_w}/sections/{s}/history?include_features=true"),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}
