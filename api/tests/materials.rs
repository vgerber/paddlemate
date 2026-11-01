//! The material wiki: who may write, what bounds the input, what a list can
//! be made to hold or repeat.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, call, fake_auth, people, state};
use paddlemate_api::{
    query::{materials::MAX_NEW_PER_DAY, proposals},
    routes::materials::materials_routes,
};
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

/// The seeded catalogue would swamp counts; these tests start from nothing.
async fn clear_catalogue(pool: &PgPool) {
    sqlx::query("DELETE FROM materials")
        .execute(pool)
        .await
        .unwrap();
}

const MARA: Who = Who::User("mara-1");

#[sqlx::test]
async fn an_admin_writes_outright_and_a_signed_in_user_proposes(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());

    let r = add(&app, Who::Anyone, entry("Zedboats", "Firecracker")).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);

    let r = add(&app, Who::Admin, entry("Zedboats", "Firecracker")).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let id = r.body["id"].as_i64().unwrap();
    let uri = format!("/materials/{id}");

    let r = call(&app, Method::PUT, &uri, Who::Anyone, Some(entry("A", "B"))).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    let r = call(&app, Method::DELETE, &uri, Who::Anyone, None).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);

    let r = call(
        &app,
        Method::PUT,
        &uri,
        Who::Admin,
        Some(entry("Zedboats", "Ripper")),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["updated_by_username"], "root");

    // A non-admin only ever proposes; the wiki stays as it was.
    let r = add(&app, MARA, entry("Zedboats", "Shiva")).await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    assert_eq!(r.body["entity_type"], "material");
    assert_eq!(r.body["operation"], "create");
    assert_eq!(r.body["status"], "pending");
    assert_eq!(r.body["proposed_data"]["model"], "Shiva");
    assert!(r.body.get("original_data").is_none());

    let r = call(
        &app,
        Method::PUT,
        &uri,
        MARA,
        Some(entry("Zedboats", "Edited")),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    assert_eq!(r.body["operation"], "update");
    assert_eq!(r.body["entity_id"], id);
    assert_eq!(r.body["original_data"]["model"], "Ripper");
    assert_eq!(r.body["proposed_data"]["model"], "Edited");

    // One pending change per user and entry, so the delete comes from
    // someone else.
    common::add_user(&pool, "noa-1", "noa").await;
    let r = call(&app, Method::DELETE, &uri, Who::User("noa-1"), None).await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    assert_eq!(r.body["operation"], "delete");
    assert_eq!(r.body["original_data"]["model"], "Ripper");

    let r = call(&app, Method::GET, &uri, Who::Anyone, None).await;
    assert_eq!(r.body["model"], "Ripper");
    assert!(r.body["updated_by_username"] == "root");
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM materials WHERE brand = 'Zedboats'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1);

    let r = call(&app, Method::DELETE, &uri, Who::Admin, None).await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let r = call(&app, Method::GET, &uri, Who::Anyone, None).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn a_proposal_is_validated_and_needs_an_entry_that_exists(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);

    // Validation runs before anything is stored.
    let mut bad = entry("Pyranha", "Firecracker");
    bad["volume_l"] = json!(1e9);
    let r = add(&app, MARA, bad).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(r.body["error"]["target"], "volume_l");
    let mut long = entry("Pyranha", "Firecracker");
    long["proposal_note"] = json!("n".repeat(501));
    let r = add(&app, MARA, long).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(r.body["error"]["target"], "proposal_note");

    let mut noted = entry("Pyranha", "Firecracker");
    noted["proposal_note"] = json!(" from the maker's page ");
    let r = add(&app, MARA, noted).await;
    assert_eq!(r.status, StatusCode::ACCEPTED);
    assert_eq!(r.body["submitter_note"], "from the maker's page");

    let r = call(
        &app,
        Method::PUT,
        "/materials/999999",
        MARA,
        Some(entry("A", "B")),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let r = call(&app, Method::DELETE, "/materials/999999", MARA, None).await;
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
        add(&app, Who::Admin, entry("Pyranha", "Firecracker"))
            .await
            .status,
        StatusCode::CREATED
    );
    let r = add(&app, Who::Admin, entry(" pyranha", "FIRECRACKER ")).await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    // A proposal for a taken name is refused up front, not left for the admin.
    let r = add(&app, MARA, entry(" pyranha", "FIRECRACKER ")).await;
    assert_eq!(r.status, StatusCode::CONFLICT);

    // So is an edit that would take another entry's name.
    let id = add(&app, Who::Admin, entry("Pyranha", "Ripper")).await.body["id"]
        .as_i64()
        .unwrap();
    let uri = format!("/materials/{id}");
    let r = call(
        &app,
        Method::PUT,
        &uri,
        Who::Admin,
        Some(entry("pyranha", "firecracker")),
    )
    .await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    let r = call(
        &app,
        Method::PUT,
        &uri,
        MARA,
        Some(entry("pyranha", "firecracker")),
    )
    .await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    // Keeping its own name is not a clash.
    let r = call(
        &app,
        Method::PUT,
        &uri,
        MARA,
        Some(entry("Pyranha", "Ripper")),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED);
}

