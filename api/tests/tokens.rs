//! API tokens: create, list and revoke under `/users/me/tokens`, behind the
//! real API-key layer.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{call_key, keyed_user, state};
use paddlemate_api::{layers::auth::api_token_auth, routes::users::users_routes};
use serde_json::{Value, json};
use sqlx::PgPool;

fn app(pool: PgPool) -> Router {
    let state = state(pool);
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/users", users_routes(state.clone()))
        .layer(middleware::from_fn_with_state(state, api_token_auth))
        .finish_api(&mut api)
}

async fn create(app: &Router, key: &str, body: Value) -> common::Reply {
    call_key(app, Method::POST, "/users/me/tokens", Some(key), Some(body)).await
}

#[sqlx::test]
async fn tokens_need_a_signed_in_caller(pool: PgPool) {
    let app = app(pool);
    for (method, uri) in [
        (Method::GET, "/users/me/tokens"),
        (Method::POST, "/users/me/tokens"),
        (Method::DELETE, "/users/me/tokens/1"),
    ] {
        let r = call_key(&app, method, uri, None, Some(json!({ "name": "x" }))).await;
        assert_eq!(r.status, StatusCode::UNAUTHORIZED, "{uri}");
    }
    let r = call_key(
        &app,
        Method::GET,
        "/users/me/tokens",
        Some("pm_unknown"),
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED, "an unknown key");
}

#[sqlx::test]
async fn a_token_is_shown_once_and_works_as_a_key(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    let app = app(pool.clone());

    let r = create(
        &app,
        "pm_mara",
        json!({ "name": "ci", "expires_in_days": 30 }),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let plain = r.body["token"].as_str().unwrap().to_string();
    assert!(plain.starts_with("pm_"));
    assert_eq!(plain.len(), 3 + 64);
    assert_eq!(r.body["name"], "ci");
    assert!(r.body["id"].is_i64());
    assert!(r.body["created_at"].is_string());
    assert!(r.body["expires_at"].is_string());

    // Only the hash is stored.
    let stored: String = sqlx::query_scalar("SELECT token_hash FROM api_tokens WHERE name = 'ci'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_ne!(stored, plain);
    assert_eq!(stored, paddlemate_api::query::tokens::hash_token(&plain));

    // The new key signs in as its owner.
    let listed = call_key(&app, Method::GET, "/users/me/tokens", Some(&plain), None).await;
    assert_eq!(listed.status, StatusCode::OK);

    // The list never carries the secret or the hash.
    let items = listed.body.as_array().unwrap();
    let ci = items.iter().find(|t| t["name"] == "ci").unwrap();
    assert!(ci.get("token").is_none() && ci.get("token_hash").is_none());
    assert_eq!(ci["user_id"], "user-mara");
    assert_eq!(ci["is_active"], true);
    assert!(ci["expires_at"].is_string());
}

#[sqlx::test]
async fn a_token_without_expiry_omits_the_field(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    let app = app(pool);
    let r = create(&app, "pm_mara", json!({ "name": "forever" })).await;
    assert_eq!(r.status, StatusCode::OK);
    assert!(r.body.get("expires_at").is_none());
    let listed = call_key(&app, Method::GET, "/users/me/tokens", Some("pm_mara"), None).await;
    let t = listed
        .body
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "forever")
        .unwrap()
        .clone();
    assert!(t.get("expires_at").is_none());
}

#[sqlx::test]
async fn token_names_are_unique_per_user(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    keyed_user(&pool, "jon").await;
    let app = app(pool);
    assert_eq!(
        create(&app, "pm_mara", json!({ "name": "ci" }))
            .await
            .status,
        StatusCode::OK
    );
    let dup = create(&app, "pm_mara", json!({ "name": "ci" })).await;
    assert_eq!(dup.status, StatusCode::CONFLICT);
    assert_eq!(
        dup.body["error"]["message"],
        "A token with this name already exists"
    );
    // Another user may reuse the name.
    assert_eq!(
        create(&app, "pm_jon", json!({ "name": "ci" })).await.status,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn a_malformed_create_body_is_rejected(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    let app = app(pool);
    let r = create(&app, "pm_mara", json!({})).await;
    assert!(r.status.is_client_error(), "{}", r.status);
}

#[sqlx::test]
async fn tokens_are_listed_per_user_newest_first(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    keyed_user(&pool, "jon").await;
    let app = app(pool);
    create(&app, "pm_mara", json!({ "name": "first" })).await;
    create(&app, "pm_mara", json!({ "name": "second" })).await;
    create(&app, "pm_jon", json!({ "name": "jons" })).await;

    let r = call_key(&app, Method::GET, "/users/me/tokens", Some("pm_mara"), None).await;
    let names: Vec<&str> = r
        .body
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["second", "first", "test"]);
}

#[sqlx::test]
async fn revoking_hides_the_token_and_stops_the_key(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    let app = app(pool);
    let made = create(&app, "pm_mara", json!({ "name": "ci" })).await;
    let plain = made.body["token"].as_str().unwrap().to_string();
    let id = made.body["id"].as_i64().unwrap();

    let r = call_key(
        &app,
        Method::DELETE,
        &format!("/users/me/tokens/{id}"),
        Some("pm_mara"),
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);

    let listed = call_key(&app, Method::GET, "/users/me/tokens", Some("pm_mara"), None).await;
    assert!(
        listed
            .body
            .as_array()
            .unwrap()
            .iter()
            .all(|t| t["id"] != id)
    );

    let used = call_key(&app, Method::GET, "/users/me/tokens", Some(&plain), None).await;
    assert_eq!(used.status, StatusCode::UNAUTHORIZED);

    let again = call_key(
        &app,
        Method::DELETE,
        &format!("/users/me/tokens/{id}"),
        Some("pm_mara"),
        None,
    )
    .await;
    assert_eq!(again.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn nobody_revokes_someone_elses_token(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    keyed_user(&pool, "jon").await;
    let app = app(pool);
    let made = create(&app, "pm_mara", json!({ "name": "ci" })).await;
    let id = made.body["id"].as_i64().unwrap();

    let r = call_key(
        &app,
        Method::DELETE,
        &format!("/users/me/tokens/{id}"),
        Some("pm_jon"),
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let still = call_key(&app, Method::GET, "/users/me/tokens", Some("pm_mara"), None).await;
    assert!(still.body.as_array().unwrap().iter().any(|t| t["id"] == id));
    let missing = call_key(
        &app,
        Method::DELETE,
        "/users/me/tokens/999999",
        Some("pm_jon"),
        None,
    )
    .await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn an_expired_token_is_refused_and_listed_inactive(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    let app = app(pool.clone());
    let made = create(
        &app,
        "pm_mara",
        json!({ "name": "old", "expires_in_days": 1 }),
    )
    .await;
    let plain = made.body["token"].as_str().unwrap().to_string();
    sqlx::query("UPDATE api_tokens SET expires_at = NOW() - interval '1 hour' WHERE name = 'old'")
        .execute(&pool)
        .await
        .unwrap();

    let used = call_key(&app, Method::GET, "/users/me/tokens", Some(&plain), None).await;
    assert_eq!(used.status, StatusCode::UNAUTHORIZED);

    let listed = call_key(&app, Method::GET, "/users/me/tokens", Some("pm_mara"), None).await;
    let old = listed
        .body
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "old")
        .unwrap()
        .clone();
    assert_eq!(old["is_active"], false);
}
