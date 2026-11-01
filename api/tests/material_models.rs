//! The wiki as models: one row per model with its sizes, and an entry's
//! siblings.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, call, fake_auth, people, state};
use paddlemate_api::routes::materials::materials_routes;
use serde_json::{Value, json};
use sqlx::PgPool;

const SIZE_MIGRATION: &str = include_str!("../migrations/0058_material_size.sql");

fn app(pool: PgPool) -> Router {
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/materials", materials_routes(state(pool)))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

async fn get(app: &Router, uri: &str) -> common::Reply {
    call(app, Method::GET, uri, Who::Anyone, None).await
}

async fn clear_catalogue(pool: &PgPool) {
    sqlx::query("DELETE FROM materials")
        .execute(pool)
        .await
        .unwrap();
}

async fn put(
    pool: &PgPool,
    brand: &str,
    model: &str,
    variant: Option<&str>,
    size: Option<&str>,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO materials (category, brand, model, variant, size, created_by) \
         VALUES ('kayak', $1, $2, $3, $4, 'system-catalogue') RETURNING id",
    )
    .bind(brand)
    .bind(model)
    .bind(variant)
    .bind(size)
    .fetch_one(pool)
    .await
    .unwrap()
}

fn sizes(model: &Value) -> Vec<String> {
    model["sizes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["size"].as_str().unwrap_or("-").to_string())
        .collect()
}

#[sqlx::test]
async fn the_total_counts_models_and_the_scorch_is_one(pool: PgPool) {
    let keys: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM (SELECT DISTINCT lower(btrim(brand)), lower(btrim(model)), \
         lower(btrim(COALESCE(variant, ''))) FROM materials WHERE category = 'kayak') k",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let entries: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM materials WHERE category = 'kayak'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(keys < entries, "the catalogue groups into fewer models");

    let app = app(pool);
    let r = get(&app, "/materials/models?category=kayak&per_page=100").await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["total"], keys);
    assert_eq!(r.body["total_pages"], (keys + 99) / 100);

    let r = get(&app, "/materials/models?q=scorch&brand=pyranha").await;
    let scorch: Vec<&Value> = r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|m| m["model"] == "Scorch" && m.get("variant").is_none())
        .collect();
    assert_eq!(scorch.len(), 1);
    assert_eq!(sizes(scorch[0]), ["S", "M", "L"]);
}

#[sqlx::test]
async fn paging_is_clamped(pool: PgPool) {
    let app = app(pool);
    let r = get(&app, "/materials/models?per_page=100000").await;
    assert_eq!(r.body["per_page"], 100);
    assert_eq!(r.body["items"].as_array().unwrap().len(), 100);
    let r = get(&app, "/materials/models?page=0&per_page=0").await;
    assert_eq!(
        (r.body["page"].as_i64(), r.body["per_page"].as_i64()),
        (Some(1), Some(1))
    );
    let r = get(&app, &format!("/materials/models?page={}", i64::MAX)).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["items"].as_array().unwrap().len(), 0);
    let long = "a".repeat(101);
    let r = get(&app, &format!("/materials/models?q={long}")).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn sizes_come_in_order_and_filters_narrow_models(pool: PgPool) {
    clear_catalogue(&pool).await;
    for (size, length) in [("XL", 300.0), ("S", 250.0), ("L", 290.0), ("M", 270.0)] {
        let id = put(&pool, "Pyranha", "Ripper", None, Some(size)).await;
        sqlx::query("UPDATE materials SET length_cm = $2 WHERE id = $1")
            .bind(id)
            .bind(length)
            .execute(&pool)
            .await
            .unwrap();
    }
    for size in ["65", "8.5", "10", "9"] {
        put(&pool, "Dagger", "Axiom", None, Some(size)).await;
    }
    put(&pool, "Dagger", "Axiom", Some("2005"), Some("8.5")).await;
    put(&pool, "Jackson", "Karma", None, None).await;

    let app = app(pool);
    let r = get(&app, "/materials/models").await;
    assert_eq!(r.body["total"], 4, "Axiom and Axiom 2005 are two models");
    let items = r.body["items"].as_array().unwrap();
    assert_eq!(sizes(&items[0]), ["8.5", "9", "10", "65"]);
    assert_eq!(items[1]["variant"], "2005");
    assert_eq!(sizes(&items[2]), ["-"]);
    assert_eq!(sizes(&items[3]), ["S", "M", "L", "XL"]);

    // A filter drops sizes and the models left with none.
    let r = get(&app, "/materials/models?min_length_cm=280").await;
    assert_eq!(r.body["total"], 1);
    assert_eq!(sizes(&r.body["items"][0]), ["L", "XL"]);
    let r = get(&app, "/materials/models?brand=dagger&per_page=1&page=2").await;
    assert_eq!(r.body["total"], 2);
    assert_eq!(r.body["items"][0]["variant"], "2005");
}

#[sqlx::test]
async fn siblings_stay_inside_the_model(pool: PgPool) {
    clear_catalogue(&pool).await;
    let l = put(&pool, "Pyranha", "Ripper", None, Some("L")).await;
    let s = put(&pool, "Pyranha", "Ripper", None, Some("S")).await;
    let m = put(&pool, "pyranha ", "ripper", None, Some("M")).await;
    let other_edition = put(&pool, "Pyranha", "Ripper", Some("Sport"), Some("M")).await;
    let other_model = put(&pool, "Pyranha", "Shiva", None, Some("M")).await;

    let app = app(pool);
    let r = get(&app, &format!("/materials/{l}")).await;
    let ids: Vec<i64> = r.body["siblings"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x["id"].as_i64().unwrap())
        .collect();
    assert_eq!(ids, [s, m], "own entry left out, sizes in order");
    assert_eq!(r.body["siblings"][0]["size"], "S");
    assert!(!ids.contains(&other_edition) && !ids.contains(&other_model));

    let r = get(&app, &format!("/materials/{other_model}")).await;
    assert_eq!(r.body["siblings"].as_array().unwrap().len(), 0);
}

