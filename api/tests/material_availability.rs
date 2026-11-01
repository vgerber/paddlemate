//! Whether a model is still made: the fields on entries and models, the
//! filter on the lists and the tree, validation, and the catalogue migration.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, call, fake_auth, people, state};
use paddlemate_api::routes::materials::materials_routes;
use serde_json::{Value, json};
use sqlx::PgPool;

/// The part of the availability migration that fills the rows; the DDL above
/// it ran once when the test database was migrated.
const FILL: &str = include_str!("../migrations/0065_materials_availability.sql");

fn app(pool: PgPool) -> Router {
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/materials", materials_routes(state(pool)))
        .layer(middleware::from_fn(fake_auth))
        .layer(middleware::from_fn(
            paddlemate_api::layers::rejection::envelope_rejections,
        ))
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

async fn put(pool: &PgPool, model: &str, size: &str, availability: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO materials (category, discipline, brand, model, size, availability, \
         created_by) VALUES ('kayak', 'creek', 'Pyranha', $1, $2, $3::material_availability, \
         'system-catalogue') RETURNING id",
    )
    .bind(model)
    .bind(size)
    .bind(availability)
    .fetch_one(pool)
    .await
    .unwrap()
}

fn models_of(body: &Value) -> Vec<String> {
    body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["model"].as_str().unwrap().to_string())
        .collect()
}

#[sqlx::test]
async fn the_filter_narrows_entries_models_and_the_tree(pool: PgPool) {
    clear_catalogue(&pool).await;
    put(&pool, "Jed", "S", "current").await;
    put(&pool, "Jed", "M", "current").await;
    put(&pool, "Burn", "M", "discontinued").await;
    put(&pool, "Ripper", "M", "unknown").await;
    let app = app(pool);

    let r = get(&app, "/materials?availability=current").await;
    assert_eq!(r.body["total"], 2);
    assert!(
        r.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["availability"] == "current")
    );
    assert_eq!(get(&app, "/materials").await.body["total"], 4);

    let r = get(&app, "/materials/models?availability=current").await;
    assert_eq!(r.body["total"], 1);
    assert_eq!(models_of(&r.body), ["Jed"]);
    let r = get(&app, "/materials/models?availability=discontinued").await;
    assert_eq!(models_of(&r.body), ["Burn"]);
    let r = get(&app, "/materials/models?availability=unknown").await;
    assert_eq!(models_of(&r.body), ["Ripper"]);

    let r = get(&app, "/materials/tree?availability=current").await;
    let kayak = &r.body["categories"][0];
    assert_eq!(
        (kayak["models"].clone(), kayak["entries"].clone()),
        (json!(1), json!(2))
    );
    let r = get(&app, "/materials/tree").await;
    assert_eq!(r.body["categories"][0]["models"], 3);

    let r = get(&app, "/materials?availability=sometimes").await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn a_model_is_current_if_any_size_is_discontinued_if_all_are(pool: PgPool) {
    clear_catalogue(&pool).await;
    put(&pool, "Mixed", "S", "discontinued").await;
    put(&pool, "Mixed", "M", "current").await;
    put(&pool, "Gone", "S", "discontinued").await;
    put(&pool, "Gone", "M", "discontinued").await;
    put(&pool, "Vague", "S", "discontinued").await;
    put(&pool, "Vague", "M", "unknown").await;
    let app = app(pool);

    let r = get(&app, "/materials/models?per_page=10").await;
    let by = |name: &str| -> String {
        r.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["model"] == name)
            .unwrap()["availability"]
            .as_str()
            .unwrap()
            .to_string()
    };
    assert_eq!(by("Mixed"), "current");
    assert_eq!(by("Gone"), "discontinued");
    assert_eq!(by("Vague"), "unknown");
}

