//! The history and sources endpoints end to end, and the writes that feed
//! them: the real waterway and proposal routers on a fresh database per test.
//!
//! Admin calls are faked with a header-driven layer, because admin rights
//! come from a Keycloak role that API keys never carry.

use std::sync::Arc;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::Request,
    http::{Method, StatusCode, header},
    middleware::{self, Next},
    response::Response,
};
use axum_keycloak_auth::{
    decode::{Email, KeycloakToken, Profile, ProfileAndEmail},
    role::KeycloakRole,
};
use moka::future::Cache;
use paddlemate_api::{
    layers::auth::AuthToken,
    routes::{proposals::proposals_routes, waterways::waterways_routes},
    state::{AppState, KeycloakState},
};
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::sync::{Notify, RwLock};
use tower::ServiceExt;

fn state(pool: PgPool) -> AppState {
    AppState {
        pg_pool: pool,
        keycloak_config: KeycloakState {
            url: "http://keycloak.invalid".into(),
            realm: "test".into(),
            client_id: "test".into(),
            client_secret: "test".into(),
        },
        admin_token_cache: Arc::new(RwLock::new(None)),
        username_cache: Cache::builder().max_capacity(100).build(),
        gauge_wake: Arc::new(Notify::new()),
        region_wake: Arc::new(Notify::new()),
        live_events: tokio::sync::broadcast::channel(16).0,
        push: None,
        live_streams: Default::default(),
    }
}

fn token(user_id: &str, admin: bool) -> AuthToken {
    let now = time::OffsetDateTime::now_utc();
    AuthToken(KeycloakToken {
        expires_at: now + time::Duration::hours(1),
        issued_at: now,
        jwt_id: "test".into(),
        issuer: "test".into(),
        audience: vec![],
        subject: user_id.into(),
        authorized_party: "test".into(),
        roles: if admin {
            vec![KeycloakRole::Realm {
                role: "server_admin".into(),
            }]
        } else {
            vec![]
        },
        extra: ProfileAndEmail {
            profile: Profile {
                full_name: None,
                given_name: None,
                family_name: None,
                preferred_username: user_id.into(),
            },
            email: Email {
                email: String::new(),
                email_verified: true,
            },
        },
    })
}

/// `x-test-user` signs the request in as that user id; `x-test-admin` adds the
/// server_admin role.
async fn fake_auth(mut req: Request, next: Next) -> Response {
    let user = req
        .headers()
        .get("x-test-user")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let admin = req.headers().contains_key("x-test-admin");
    if let Some(user) = user {
        req.extensions_mut().insert(token(&user, admin));
    }
    next.run(req).await
}

