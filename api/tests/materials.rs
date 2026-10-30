//! The material wiki: who may write, what bounds the input, what a list can
//! be made to hold or repeat.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, call, fake_auth, people, state};
use paddlemate_api::{query::materials::MAX_NEW_PER_DAY, routes::materials::materials_routes};
use serde_json::{Value, json};
use sqlx::PgPool;

fn app(pool: PgPool) -> Router {
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/materials", materials_routes(state(pool)))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

fn entry(brand: &str, model: &str) -> Value {
    json!({ "category": "kayak", "brand": brand, "model": model })
}

async fn add(app: &Router, who: Who, body: Value) -> common::Reply {
    call(app, Method::POST, "/materials", who, Some(body)).await
}

const MARA: Who = Who::User("mara-1");

#[sqlx::test]
async fn only_signed_in_users_write_and_only_admins_delete(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);

    let r = add(&app, Who::Anyone, entry("Pyranha", "Firecracker")).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);

    let r = add(&app, MARA, entry("Pyranha", "Firecracker")).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let id = r.body["id"].as_i64().unwrap();
    assert_eq!(r.body["created_by_username"], "mara");

    let uri = format!("/materials/{id}");
    let r = call(&app, Method::PUT, &uri, Who::Anyone, Some(entry("A", "B"))).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    let r = call(
        &app,
        Method::PUT,
        &uri,
        MARA,
        Some(entry("Pyranha", "Ripper")),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["updated_by_username"], "mara");

    let r = call(&app, Method::DELETE, &uri, MARA, None).await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    let r = call(&app, Method::DELETE, &uri, Who::Admin, None).await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let r = call(&app, Method::GET, &uri, Who::Anyone, None).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn input_is_bounded(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);

    let cases = [
        ("brand", json!("x".repeat(81))),
        ("description", json!("x".repeat(4001))),
        ("product_url", json!("javascript:alert(1)")),
        ("volume_l", json!(1e9)),
        ("length_cm", json!(-5)),
        ("year_from", json!(1066)),
    ];
    for (field, value) in cases {
        let mut body = entry("Pyranha", "Firecracker");
        body[field] = value;
        let r = add(&app, MARA, body).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{field}: {}", r.body);
        assert_eq!(r.body["error"]["target"], field);
    }
}

#[sqlx::test]
async fn a_duplicate_in_other_casing_is_a_conflict(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    assert_eq!(
        add(&app, MARA, entry("Pyranha", "Firecracker"))
            .await
            .status,
        StatusCode::CREATED
    );
    let r = add(&app, MARA, entry(" pyranha", "FIRECRACKER ")).await;
    assert_eq!(r.status, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn a_user_adds_a_bounded_number_per_day(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    for n in 0..MAX_NEW_PER_DAY {
        let r = add(&app, MARA, entry("Brand", &format!("Model {n}"))).await;
        assert_eq!(r.status, StatusCode::CREATED, "{n}: {}", r.body);
    }
    let r = add(&app, MARA, entry("Brand", "One too many")).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);
    // The cap is per user: the admin is unaffected.
    let r = add(&app, Who::Admin, entry("Brand", "Admin model")).await;
    assert_eq!(r.status, StatusCode::CREATED);
}

#[sqlx::test]
async fn lists_are_bounded(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    for model in ["Firecracker", "Ripper", "Shiva"] {
        add(&app, MARA, entry("Pyranha", model)).await;
    }

    let get = |uri: String| {
        let app = app.clone();
        async move { call(&app, Method::GET, &uri, Who::Anyone, None).await }
    };

    let long = "a".repeat(101);
    assert_eq!(
        get(format!("/materials?q={long}")).await.status,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        get(format!("/materials?brand={long}")).await.status,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        get("/materials?ids=1,2,3,4,5,6,7,8,9".into()).await.status,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        get("/materials?ids=1,x".into()).await.status,
        StatusCode::BAD_REQUEST
    );

    // A page far past the end is empty, not an overflow.
    let r = get(format!("/materials?page={}", i64::MAX)).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["items"].as_array().unwrap().len(), 0);
    let r = get("/materials?per_page=100000".into()).await;
    assert_eq!(r.body["per_page"], 100);
}

#[sqlx::test]
async fn search_ranks_and_tolerates_typos_and_ids_keep_order(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    let mut ids = Vec::new();
    for (brand, model) in [
        ("Pyranha", "Firecracker"),
        ("Dagger", "Mamba"),
        ("Pyranha", "Ripper"),
    ] {
        ids.push(
            add(&app, MARA, entry(brand, model)).await.body["id"]
                .as_i64()
                .unwrap(),
        );
    }

    let r = call(&app, Method::GET, "/materials?q=pyranah", Who::Anyone, None).await;
    assert_eq!(r.body["total"], 2, "a typo still finds the brand");
    let r = call(&app, Method::GET, "/materials?q=100%25", Who::Anyone, None).await;
    assert_eq!(r.body["total"], 0, "percent is literal");

    let uri = format!("/materials?ids={},{}", ids[2], ids[0]);
    let r = call(&app, Method::GET, &uri, Who::Anyone, None).await;
    let order: Vec<i64> = r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["id"].as_i64().unwrap())
        .collect();
    assert_eq!(order, vec![ids[2], ids[0]]);
}

#[sqlx::test]
async fn the_paddler_filter_keeps_boats_that_state_no_range(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    let mut heavy = entry("Pyranha", "Heavy");
    heavy["paddler_weight_min_kg"] = json!(90);
    heavy["paddler_weight_max_kg"] = json!(120);
    add(&app, MARA, heavy).await;
    add(&app, MARA, entry("Pyranha", "Silent")).await;

    let r = call(
        &app,
        Method::GET,
        "/materials?fits_paddler_kg=70",
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.body["total"], 1);
    assert_eq!(r.body["items"][0]["model"], "Silent");
}