#[sqlx::test]
async fn a_user_adds_a_bounded_number_per_day(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    for n in 0..MAX_NEW_PER_DAY {
        let r = add(&app, Who::Admin, entry("Brand", &format!("Model {n}"))).await;
        assert_eq!(r.status, StatusCode::CREATED, "{n}: {}", r.body);
    }
    let r = add(&app, Who::Admin, entry("Brand", "One too many")).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);
    // The cap is per user, and proposals count toward it.
    for n in 0..MAX_NEW_PER_DAY {
        let r = add(&app, MARA, entry("Mara", &format!("Model {n}"))).await;
        assert_eq!(r.status, StatusCode::ACCEPTED, "{n}: {}", r.body);
    }
    let r = add(&app, MARA, entry("Mara", "One too many")).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);
    // Edits and deletes are proposals too.
    let r = call(&app, Method::DELETE, "/materials/1", MARA, None).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn a_user_has_a_bounded_number_waiting_for_review(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    // Old proposals no longer count toward the day, only toward the waiting cap.
    for n in 0..proposals::material::MAX_PENDING {
        sqlx::query(
            "INSERT INTO proposals (entity_type, operation, proposed_data, submitted_by, created_at) \
             VALUES ('material', 'create', $1, 'mara-1', NOW() - INTERVAL '2 days')",
        )
        .bind(entry("Old", &format!("Model {n}")))
        .execute(&pool)
        .await
        .unwrap();
    }
    let r = add(&app, MARA, entry("New", "One too many")).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);
    sqlx::query("UPDATE proposals SET status = 'rejected'")
        .execute(&pool)
        .await
        .unwrap();
    let r = add(&app, MARA, entry("New", "Fits again")).await;
    assert_eq!(r.status, StatusCode::ACCEPTED);
}

#[sqlx::test]
async fn lists_are_bounded(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    for model in ["Firecracker", "Ripper", "Shiva"] {
        add(&app, Who::Admin, entry("Pyranha", model)).await;
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
    clear_catalogue(&pool).await;
    let app = app(pool);
    let mut ids = Vec::new();
    for (brand, model) in [
        ("Pyranha", "Firecracker"),
        ("Dagger", "Mamba"),
        ("Pyranha", "Ripper"),
    ] {
        ids.push(
            add(&app, Who::Admin, entry(brand, model)).await.body["id"]
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
    clear_catalogue(&pool).await;
    let app = app(pool);
    let mut heavy = entry("Pyranha", "Heavy");
    heavy["paddler_weight_min_kg"] = json!(90);
    heavy["paddler_weight_max_kg"] = json!(120);
    add(&app, Who::Admin, heavy).await;
    add(&app, Who::Admin, entry("Pyranha", "Silent")).await;

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

#[sqlx::test]
async fn a_disabled_wiki_is_not_mounted(pool: PgPool) {
    use paddlemate_api::routes::materials::mount_materials;
    let mut api = OpenApi::default();
    let off = mount_materials(ApiRouter::new(), false, state(pool.clone()))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api);
    for path in ["/materials", "/materials/models"] {
        let r = call(&off, Method::GET, path, Who::Admin, None).await;
        assert_eq!(r.status, StatusCode::NOT_FOUND, "{path}");
    }
    let r = add(&off, Who::Admin, entry("Zedboats", "Firecracker")).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    let on = mount_materials(ApiRouter::new(), true, state(pool))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api);
    let r = call(&on, Method::GET, "/materials", Who::Anyone, None).await;
    assert_eq!(r.status, StatusCode::OK);
}