fn app(pool: PgPool) -> Router {
    let state = state(pool);
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/waterways", waterways_routes(state.clone()))
        .nest_api_service("/proposals", proposals_routes(state))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

#[derive(Clone, Copy)]
enum Who {
    Anyone,
    Admin,
    User(&'static str),
}

struct Reply {
    status: StatusCode,
    body: Value,
}

const ADMIN: &str = "admin-1";

async fn add_user(pool: &PgPool, id: &str, name: &str) {
    sqlx::query("INSERT INTO users (id, username) VALUES ($1, $2)")
        .bind(id)
        .bind(name)
        .execute(pool)
        .await
        .unwrap();
}

/// An admin and one ordinary contributor.
async fn people(pool: &PgPool) {
    add_user(pool, ADMIN, "root").await;
    add_user(pool, "mara-1", "mara").await;
}

async fn call(app: &Router, method: Method, uri: &str, who: Who, body: Option<Value>) -> Reply {
    let mut req = Request::builder().method(method).uri(uri);
    match who {
        Who::Anyone => {}
        Who::Admin => req = req.header("x-test-user", ADMIN).header("x-test-admin", "1"),
        Who::User(id) => req = req.header("x-test-user", id),
    }
    let req = match body {
        Some(b) => req
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), usize::MAX).await.unwrap();
    Reply {
        status,
        body: serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    }
}

async fn get(app: &Router, uri: &str) -> Reply {
    call(app, Method::GET, uri, Who::Anyone, None).await
}

fn line() -> Value {
    json!({ "type": "LineString", "coordinates": [[10.0, 47.0], [10.1, 47.1]] })
}

fn point(x: f64) -> Value {
    json!({ "type": "Point", "coordinates": [x, 47.0] })
}

async fn make_waterway(app: &Router, name: &str) -> i64 {
    let r = call(
        app,
        Method::POST,
        "/waterways",
        Who::Admin,
        Some(json!({ "name": name })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    r.body["id"].as_i64().unwrap()
}

async fn make_section(app: &Router, waterway: i64, name: &str, features: Value) -> Value {
    let r = call(
        app,
        Method::POST,
        &format!("/waterways/{waterway}/sections"),
        Who::Admin,
        Some(json!({ "name": name, "location": line(), "country": "AT", "features": features })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    r.body
}

async fn make_feature(app: &Router, waterway: i64, section: i64, name: &str) -> i64 {
    let r = call(
        app,
        Method::POST,
        &format!("/waterways/{waterway}/sections/{section}/features"),
        Who::Admin,
        Some(json!({ "feature_type": "put_in", "location": point(10.0), "name": name })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    r.body["id"].as_i64().unwrap()
}

fn kinds(history: &Value) -> Vec<String> {
    history["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["kind"].as_str().unwrap().to_string())
        .collect()
}

fn change<'a>(step: &'a Value, field: &str) -> &'a Value {
    step["changes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["field"] == field)
        .unwrap_or_else(|| panic!("no change for {field} in {step}"))
}

#[sqlx::test]
async fn waterway_writes_leave_steps(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let id = make_waterway(&app, "Salzach").await;

    let r = call(
        &app,
        Method::PUT,
        &format!("/waterways/{id}"),
        Who::Admin,
        Some(json!({ "description": "Alpine river" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    // Saving the same text again changes nothing, so it leaves no step.
    let r = call(
        &app,
        Method::PUT,
        &format!("/waterways/{id}"),
        Who::Admin,
        Some(json!({ "description": "Alpine river" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);

    let h = get(&app, &format!("/waterways/{id}/history")).await;
    assert_eq!(h.status, StatusCode::OK);
    assert_eq!(kinds(&h.body), ["created", "edited"]);
    assert_eq!(h.body["total"], 2);
    let first = &h.body["items"][0];
    assert_eq!(
        first["actor"],
        json!({ "user_id": ADMIN, "username": "root" })
    );
    assert_eq!(change(first, "name")["after"], "Salzach");
    assert_eq!(change(first, "name")["before"], Value::Null);
    let edit = &h.body["items"][1];
    assert_eq!(change(edit, "description")["after"], "Alpine river");
    assert_eq!(change(edit, "description")["before"], Value::Null);

    let created_by: Option<String> =
        sqlx::query_scalar("SELECT created_by FROM waterways WHERE id = $1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(created_by.as_deref(), Some(ADMIN));

    let r = call(
        &app,
        Method::DELETE,
        &format!("/waterways/{id}"),
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    // The river is gone, its history is not.
    let h = get(&app, &format!("/waterways/{id}/history")).await;
    assert_eq!(h.status, StatusCode::OK);
    assert_eq!(kinds(&h.body), ["created", "edited", "deleted"]);
    // The sources view needs a live river.
    assert_eq!(
        get(&app, &format!("/waterways/{id}/sources")).await.status,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn section_writes_leave_steps(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let section = make_section(&app, w, "Upper", json!([])).await;
    let s = section["id"].as_i64().unwrap();

    let r = call(
        &app,
        Method::PUT,
        &format!("/waterways/{w}/sections/{s}"),
        Who::Admin,
        Some(json!({ "name": "Upper Inn", "location": {
            "type": "LineString", "coordinates": [[10.0, 47.0], [10.2, 47.2]] } })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);

    let h = get(&app, &format!("/waterways/{w}/sections/{s}/history")).await;
    assert_eq!(kinds(&h.body), ["created", "edited"]);
    let edit = &h.body["items"][1];
    assert_eq!(change(edit, "name")["before"], "Upper");
    assert_eq!(change(edit, "name")["after"], "Upper Inn");
    // A geometry change is named but has no display strings.
    assert_eq!(change(edit, "location")["before"], Value::Null);
    assert_eq!(change(edit, "location")["after"], Value::Null);

    let r = call(
        &app,
        Method::DELETE,
        &format!("/waterways/{w}/sections/{s}"),
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let h = get(&app, &format!("/waterways/{w}/sections/{s}/history")).await;
    assert_eq!(h.status, StatusCode::OK);
    assert_eq!(kinds(&h.body), ["created", "edited", "deleted"]);
}

#[sqlx::test]
async fn feature_writes_leave_steps_and_survive_deletion(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let s = make_section(&app, w, "Upper", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let f = make_feature(&app, w, s, "Old weir").await;
    let base = format!("/waterways/{w}/sections/{s}/features/{f}");

    let r = call(
        &app,
        Method::PUT,
        &base,
        Who::Admin,
        Some(json!({ "name": "New weir", "metadata": { "difficulty": "III" } })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);

    let h = get(&app, &format!("{base}/history")).await;
    assert_eq!(kinds(&h.body), ["created", "edited"]);
    let edit = &h.body["items"][1];
    assert_eq!(change(edit, "name")["before"], "Old weir");
    assert_eq!(change(edit, "name")["after"], "New weir");
    assert_eq!(change(edit, "difficulty")["after"], "III");

    let r = call(&app, Method::DELETE, &base, Who::Admin, None).await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    // The feature itself is gone, its history is not.
    let r = call(&app, Method::PUT, &base, Who::Admin, Some(json!({}))).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let h = get(&app, &format!("{base}/history")).await;
    assert_eq!(h.status, StatusCode::OK);
    assert_eq!(kinds(&h.body), ["created", "edited", "deleted"]);
}

#[sqlx::test]
async fn bundled_features_get_their_own_first_step(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let section = make_section(
        &app,
        w,
        "Upper",
        json!([{ "feature_type": "take_out", "location": point(10.1), "name": "Beach" }]),
    )
    .await;
    let s = section["id"].as_i64().unwrap();
    let f: i64 = sqlx::query_scalar("SELECT id FROM features WHERE section_id = $1")
        .bind(s)
        .fetch_one(&pool)
        .await
        .unwrap();
    let h = get(
        &app,
        &format!("/waterways/{w}/sections/{s}/features/{f}/history"),
    )
    .await;
    assert_eq!(kinds(&h.body), ["created"]);
    assert_eq!(change(&h.body["items"][0], "name")["after"], "Beach");
}

#[sqlx::test]
async fn accepted_proposals_leave_proposal_steps(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let s = make_section(&app, w, "Upper", json!([])).await["id"]
        .as_i64()
        .unwrap();

    // A new feature from a contributor.
    let r = call(
        &app,
        Method::POST,
        &format!("/waterways/{w}/sections/{s}/features"),
        Who::User("mara-1"),
        Some(json!({ "feature_type": "put_in", "location": point(10.0), "name": "Ramp" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    let create_id = r.body["id"].as_i64().unwrap();
    let r = call(
        &app,
        Method::PATCH,
        &format!("/proposals/{create_id}"),
        Who::Admin,
        Some(json!({ "status": "approved" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["submitted_by_name"], "mara");
    assert_eq!(r.body["reviewed_by_name"], "root");
    let f: i64 = sqlx::query_scalar("SELECT id FROM features WHERE section_id = $1")
        .bind(s)
        .fetch_one(&pool)
        .await
        .unwrap();
    let base = format!("/waterways/{w}/sections/{s}/features/{f}");

    // An edit of it.
    let r = call(
        &app,
        Method::PUT,
        &base,
        Who::User("mara-1"),
        Some(json!({ "name": "Concrete ramp" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    let edit_id = r.body["id"].as_i64().unwrap();
    let r = call(
        &app,
        Method::PATCH,
        &format!("/proposals/{edit_id}"),
        Who::Admin,
        Some(json!({ "status": "approved" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);

    // Its removal.
    let r = call(&app, Method::DELETE, &base, Who::User("mara-1"), None).await;
    assert_eq!(r.status, StatusCode::ACCEPTED);
    let delete_id = r.body["id"].as_i64().unwrap();
    let r = call(
        &app,
        Method::PATCH,
        &format!("/proposals/{delete_id}"),
        Who::Admin,
        Some(json!({ "status": "approved" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);

    let h = get(&app, &format!("{base}/history")).await;
    assert_eq!(
        kinds(&h.body),
        ["proposal_accepted", "proposal_accepted", "deleted"]
    );
    let items = h.body["items"].as_array().unwrap();
    for (item, id) in items.iter().zip([create_id, edit_id, delete_id]) {
        assert_eq!(item["proposal_id"], id);
        assert_eq!(item["actor"]["username"], "mara");
        assert_eq!(item["reviewer"]["username"], "root");
    }
    assert_eq!(change(&items[1], "name")["before"], "Ramp");
    assert_eq!(change(&items[1], "name")["after"], "Concrete ramp");

    // The proposal list carries the names too.
    let list = call(
        &app,
        Method::GET,
        "/proposals?status=approved",
        Who::Admin,
        None,
    )
    .await;
    let first = &list.body.as_array().unwrap()[0];
    assert_eq!(first["submitted_by_name"], "mara");
    assert_eq!(first["reviewed_by_name"], "root");
}

#[sqlx::test]
async fn accepted_proposals_for_rivers_and_sections_leave_steps(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let r = call(
        &app,
        Method::POST,
        "/waterways",
        Who::User("mara-1"),
        Some(json!({ "name": "Lech" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED);
    let pid = r.body["id"].as_i64().unwrap();
    call(
        &app,
        Method::PATCH,
        &format!("/proposals/{pid}"),
        Who::Admin,
        Some(json!({ "status": "approved" })),
    )
    .await;
    let w: i64 = sqlx::query_scalar("SELECT id FROM waterways WHERE name = 'Lech'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let h = get(&app, &format!("/waterways/{w}/history")).await;
    assert_eq!(kinds(&h.body), ["proposal_accepted"]);
    assert_eq!(h.body["items"][0]["actor"]["username"], "mara");

    // A section edit.
    let s = make_section(&app, w, "Lower", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let r = call(
        &app,
        Method::PUT,
        &format!("/waterways/{w}/sections/{s}"),
        Who::User("mara-1"),
        Some(json!({ "description": "Easy" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED);
    let pid = r.body["id"].as_i64().unwrap();
    call(
        &app,
        Method::PATCH,
        &format!("/proposals/{pid}"),
        Who::Admin,
        Some(json!({ "status": "approved" })),
    )
    .await;
    let h = get(&app, &format!("/waterways/{w}/sections/{s}/history")).await;
    assert_eq!(kinds(&h.body), ["created", "proposal_accepted"]);
    assert_eq!(change(&h.body["items"][1], "description")["after"], "Easy");

    // A rejected proposal changes nothing.
    let r = call(
        &app,
        Method::PUT,
        &format!("/waterways/{w}/sections/{s}"),
        Who::User("mara-1"),
        Some(json!({ "description": "Wild" })),
    )
    .await;
    let pid = r.body["id"].as_i64().unwrap();
    call(
        &app,
        Method::PATCH,
        &format!("/proposals/{pid}"),
        Who::Admin,
        Some(json!({ "status": "rejected" })),
    )
    .await;
    let h = get(&app, &format!("/waterways/{w}/sections/{s}/history")).await;
    assert_eq!(h.body["total"], 2);
}

#[sqlx::test]
async fn a_failed_approval_leaves_no_step(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let r = call(
        &app,
        Method::POST,
        "/waterways",
        Who::User("mara-1"),
        Some(json!({ "name": "Lech" })),
    )
    .await;
    let pid = r.body["id"].as_i64().unwrap();
    // Someone takes the name before the proposal is reviewed.
    make_waterway(&app, "Lech").await;
    let before: i64 = sqlx::query_scalar("SELECT count(*) FROM entity_history")
        .fetch_one(&pool)
        .await
        .unwrap();
    let r = call(
        &app,
        Method::PATCH,
        &format!("/proposals/{pid}"),
        Who::Admin,
        Some(json!({ "status": "approved" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    let after: i64 = sqlx::query_scalar("SELECT count(*) FROM entity_history")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, after);
    let _ = w;
}

#[sqlx::test]
async fn history_is_looked_up_inside_its_parents(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let other = make_waterway(&app, "Lech").await;
    let a = make_section(&app, w, "A", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let b = make_section(&app, w, "B", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let foreign = make_section(&app, other, "C", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let f = make_feature(&app, w, a, "Ramp").await;

    let ok = get(
        &app,
        &format!("/waterways/{w}/sections/{a}/features/{f}/history"),
    )
    .await;
    assert_eq!(ok.status, StatusCode::OK);
    // The feature id through another section of the same river.
    let r = get(
        &app,
        &format!("/waterways/{w}/sections/{b}/features/{f}/history"),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    // Through another river's section.
    let r = get(
        &app,
        &format!("/waterways/{other}/sections/{foreign}/features/{f}/history"),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    // Through the right section under the wrong river.
    let r = get(
        &app,
        &format!("/waterways/{other}/sections/{a}/features/{f}/history"),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    // A section of another river.
    let r = get(&app, &format!("/waterways/{w}/sections/{foreign}/history")).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    // Ids that do not exist at all.
    assert_eq!(
        get(&app, "/waterways/999999/history").await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        get(&app, "/waterways/999999/sources").await.status,
        StatusCode::NOT_FOUND
    );
    let r = get(
        &app,
        &format!("/waterways/{w}/sections/{a}/features/999999/history"),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    // Even with a forged step row, a section's steps never show up under
    // another parent: the step is found only through its own ids.
    sqlx::query(
        "INSERT INTO entity_history (entity_kind, entity_id, waterway_id, section_id, kind) \
         VALUES ('feature', $1, $2, $3, 'edited')",
    )
    .bind(f)
    .bind(other)
    .bind(foreign)
    .execute(&pool)
    .await
    .unwrap();
    let ok = get(
        &app,
        &format!("/waterways/{w}/sections/{a}/features/{f}/history"),
    )
    .await;
    assert_eq!(ok.body["total"], 1);
}

#[sqlx::test]
async fn history_is_paged_and_clamped(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    for i in 0..4 {
        call(
            &app,
            Method::PUT,
            &format!("/waterways/{w}"),
            Who::Admin,
            Some(json!({ "description": format!("v{i}") })),
        )
        .await;
    }
    let base = format!("/waterways/{w}/history");

    let all = get(&app, &base).await;
    assert_eq!(all.body["total"], 5);
    assert_eq!(all.body["per_page"], 50);
    assert_eq!(all.body["total_pages"], 1);

    let p2 = get(&app, &format!("{base}?per_page=2&page=2")).await;
    assert_eq!(p2.body["items"].as_array().unwrap().len(), 2);
    assert_eq!(p2.body["page"], 2);
    assert_eq!(p2.body["total_pages"], 3);
    // Oldest first: page 2 starts at the second edit.
    assert_eq!(change(&p2.body["items"][0], "description")["after"], "v1");

    let last = get(&app, &format!("{base}?per_page=2&page=3")).await;
    assert_eq!(last.body["items"].as_array().unwrap().len(), 1);
    let beyond = get(&app, &format!("{base}?per_page=2&page=9")).await;
    assert_eq!(beyond.status, StatusCode::OK);
    assert!(beyond.body["items"].as_array().unwrap().is_empty());

    let big = get(&app, &format!("{base}?per_page=100000")).await;
    assert_eq!(big.body["per_page"], 100);
    let zero = get(&app, &format!("{base}?per_page=0&page=0")).await;
    assert_eq!(zero.body["per_page"], 1);
    assert_eq!(zero.body["page"], 1);
}

#[sqlx::test]
async fn steps_expose_only_usernames_and_bounded_changes(pool: PgPool) {
    people(&pool).await;
    sqlx::query("UPDATE users SET updated_at = NOW()")
        .execute(&pool)
        .await
        .unwrap();
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let long = "x".repeat(5000);
    call(
        &app,
        Method::PUT,
        &format!("/waterways/{w}"),
        Who::Admin,
        Some(json!({ "description": long })),
    )
    .await;

    let h = get(&app, &format!("/waterways/{w}/history")).await;
    let step = &h.body["items"][1];
    let keys: Vec<&String> = step["actor"].as_object().unwrap().keys().collect();
    assert_eq!(keys, ["user_id", "username"]);
    let shown = change(step, "description")["after"].as_str().unwrap();
    assert_eq!(shown.chars().count(), 200);

    // The table itself refuses an oversized list.
    let too_many = Value::Array(
        (0..33)
            .map(|i| json!({ "field": format!("f{i}") }))
            .collect(),
    );
    let r = sqlx::query(
        "INSERT INTO entity_history (entity_kind, entity_id, waterway_id, kind, changes) \
         VALUES ('waterway', $1, $1, 'edited', $2)",
    )
    .bind(w)
    .bind(too_many)
    .execute(&pool)
    .await;
    assert!(r.is_err());
}

#[sqlx::test]
async fn sources_view_counts_sources_and_contributors(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let s = make_section(&app, w, "Upper", json!([])).await["id"]
        .as_i64()
        .unwrap();
    make_feature(&app, w, s, "Ramp").await;
    // Two imported steps from one source, one from a river elsewhere.
    for (entity, section) in [(s, Some(s)), (w, None)] {
        sqlx::query(
            "INSERT INTO entity_history (entity_kind, entity_id, waterway_id, section_id, kind, source_id) \
             VALUES ($1, $2, $3, $4, 'imported', 'import:rivermap')",
        )
        .bind(if section.is_some() { "section" } else { "waterway" })
        .bind(entity)
        .bind(w)
        .bind(section)
        .execute(&pool)
        .await
        .unwrap();
    }
    let elsewhere = make_waterway(&app, "Lech").await;
    sqlx::query(
        "INSERT INTO entity_history (entity_kind, entity_id, waterway_id, kind, source_id) \
         VALUES ('waterway', $1, $1, 'imported', 'import:rivermap')",
    )
    .bind(elsewhere)
    .execute(&pool)
    .await
    .unwrap();

    let r = get(&app, &format!("/waterways/{w}/sources")).await;
    assert_eq!(r.status, StatusCode::OK);
    let sources = r.body["sources"].as_array().unwrap();
    assert_eq!(sources.len(), 1);
    assert_eq!(sources[0]["source"]["id"], "import:rivermap");
    assert_eq!(sources[0]["source"]["short_name"], "Rivermap");
    assert_eq!(sources[0]["entries"], 2);
    let people = r.body["contributors"].as_array().unwrap();
    assert_eq!(people.len(), 1);
    assert_eq!(
        people[0]["user"],
        json!({ "user_id": ADMIN, "username": "root" })
    );
    // River + section + feature created by the admin, none for the import.
    assert_eq!(people[0]["steps"], 3);
    assert!(people[0]["last_at"].is_string());
}

#[sqlx::test]
async fn sources_view_can_be_scoped_to_one_section(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let s1 = make_section(&app, w, "Upper", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let s2 = make_section(&app, w, "Lower", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let other = make_waterway(&app, "Lech").await;
    let foreign = make_section(&app, other, "Elsewhere", json!([])).await["id"]
        .as_i64()
        .unwrap();
    // One imported step on the first section, two on the second (by mara).
    for (section, actor, times) in [(s1, None, 1), (s2, Some("mara-1"), 2)] {
        for _ in 0..times {
            sqlx::query(
                "INSERT INTO entity_history (entity_kind, entity_id, waterway_id, section_id, kind, source_id, actor_id) \
                 VALUES ('section', $1, $2, $1, 'imported', 'import:rivermap', $3)",
            )
            .bind(section)
            .bind(w)
            .bind(actor)
            .execute(&pool)
            .await
            .unwrap();
        }
    }

    let r = get(&app, &format!("/waterways/{w}/sources?section_id={s1}")).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["sources"][0]["entries"], 1);
    let names: Vec<&str> = r.body["contributors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["user"]["username"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["root"], "mara only touched the other section");

    let r = get(&app, &format!("/waterways/{w}/sources?section_id={s2}")).await;
    assert_eq!(r.body["sources"][0]["entries"], 2);
    assert!(
        r.body["contributors"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["user"]["username"] == "mara")
    );

    // The whole river still counts all three.
    let r = get(&app, &format!("/waterways/{w}/sources")).await;
    assert_eq!(r.body["sources"][0]["entries"], 3);

    // A section of another river is not reachable through this one.
    let r = get(
        &app,
        &format!("/waterways/{w}/sources?section_id={foreign}"),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn a_proposal_carries_the_submitters_note_into_its_history_step(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());

    // Too long: rejected before anything is stored.
    let r = call(
        &app,
        Method::POST,
        "/waterways",
        Who::User("mara-1"),
        Some(json!({ "name": "Lech", "proposal_note": "x".repeat(501) })),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST, "{}", r.body);
    assert_eq!(r.body["error"]["target"], "proposal_note");
    let stored: i64 = sqlx::query_scalar("SELECT count(*) FROM proposals")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stored, 0);

    let r = call(
        &app,
        Method::POST,
        "/waterways",
        Who::User("mara-1"),
        Some(json!({ "name": "Lech", "proposal_note": "  Paddled it last week  " })),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    assert_eq!(r.body["submitter_note"], "Paddled it last week");
    let pid = r.body["id"].as_i64().unwrap();
    // The note is not part of the proposed data.
    assert!(r.body["proposed_data"].get("proposal_note").is_none());

    let r = get(&app, &format!("/proposals/{pid}")).await;
    assert_eq!(r.body["submitter_note"], "Paddled it last week");
    let r = get(&app, "/proposals").await;
    assert_eq!(r.body[0]["submitter_note"], "Paddled it last week");

    call(
        &app,
        Method::PATCH,
        &format!("/proposals/{pid}"),
        Who::Admin,
        Some(json!({ "status": "approved" })),
    )
    .await;
    let w: i64 = sqlx::query_scalar("SELECT id FROM waterways WHERE name = 'Lech'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let h = get(&app, &format!("/waterways/{w}/history")).await;
    assert_eq!(h.body["items"][0]["proposal_note"], "Paddled it last week");

    // No note, no field value.
    let r = call(
        &app,
        Method::POST,
        "/waterways",
        Who::User("mara-1"),
        Some(json!({ "name": "Isar" })),
    )
    .await;
    assert!(r.body["submitter_note"].is_null());
}

#[sqlx::test]
async fn the_backfill_gives_old_rows_a_first_step(pool: PgPool) {
    people(&pool).await;
    // Rows as they were before history existed.
    sqlx::query("INSERT INTO waterways (id, waterway_type, name, description) VALUES (1, 'river', 'Imported', 'd'), (2, 'river', 'Hand made', NULL), (3, 'river', 'By proposal', NULL)")
        .execute(&pool).await.unwrap();
    for (id, w, name, by) in [
        (10, 1, "S1", "rivermap-import"),
        (11, 2, "S2", "mara-1"),
        (12, 2, "S3", "ghost-user"),
    ] {
        sqlx::query(
            "INSERT INTO water_sections (id, waterway_id, name, location, created_by) \
             VALUES ($1, $2, $3, ST_GeomFromText('LINESTRING(10 47, 10.1 47.1)', 4326), $4)",
        )
        .bind(id)
        .bind(w)
        .bind(name)
        .bind(by)
        .execute(&pool)
        .await
        .unwrap();
    }
    for (id, by) in [(20, "rivermap:77"), (21, "mara-1")] {
        sqlx::query(
            "INSERT INTO features (id, section_id, feature_type, location, created_by) \
             VALUES ($1, 10, 'put_in', ST_GeomFromText('POINT(10 47)', 4326), $2)",
        )
        .bind(id)
        .bind(by)
        .execute(&pool)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO proposals (id, entity_type, operation, proposed_data, submitted_by, status, reviewed_by) \
         VALUES (1, 'waterway', 'create', '{\"name\": \"By proposal\"}', 'mara-1', 'approved', $1), \
                (2, 'water_section', 'update', '{\"name\": \"S2 new\", \"country\": \"AT\"}', 'mara-1', 'approved', $1)",
    )
    .bind(ADMIN).execute(&pool).await.unwrap();
    sqlx::query("UPDATE proposals SET entity_id = 11, original_data = '{\"name\": \"S2\", \"country\": null}' WHERE id = 2")
        .execute(&pool).await.unwrap();

    sqlx::query("DELETE FROM entity_history")
        .execute(&pool)
        .await
        .unwrap();
    let backfill = include_str!("../migrations/00048_entity_history_backfill.sql");
    sqlx::raw_sql(backfill).execute(&pool).await.unwrap();

    let step = |kind: &'static str, id: i64| {
        let pool = pool.clone();
        async move {
            sqlx::query_as::<_, (String, Option<String>, Option<String>, Option<i64>)>(
                "SELECT kind, actor_id, source_id, proposal_id FROM entity_history \
                 WHERE entity_kind = $1 AND entity_id = $2 ORDER BY at, id LIMIT 1",
            )
            .bind(kind)
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    // Imported river, section and features name the source, with no actor.
    assert_eq!(
        step("waterway", 1).await,
        (
            "imported".into(),
            None,
            Some("import:rivermap".into()),
            None
        )
    );
    assert_eq!(
        step("section", 10).await,
        (
            "imported".into(),
            None,
            Some("import:rivermap".into()),
            None
        )
    );
    assert_eq!(
        step("feature", 20).await,
        (
            "imported".into(),
            None,
            Some("import:rivermap".into()),
            None
        )
    );
    // A user's rows name the user; an unknown creator is no actor.
    assert_eq!(
        step("feature", 21).await,
        ("created".into(), Some("mara-1".into()), None, None)
    );
    assert_eq!(
        step("section", 11).await,
        ("created".into(), Some("mara-1".into()), None, None)
    );
    assert_eq!(
        step("section", 12).await,
        ("created".into(), None, None, None)
    );
    assert_eq!(
        step("waterway", 2).await,
        ("created".into(), None, None, None)
    );
    // A river made by an accepted proposal belongs to it.
    assert_eq!(
        step("waterway", 3).await,
        (
            "proposal_accepted".into(),
            Some("mara-1".into()),
            None,
            Some(1)
        )
    );
    let by: Option<String> = sqlx::query_scalar("SELECT created_by FROM waterways WHERE id = 3")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(by.as_deref(), Some("mara-1"));

    // The accepted edit became a second step with its diff.
    let (kind, changes): (String, Value) = sqlx::query_as(
        "SELECT kind, changes FROM entity_history WHERE entity_kind = 'section' AND entity_id = 11 \
         ORDER BY at DESC, id DESC LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(kind, "proposal_accepted");
    let fields: Vec<&str> = changes
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["field"].as_str().unwrap())
        .collect();
    assert_eq!(fields, ["country", "name"]);
    assert_eq!(
        changes[1],
        json!({ "field": "name", "before": "S2", "after": "S2 new" })
    );
}

async fn approve(app: &Router, proposal: i64) {
    let r = call(
        app,
        Method::PATCH,
        &format!("/proposals/{proposal}"),
        Who::Admin,
        Some(json!({ "status": "approved" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
}

#[sqlx::test]
async fn deleting_a_parent_leaves_a_step_for_each_child(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let other = make_waterway(&app, "Lech").await;
    let s1 = make_section(&app, w, "Upper", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let s2 = make_section(&app, w, "Lower", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let f1 = make_feature(&app, w, s1, "Weir").await;
    let f2 = make_feature(&app, w, s2, "Ramp").await;

    // A section deleted by an accepted proposal: its feature gets a step that
    // carries the proposal, and stays readable through the old path.
    let r = call(
        &app,
        Method::DELETE,
        &format!("/waterways/{w}/sections/{s1}"),
        Who::User("mara-1"),
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED);
    let pid = r.body["id"].as_i64().unwrap();
    approve(&app, pid).await;
    let path = format!("/waterways/{w}/sections/{s1}/features/{f1}/history");
    let h = get(&app, &path).await;
    assert_eq!(kinds(&h.body), ["created", "deleted"]);
    assert_eq!(h.body["items"][1]["proposal_id"], pid);
    let h = get(&app, &format!("/waterways/{w}/sections/{s1}/history")).await;
    assert_eq!(kinds(&h.body), ["created", "deleted"]);
    // Not through another parent's path.
    for path in [
        format!("/waterways/{other}/sections/{s1}/features/{f1}/history"),
        format!("/waterways/{w}/sections/{s2}/features/{f1}/history"),
        format!("/waterways/{other}/sections/{s1}/history"),
    ] {
        assert_eq!(
            get(&app, &path).await.status,
            StatusCode::NOT_FOUND,
            "{path}"
        );
    }

    // A river deleted by an admin: sections and features under it get steps.
    let r = call(
        &app,
        Method::DELETE,
        &format!("/waterways/{w}"),
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let h = get(&app, &format!("/waterways/{w}/sections/{s2}/history")).await;
    assert_eq!(kinds(&h.body), ["created", "deleted"]);
    let h = get(
        &app,
        &format!("/waterways/{w}/sections/{s2}/features/{f2}/history"),
    )
    .await;
    assert_eq!(kinds(&h.body), ["created", "deleted"]);
    // The sibling river is untouched.
    let h = get(&app, &format!("/waterways/{other}/history")).await;
    assert_eq!(kinds(&h.body), ["created"]);
}

#[sqlx::test]
async fn an_accepted_edit_waits_for_the_row_lock(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let r = call(
        &app,
        Method::PUT,
        &format!("/waterways/{w}"),
        Who::User("mara-1"),
        Some(json!({ "description": "From mara" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED);
    let pid = r.body["id"].as_i64().unwrap();

    // A concurrent edit holds the row. The approval must wait for it and take
    // its result as the before state, or the recorded change would be wrong.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("UPDATE waterways SET description = 'Concurrent' WHERE id = $1")
        .bind(w)
        .execute(&mut *tx)
        .await
        .unwrap();
    let waiting = tokio::spawn({
        let app = app.clone();
        async move { approve(&app, pid).await }
    });
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    assert!(!waiting.is_finished(), "approval did not wait for the lock");
    tx.commit().await.unwrap();
    waiting.await.unwrap();

    let h = get(&app, &format!("/waterways/{w}/history")).await;
    let step = &h.body["items"][1];
    assert_eq!(step["kind"], "proposal_accepted");
    assert_eq!(change(step, "description")["before"], "Concurrent");
    assert_eq!(change(step, "description")["after"], "From mara");
}

async fn delete_feature(app: &Router, w: i64, s: i64, f: i64, who: Who) -> Reply {
    call(
        app,
        Method::DELETE,
        &format!("/waterways/{w}/sections/{s}/features/{f}"),
        who,
        None,
    )
    .await
}

fn feature_ids(page: &Value) -> Vec<i64> {
    page["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["feature_id"].as_i64().unwrap())
        .collect()
}

#[sqlx::test]
async fn deleted_features_list_both_kinds_of_delete(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let s = make_section(&app, w, "Upper", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let direct = make_feature(&app, w, s, "Old weir").await;
    let proposed = make_feature(&app, w, s, "Ramp").await;
    let live = make_feature(&app, w, s, "Bridge").await;
    // A rename: the list shows the last name, not the first.
    let r = call(
        &app,
        Method::PUT,
        &format!("/waterways/{w}/sections/{s}/features/{direct}"),
        Who::Admin,
        Some(json!({ "name": "New weir" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);

    let r = delete_feature(&app, w, s, direct, Who::Admin).await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let r = delete_feature(&app, w, s, proposed, Who::User("mara-1")).await;
    assert_eq!(r.status, StatusCode::ACCEPTED);
    let pid = r.body["id"].as_i64().unwrap();
    let url = format!("/waterways/{w}/sections/{s}/deleted-features");
    // A pending proposal is not a deletion.
    assert_eq!(get(&app, &url).await.body["total"], 1);
    approve(&app, pid).await;

    let page = get(&app, &url).await;
    assert_eq!(page.status, StatusCode::OK);
    assert_eq!(page.body["total"], 2);
    assert_eq!(feature_ids(&page.body), [proposed, direct]);
    let first = &page.body["items"][0];
    assert_eq!(first["name"], "Ramp");
    assert_eq!(first["feature_type"], "put_in");
    assert_eq!(first["deleted_by"]["username"], "mara");
    assert_eq!(first["reviewer"]["username"], "root");
    assert_eq!(first["proposal_id"], pid);
    let second = &page.body["items"][1];
    assert_eq!(second["name"], "New weir");
    assert_eq!(second["deleted_by"]["username"], "root");
    assert!(second["proposal_id"].is_null());
    assert!(!feature_ids(&page.body).contains(&live));
    // Only usernames, no ids beyond the user id the history routes show.
    assert!(first["deleted_by"].get("email").is_none());
}

#[sqlx::test]
async fn deleted_features_are_looked_up_inside_their_parents(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let other = make_waterway(&app, "Lech").await;
    let s1 = make_section(&app, w, "Upper", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let s2 = make_section(&app, w, "Lower", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let f1 = make_feature(&app, w, s1, "Weir").await;
    let f2 = make_feature(&app, w, s2, "Ramp").await;
    delete_feature(&app, w, s1, f1, Who::Admin).await;
    delete_feature(&app, w, s2, f2, Who::Admin).await;

    let page = get(
        &app,
        &format!("/waterways/{w}/sections/{s1}/deleted-features"),
    )
    .await;
    assert_eq!(feature_ids(&page.body), [f1]);
    let page = get(
        &app,
        &format!("/waterways/{w}/sections/{s2}/deleted-features"),
    )
    .await;
    assert_eq!(feature_ids(&page.body), [f2]);
    // A step filed under the section id but another river is not this
    // section's (ids are not trusted to line up).
    sqlx::query(
        "INSERT INTO entity_history (entity_kind, entity_id, waterway_id, section_id, kind) \
         VALUES ('feature', 777, $1, $2, 'deleted')",
    )
    .bind(other)
    .bind(s1)
    .execute(&pool)
    .await
    .unwrap();
    let page = get(
        &app,
        &format!("/waterways/{w}/sections/{s1}/deleted-features"),
    )
    .await;
    assert_eq!(feature_ids(&page.body), [f1]);
    // Another river's path to the section finds nothing, and neither does a
    // section that never existed.
    for path in [
        format!("/waterways/{other}/sections/{s1}/deleted-features"),
        format!("/waterways/{w}/sections/999999/deleted-features"),
    ] {
        let r = get(&app, &path).await;
        assert_eq!(r.status, StatusCode::NOT_FOUND, "{path}");
        assert_eq!(r.body["error"]["code"], "not_found", "{path}");
    }
}

#[sqlx::test]
async fn deleted_features_survive_the_section_and_river(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let s = make_section(&app, w, "Upper", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let f = make_feature(&app, w, s, "Weir").await;
    let url = format!("/waterways/{w}/sections/{s}/deleted-features");
    assert_eq!(get(&app, &url).await.body["total"], 0);

    let r = call(
        &app,
        Method::DELETE,
        &format!("/waterways/{w}/sections/{s}"),
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let page = get(&app, &url).await;
    assert_eq!(page.status, StatusCode::OK);
    assert_eq!(feature_ids(&page.body), [f]);
    assert_eq!(page.body["items"][0]["name"], "Weir");

    call(
        &app,
        Method::DELETE,
        &format!("/waterways/{w}"),
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(get(&app, &url).await.status, StatusCode::OK);
}

#[sqlx::test]
async fn deleted_features_are_paged_and_clamped(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = make_waterway(&app, "Inn").await;
    let s = make_section(&app, w, "Upper", json!([])).await["id"]
        .as_i64()
        .unwrap();
    let mut ids = Vec::new();
    for i in 0..3 {
        let f = make_feature(&app, w, s, &format!("F{i}")).await;
        delete_feature(&app, w, s, f, Who::Admin).await;
        ids.push(f);
    }
    let base = format!("/waterways/{w}/sections/{s}/deleted-features");

    let p1 = get(&app, &format!("{base}?per_page=2")).await;
    assert_eq!(p1.body["total"], 3);
    assert_eq!(p1.body["total_pages"], 2);
    // Newest deletion first.
    assert_eq!(feature_ids(&p1.body), [ids[2], ids[1]]);
    let p2 = get(&app, &format!("{base}?per_page=2&page=2")).await;
    assert_eq!(feature_ids(&p2.body), [ids[0]]);
    let beyond = get(&app, &format!("{base}?per_page=2&page=9")).await;
    assert_eq!(beyond.status, StatusCode::OK);
    assert!(beyond.body["items"].as_array().unwrap().is_empty());
    let big = get(&app, &format!("{base}?per_page=100000")).await;
    assert_eq!(big.body["per_page"], 100);
    let zero = get(&app, &format!("{base}?per_page=0&page=0")).await;
    assert_eq!(zero.body["per_page"], 1);
    assert_eq!(zero.body["page"], 1);
}
