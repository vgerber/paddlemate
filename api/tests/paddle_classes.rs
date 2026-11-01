//! Paddles are grouped by use: the database
//! and API rules that keep paddle classes and boat classes apart, and the
//! tree and filters that show them.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, call, fake_auth, state};
use paddlemate_api::routes::materials::materials_routes;
use serde_json::json;
use sqlx::PgPool;

const PADDLE_CLASSES: [&str; 8] = [
    "whitewater",
    "freestyle",
    "slalom",
    "wildwater",
    "touring",
    "canoe",
    "polo",
    "other",
];

fn app(pool: PgPool) -> Router {
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/materials", materials_routes(state(pool)))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

async fn insert(pool: &PgPool, category: &str, model: &str, discipline: &str) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO materials (category, brand, model, disciplines, created_by) \
         VALUES ($1::material_category, 'Zed', $2, ARRAY[$3]::material_discipline[], 'system-catalogue')",
    )
    .bind(category)
    .bind(model)
    .bind(discipline)
    .execute(pool)
    .await
    .map(|_| ())
}

#[sqlx::test]
async fn the_catalogue_paddles_use_only_paddle_classes(pool: PgPool) {
    let bad: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM materials WHERE category = 'paddle' \
         AND NOT disciplines::text[] <@ $1",
    )
    .bind(PADDLE_CLASSES.map(String::from).to_vec())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(bad, 0);
    let whitewater: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM materials WHERE category = 'paddle' AND disciplines @> ARRAY['whitewater']::material_discipline[]",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        whitewater > 100,
        "the creek and river paddles moved: {whitewater}"
    );
}

#[sqlx::test]
async fn the_database_keeps_paddle_and_boat_classes_apart(pool: PgPool) {
    for d in PADDLE_CLASSES {
        insert(&pool, "paddle", &format!("p-{d}"), d).await.unwrap();
    }
    for d in ["creek", "river_runner", "playboat", "downriver"] {
        assert!(
            insert(&pool, "paddle", "bad", d).await.is_err(),
            "paddle {d}"
        );
    }
    for d in ["whitewater", "wildwater", "canoe", "polo"] {
        assert!(insert(&pool, "kayak", "bad", d).await.is_err(), "kayak {d}");
    }
    insert(&pool, "kayak", "ok", "creek").await.unwrap();
}

#[sqlx::test]
async fn the_database_bounds_the_group_list(pool: PgPool) {
    for list in [
        "'{}'",
        "'{creek,river_runner,half_slice,playboat}'",
        "'{creek,canoe}'",
        "'{creek,NULL}'",
    ] {
        let sql = format!(
            "INSERT INTO materials (category, brand, model, disciplines, created_by) \
             VALUES ('kayak', 'Zed', 'x', {list}::material_discipline[], 'system-catalogue')"
        );
        assert!(sqlx::query(&sql).execute(&pool).await.is_err(), "{list}");
    }
    sqlx::query(
        "INSERT INTO materials (category, brand, model, disciplines, created_by) \
         VALUES ('kayak', 'Zed', 'x', '{creek,river_runner,half_slice}', 'system-catalogue')",
    )
    .execute(&pool)
    .await
    .unwrap();
}

async fn add(app: &Router, category: &str, discipline: &str) -> common::Reply {
    let body = json!({
        "category": category, "brand": "Zed", "model": "M", "disciplines": [discipline]
    });
    call(app, Method::POST, "/materials", Who::Admin, Some(body)).await
}

#[sqlx::test]
async fn the_api_refuses_a_class_that_does_not_fit(pool: PgPool) {
    common::people(&pool).await;
    let app = app(pool);
    for (category, discipline) in [
        ("paddle", "creek"),
        ("kayak", "polo"),
        ("kayak", "wildwater"),
    ] {
        let r = add(&app, category, discipline).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{category} {discipline}");
        assert_eq!(r.body["error"]["target"], "disciplines");
    }
    let r = add(&app, "paddle", "polo").await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let r = add(&app, "kayak", "creek").await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
}

#[sqlx::test]
async fn the_tree_and_filters_show_paddles_by_use(pool: PgPool) {
    sqlx::query("DELETE FROM materials")
        .execute(&pool)
        .await
        .unwrap();
    for (n, d) in [
        ("1", "whitewater"),
        ("2", "whitewater"),
        ("3", "polo"),
        ("4", "canoe"),
    ] {
        insert(&pool, "paddle", n, d).await.unwrap();
    }
    insert(&pool, "kayak", "k", "creek").await.unwrap();
    let app = app(pool);

    let tree = call(&app, Method::GET, "/materials/tree", Who::Anyone, None).await;
    assert_eq!(tree.status, StatusCode::OK);
    let paddle = tree.body["categories"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["category"] == "paddle")
        .unwrap();
    let mut classes: Vec<(&str, i64)> = paddle["disciplines"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            (
                d["discipline"].as_str().unwrap(),
                d["entries"].as_i64().unwrap(),
            )
        })
        .collect();
    classes.sort();
    assert_eq!(classes, [("canoe", 1), ("polo", 1), ("whitewater", 2)]);

    let r = call(
        &app,
        Method::GET,
        "/materials?category=paddle&discipline=whitewater",
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["total"], 2, "{}", r.body);
    let r = call(
        &app,
        Method::GET,
        "/materials?discipline=wildwater",
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.body["total"], 0);
}