#[sqlx::test]
async fn an_admin_saves_availability_and_a_proposal_carries_it(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    let body = json!({
        "category": "kayak", "brand": "Zedboats", "model": "Firecracker",
        "availability": "discontinued", "year_to": 2008,
        "availability_source": "https://example.com/archive",
        "availability_checked": "2026-11-01",
    });
    let r = call(
        &app,
        Method::POST,
        "/materials",
        Who::Admin,
        Some(body.clone()),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let id = r.body["id"].as_i64().unwrap();

    let r = get(&app, &format!("/materials/{id}")).await;
    assert_eq!(r.body["availability"], "discontinued");
    assert_eq!(r.body["availability_source"], "https://example.com/archive");
    assert_eq!(r.body["availability_checked"], "2026-11-01");

    let mut next = body.clone();
    next["availability"] = json!("current");
    let r = call(
        &app,
        Method::PUT,
        &format!("/materials/{id}"),
        Who::Admin,
        Some(next),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["availability"], "current");

    // A signed-in user proposes it; the proposal shows the fields.
    let mut other = body;
    other["model"] = json!("Shiva");
    let r = call(
        &app,
        Method::POST,
        "/materials",
        Who::User("mara-1"),
        Some(other),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    assert_eq!(r.body["proposed_data"]["availability"], "discontinued");
    assert_eq!(
        r.body["proposed_data"]["availability_source"],
        "https://example.com/archive"
    );

    // Left out, it is unknown.
    let r = call(
        &app,
        Method::POST,
        "/materials",
        Who::Admin,
        Some(json!({ "category": "kayak", "brand": "Zedboats", "model": "Plain" })),
    )
    .await;
    assert_eq!(r.body["availability"], "unknown");
    assert!(r.body.get("availability_source").is_none());
}

#[sqlx::test]
async fn availability_input_is_validated(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    let cases = [
        ("availability", json!("maybe")),
        ("availability_source", json!("javascript:alert(1)")),
        (
            "availability_source",
            json!(format!("https://x.com/{}", "a".repeat(500))),
        ),
        ("availability_checked", json!("yesterday")),
        ("availability_checked", json!("1066-01-01")),
    ];
    for (field, value) in cases {
        let mut body = json!({ "category": "kayak", "brand": "Pyranha", "model": "Burn" });
        body[field] = value;
        for who in [Who::Admin, Who::User("mara-1")] {
            let r = call(&app, Method::POST, "/materials", who, Some(body.clone())).await;
            assert_eq!(r.status, StatusCode::BAD_REQUEST, "{field}: {}", r.body);
        }
    }
}

async fn counts(pool: &PgPool) -> (String, i64) {
    sqlx::query_as(
        "SELECT (SELECT md5(string_agg(m::text, '|' ORDER BY id)) FROM materials m), \
                (SELECT COUNT(*) FROM materials WHERE availability <> 'unknown')",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test]
async fn the_catalogue_carries_availability_and_a_rerun_changes_nothing(pool: PgPool) {
    let (_, flagged) = counts(&pool).await;
    assert!(flagged >= 500, "{flagged}");
    let dated: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM materials WHERE availability_checked IS NOT NULL \
         AND availability_source LIKE 'http%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(dated >= 600, "{dated}");

    let before = counts(&pool).await;
    let fill = &FILL[FILL.find("CREATE TEMP TABLE").unwrap()..];
    sqlx::raw_sql(fill).execute(&pool).await.unwrap();
    assert_eq!(counts(&pool).await, before);
}

#[sqlx::test]
async fn a_user_edit_is_not_overwritten_by_the_migration(pool: PgPool) {
    common::add_user(&pool, "mara-1", "mara").await;
    let id: i64 = sqlx::query_scalar(
        "SELECT id FROM materials WHERE availability = 'current' ORDER BY id LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "UPDATE materials SET availability = 'discontinued', updated_by = 'mara-1' WHERE id = $1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    let fill = &FILL[FILL.find("CREATE TEMP TABLE").unwrap()..];
    sqlx::raw_sql(fill).execute(&pool).await.unwrap();
    let now: String = sqlx::query_scalar("SELECT availability::text FROM materials WHERE id = $1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(now, "discontinued");
}