#[sqlx::test]
async fn size_is_bounded_and_unique_within_a_model(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    let body = |size: &str| json!({ "category": "kayak", "brand": "Nobody", "model": "Ripper", "size": size });
    let add = |b: Value| {
        let app = app.clone();
        async move { call(&app, Method::POST, "/materials", Who::Admin, Some(b)).await }
    };
    let r = add(body(&"x".repeat(41))).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(r.body["error"]["target"], "size");
    assert_eq!(add(body("M")).await.status, StatusCode::CREATED);
    assert_eq!(add(body("L")).await.status, StatusCode::CREATED);
    assert_eq!(add(body(" m ")).await.status, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn a_user_edited_entry_keeps_its_variant(pool: PgPool) {
    people(&pool).await;
    clear_catalogue(&pool).await;
    let untouched = put(&pool, "Pyranha", "Ripper", Some("Medium"), None).await;
    let edited = put(&pool, "Pyranha", "Ripper", Some("Large"), None).await;
    sqlx::query("UPDATE materials SET updated_by = 'mara-1' WHERE id = $1")
        .bind(edited)
        .execute(&pool)
        .await
        .unwrap();

    // The data step of the migration, run on the table as it was before.
    let start = SIZE_MIGRATION.find("UPDATE materials").unwrap();
    let end = start + SIZE_MIGRATION[start..].find(';').unwrap() + 1;
    let result = sqlx::raw_sql(&SIZE_MIGRATION[start..end])
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(result.rows_affected(), 1);

    let row = |id: i64| {
        let pool = pool.clone();
        async move {
            sqlx::query_as::<_, (Option<String>, Option<String>)>(
                "SELECT variant, size FROM materials WHERE id = $1",
            )
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    assert_eq!(row(untouched).await, (None, Some("M".into())));
    assert_eq!(row(edited).await, (Some("Large".into()), None));
}

async fn put_in(
    pool: &PgPool,
    category: &str,
    discipline: Option<&str>,
    brand: &str,
    model: &str,
    size: &str,
) {
    sqlx::query(
        "INSERT INTO materials (category, discipline, brand, model, size, created_by) \
         VALUES ($1::material_category, $2::material_discipline, $3, $4, $5, 'system-catalogue')",
    )
    .bind(category)
    .bind(discipline)
    .bind(brand)
    .bind(model)
    .bind(size)
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test]
async fn the_tree_counts_models_and_entries_per_level(pool: PgPool) {
    clear_catalogue(&pool).await;
    for size in ["S", "M"] {
        put_in(&pool, "kayak", Some("creek"), "Pyranha", "Jed", size).await;
    }
    put_in(&pool, "kayak", Some("creek"), "pyranha ", "Ripper", "M").await;
    put_in(&pool, "kayak", Some("creek"), "Dagger", "Mamba", "M").await;
    put_in(&pool, "kayak", Some("playboat"), "Dagger", "Rewind", "M").await;
    put_in(&pool, "kayak", None, "Dagger", "Old", "M").await;
    put_in(
        &pool,
        "canoe",
        Some("recreational"),
        "Old Town",
        "Pack",
        "M",
    )
    .await;

    let app = app(pool);
    let r = get(&app, "/materials/tree").await;
    assert_eq!(r.status, StatusCode::OK);
    let cats = r.body["categories"].as_array().unwrap();
    assert_eq!(cats.len(), 2);
    let kayak = &cats[0];
    assert_eq!(kayak["category"], "kayak");
    assert_eq!(kayak["models"], 5);
    assert_eq!(kayak["entries"], 6);
    let creek = &kayak["disciplines"][0];
    assert_eq!(creek["discipline"], "creek");
    assert_eq!(creek["models"], 3);
    assert_eq!(creek["entries"], 4);
    let brands = creek["brands"].as_array().unwrap();
    assert_eq!(brands[0]["brand"], "Pyranha");
    assert_eq!(brands[0]["models"], 2);
    assert_eq!(brands[0]["entries"], 3);
    assert_eq!(brands[1]["brand"], "Dagger");
}

#[sqlx::test]
async fn the_tree_honours_filters_but_not_its_own_levels(pool: PgPool) {
    clear_catalogue(&pool).await;
    put_in(&pool, "kayak", Some("creek"), "Pyranha", "Jed", "M").await;
    put_in(&pool, "kayak", Some("playboat"), "Dagger", "Rewind", "M").await;
    put_in(
        &pool,
        "canoe",
        Some("recreational"),
        "Old Town",
        "Pack",
        "M",
    )
    .await;

    let app = app(pool);
    let r = get(&app, "/materials/tree?q=pyranha").await;
    let cats = r.body["categories"].as_array().unwrap();
    assert_eq!(cats.len(), 1);
    assert_eq!(cats[0]["models"], 1);

    let r = get(
        &app,
        "/materials/tree?category=canoe&discipline=creek&brand=x",
    )
    .await;
    assert_eq!(r.body["categories"].as_array().unwrap().len(), 2);

    let long = "a".repeat(101);
    let r = get(&app, &format!("/materials/tree?q={long}")).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        get(&app, "/materials/tree?category=nope").await.status,
        StatusCode::BAD_REQUEST
    );
}
