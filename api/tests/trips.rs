//! The trips API end to end: the real routers behind the real API-key layer,
//! each test on a fresh database that `sqlx::test` builds from the migrations.
//!
//! These pin the rules the route layer and the schema enforce between them -
//! who may see and change what, and the invariants a trip keeps - because
//! every one of them once held only by convention and broke silently.

use std::sync::Arc;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{HeaderMap, Method, Request, StatusCode, header},
    middleware,
};
use moka::future::Cache;
use paddlemate_api::{
    layers::auth::{api_token_auth, api_token_auth_optional},
    query::tokens::hash_token,
    routes::{descents::descents_routes, trips::trips_routes, users::users_routes},
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

/// The trips and descents routers wired the way `main` wires them, minus
/// Keycloak: requests authenticate with API keys, which the same optional
/// layer accepts.
fn app(pool: PgPool) -> Router {
    router(state(pool))
}

fn router(state: AppState) -> Router {
    let mut api = OpenApi::default();
    // `/users` needs a caller, the rest takes one if given - as in `main`.
    let protected = ApiRouter::new()
        .nest_api_service("/users", users_routes(state.clone()))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            api_token_auth,
        ));
    ApiRouter::new()
        .nest_api_service("/trips", trips_routes(state.clone()))
        .nest_api_service("/descents", descents_routes(state.clone()))
        .layer(middleware::from_fn_with_state(
            state,
            api_token_auth_optional,
        ))
        .merge(protected)
        .finish_api(&mut api)
}

/// A user and their API key. The key is `pm_<name>`, so a test names the
/// caller rather than juggling tokens.
async fn user(pool: &PgPool, name: &str) -> String {
    let id = format!("user-{name}");
    sqlx::query("INSERT INTO users (id, username) VALUES ($1, $2)")
        .bind(&id)
        .bind(name)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO api_tokens (user_id, name, token_hash) VALUES ($1, 'test', $2)")
        .bind(&id)
        .bind(hash_token(&format!("pm_{name}")))
        .execute(pool)
        .await
        .unwrap();
    id
}

struct Reply {
    status: StatusCode,
    headers: HeaderMap,
    body: Value,
}

async fn call(
    app: &Router,
    method: Method,
    uri: &str,
    who: Option<&str>,
    body: Option<Value>,
    if_match: Option<&str>,
) -> Reply {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(name) = who {
        req = req.header("X-Api-Key", format!("pm_{name}"));
    }
    if let Some(tag) = if_match {
        req = req.header(header::IF_MATCH, tag);
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
    let headers = res.headers().clone();
    let bytes = to_bytes(res.into_body(), usize::MAX).await.unwrap();
    let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    Reply {
        status,
        headers,
        body,
    }
}

async fn get(app: &Router, uri: &str, who: &str) -> Reply {
    call(app, Method::GET, uri, Some(who), None, None).await
}

async fn send(app: &Router, method: Method, uri: &str, who: &str, body: Value) -> Reply {
    call(app, method, uri, Some(who), Some(body), None).await
}

/// A trip `admin` created, with `members` added and one stay.
/// Returns `(trip_id, stay_id)`.
async fn trip(app: &Router, pool: &PgPool, admin: &str, members: &[&str]) -> (i64, i64) {
    let r = send(
        app,
        Method::POST,
        "/trips",
        admin,
        json!({
            "name": "Test week",
            "start_date": "2026-09-09",
            "stay": { "kind": "camp", "name": "Base one" }
        }),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let trip_id = r.body["id"].as_i64().unwrap();
    for m in members {
        let r = send(
            app,
            Method::POST,
            &format!("/trips/{trip_id}/members"),
            admin,
            json!({ "user_id": format!("user-{m}") }),
        )
        .await;
        assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    }
    let stay_id: i64 = sqlx::query_scalar("SELECT id FROM trip_stays WHERE trip_id = $1")
        .bind(trip_id)
        .fetch_one(pool)
        .await
        .unwrap();
    (trip_id, stay_id)
}

async fn promote(app: &Router, trip_id: i64, admin: &str, who: &str) {
    let r = send(
        app,
        Method::PATCH,
        &format!("/trips/{trip_id}/members/user-{who}"),
        admin,
        json!({ "role": "admin" }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
}

async fn admins(pool: &PgPool, trip_id: i64) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM trip_members WHERE trip_id = $1 AND role = 'admin'")
        .bind(trip_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

/// Three sections on one river, for watch lists. Returns their ids.
async fn sections(pool: &PgPool) -> Vec<i64> {
    sqlx::query("INSERT INTO waterways (id, waterway_type, name) VALUES (1, 'river', 'River')")
        .execute(pool)
        .await
        .unwrap();
    let mut ids = vec![];
    for i in 0..3 {
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO water_sections (waterway_id, name, location) \
             VALUES (1, $1, ST_GeomFromText($2, 4326)) RETURNING id",
        )
        .bind(format!("Section {i}"))
        .bind(format!("LINESTRING(11.{i}0 47.0, 11.{i}1 47.01)"))
        .fetch_one(pool)
        .await
        .unwrap();
        ids.push(id);
    }
    ids
}

#[sqlx::test(migrations = "./migrations")]
async fn a_trip_is_private_to_its_members(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "bob").await;
    user(&pool, "eve").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &["bob"]).await;
    let uri = format!("/trips/{trip_id}");

    // Signed out is 401 everywhere, the listing included.
    let r = call(&app, Method::GET, "/trips", None, None, None).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    let r = call(&app, Method::GET, &uri, None, None, None).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);

    // An outsider cannot tell the trip exists: 404, the same as no trip.
    assert_eq!(get(&app, &uri, "eve").await.status, StatusCode::NOT_FOUND);
    assert_eq!(
        get(&app, "/trips/999999", "eve").await.status,
        StatusCode::NOT_FOUND
    );
    let r = get(&app, "/trips", "eve").await;
    assert_eq!(r.body["total"], 0);

    // A member sees it but may not change what it is: 403, not 404.
    assert_eq!(get(&app, &uri, "bob").await.status, StatusCode::OK);
    let r = send(&app, Method::PATCH, &uri, "bob", json!({ "name": "Mine" })).await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);

    let r = send(&app, Method::PATCH, &uri, "ann", json!({ "name": "Ours" })).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["name"], "Ours");
}

#[sqlx::test(migrations = "./migrations")]
async fn editing_your_own_row_needs_you_on_the_trip(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "eve").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &[]).await;

    let r = send(
        &app,
        Method::PATCH,
        &format!("/trips/{trip_id}/members/user-eve"),
        "eve",
        json!({ "arrival": "2026-09-10" }),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "./migrations")]
async fn the_last_admin_cannot_go(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "bob").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &["bob"]).await;

    let leave = format!("/trips/{trip_id}/members/user-ann");
    let r = call(&app, Method::DELETE, &leave, Some("ann"), None, None).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let r = send(
        &app,
        Method::PATCH,
        &leave,
        "ann",
        json!({ "role": "member" }),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(admins(&pool, trip_id).await, 1);
}

/// Two admins each doing the one thing that is fine alone - one demotes the
/// other, the other leaves - at the same moment. Both used to pass the
/// "at least one admin" check and both land, leaving nobody able to manage
/// the trip.
#[sqlx::test(migrations = "./migrations")]
async fn racing_admins_cannot_orphan_a_trip(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "bob").await;

    for _ in 0..8 {
        let (trip_id, _) = trip(&app, &pool, "ann", &["bob"]).await;
        promote(&app, trip_id, "ann", "bob").await;

        let bob_row = format!("/trips/{trip_id}/members/user-bob");
        let ann_row = format!("/trips/{trip_id}/members/user-ann");
        let demote = send(
            &app,
            Method::PATCH,
            &bob_row,
            "ann",
            json!({ "role": "member" }),
        );
        let leave = call(&app, Method::DELETE, &ann_row, Some("ann"), None, None);
        tokio::join!(demote, leave);

        assert_eq!(
            admins(&pool, trip_id).await,
            1,
            "trip {trip_id} lost its admins"
        );
    }
}

/// Two bases deleted at once: each delete alone leaves one, together they
/// used to leave none. Several rounds, because one can miss the window.
#[sqlx::test(migrations = "./migrations")]
async fn the_last_stay_cannot_go_even_racing(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;

    for _ in 0..8 {
        let (trip_id, first) = trip(&app, &pool, "ann", &[]).await;
        let r = send(
            &app,
            Method::POST,
            &format!("/trips/{trip_id}/stays"),
            "ann",
            json!({ "kind": "hotel", "name": "Base two" }),
        )
        .await;
        let second = r.body["id"].as_i64().unwrap();

        let first_uri = format!("/trips/{trip_id}/stays/{first}");
        let second_uri = format!("/trips/{trip_id}/stays/{second}");
        let (a, b) = tokio::join!(
            call(&app, Method::DELETE, &first_uri, Some("ann"), None, None),
            call(&app, Method::DELETE, &second_uri, Some("ann"), None, None),
        );

        let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM trip_stays WHERE trip_id = $1")
            .bind(trip_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(left, 1, "trip {trip_id} lost its last base");
        let mut got = [a.status, b.status];
        got.sort();
        assert_eq!(got, [StatusCode::NO_CONTENT, StatusCode::BAD_REQUEST]);
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn leaving_takes_your_votes_and_private_logs_with_you(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    let bob = user(&pool, "bob").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &["bob"]).await;

    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{trip_id}/candidates"),
        "ann",
        json!({ "kind": "camp", "name": "Riverside" }),
    )
    .await;
    let candidate = r.body["id"].as_i64().unwrap();
    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{trip_id}/candidates/{candidate}/vote"),
        "bob",
        json!({ "vote": -1 }),
    )
    .await;
    assert_eq!(r.body["downvotes"], 1);

    let log: i64 = sqlx::query_scalar(
        "INSERT INTO descents (user_id, start_time, end_time, visibility_scope, name, \
                              put_in_lat, put_in_lon, take_out_lat, take_out_lon, trip_id) \
         VALUES ($1, NOW(), NOW() + INTERVAL '1 hour', 'private', 'Scout', \
                 47.0, 11.0, 47.1, 11.1, $2) RETURNING id",
    )
    .bind(&bob)
    .bind(trip_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let logs = format!("/descents?trip_id={trip_id}");
    let seen = |r: &Reply| {
        r.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["id"] == log)
    };
    assert!(
        seen(&get(&app, &logs, "ann").await),
        "a member sees a trip log"
    );

    let r = call(
        &app,
        Method::DELETE,
        &format!("/trips/{trip_id}/members/user-bob"),
        Some("bob"),
        None,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);

    let r = get(
        &app,
        &format!("/trips/{trip_id}/candidates/{candidate}"),
        "ann",
    )
    .await;
    assert_eq!(
        r.body["downvotes"], 0,
        "an ex-member's vote no longer counts"
    );
    assert!(
        !seen(&get(&app, &logs, "ann").await),
        "a private log leaves the trip with its owner"
    );
    let kept: Option<i64> = sqlx::query_scalar("SELECT trip_id FROM descents WHERE id = $1")
        .bind(log)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(kept, None, "the log itself is kept, only unlinked");
}

/// Candidate ids are sequential, so every candidate route must look the id
/// up inside the trip it was reached through. These used to rename and
/// accept another trip's candidate.
#[sqlx::test(migrations = "./migrations")]
async fn candidates_cannot_be_reached_through_another_trip(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "eve").await;
    let (theirs, _) = trip(&app, &pool, "ann", &[]).await;
    let (mine, _) = trip(&app, &pool, "eve", &[]).await;

    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{theirs}/candidates"),
        "ann",
        json!({ "kind": "camp", "name": "Theirs" }),
    )
    .await;
    let c = r.body["id"].as_i64().unwrap();
    let via_mine = format!("/trips/{mine}/candidates/{c}");

    for (method, uri, body) in [
        (Method::GET, via_mine.clone(), None),
        (
            Method::PATCH,
            via_mine.clone(),
            Some(json!({ "name": "Hijacked" })),
        ),
        (
            Method::PATCH,
            via_mine.clone(),
            Some(json!({ "accepted": true })),
        ),
        (Method::DELETE, via_mine.clone(), None),
        (
            Method::POST,
            format!("{via_mine}/vote"),
            Some(json!({ "vote": 1 })),
        ),
    ] {
        let r = call(&app, method.clone(), &uri, Some("eve"), body, None).await;
        assert_eq!(r.status, StatusCode::NOT_FOUND, "{method} {uri}");
    }

    let r = get(&app, &format!("/trips/{theirs}/candidates/{c}"), "ann").await;
    assert_eq!(r.body["name"], "Theirs");
    assert_eq!(r.body["upvotes"], 1);
    let stays: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM trip_stays WHERE trip_id = $1")
        .bind(theirs)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stays, 1, "nothing was accepted into their trip");
}

#[sqlx::test(migrations = "./migrations")]
async fn bad_input_is_a_400_not_a_500(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    let (trip_id, stay_id) = trip(&app, &pool, "ann", &[]).await;
    let ids = sections(&pool).await;
    let watch = format!("/trips/{trip_id}/stays/{stay_id}/sections");

    let cases = [
        (
            Method::PUT,
            watch.clone(),
            json!({ "sections": [{ "section_id": 999999 }] }),
        ),
        (
            Method::PUT,
            watch.clone(),
            json!({ "sections": [{ "section_id": ids[0] }, { "section_id": ids[0] }] }),
        ),
        (
            Method::POST,
            format!("/trips/{trip_id}/members"),
            json!({ "user_id": "nobody" }),
        ),
        (
            Method::POST,
            format!("/trips/{trip_id}/candidates"),
            json!({ "kind": "camp", "name": "Line",
                    "location": { "type": "LineString", "coordinates": [[0, 0], [1, 1]] } }),
        ),
    ];
    for (method, uri, body) in cases {
        let r = send(&app, method.clone(), &uri, "ann", body).await;
        assert_eq!(
            r.status,
            StatusCode::BAD_REQUEST,
            "{method} {uri}: {}",
            r.body
        );
        assert_eq!(r.body["error"]["code"], "validation_failed");
    }
}

/// Reordering edits the list in place: an entry keeps its row, its status
/// and its note, where a rebuild would hand out new ids and reset them.
#[sqlx::test(migrations = "./migrations")]
async fn reordering_a_watch_list_keeps_each_entry(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    let (trip_id, stay_id) = trip(&app, &pool, "ann", &[]).await;
    let ids = sections(&pool).await;
    let watch = format!("/trips/{trip_id}/stays/{stay_id}/sections");

    let list = |order: &[i64]| json!({ "sections": order.iter().map(|id| json!({ "section_id": id })).collect::<Vec<_>>() });
    let r = send(&app, Method::PUT, &watch, "ann", list(&ids)).await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    let row = |body: &Value, section: i64| {
        body.as_array()
            .unwrap()
            .iter()
            .find(|s| s["section_id"] == section)
            .cloned()
            .unwrap()
    };
    let first_row = row(&r.body, ids[0])["id"].clone();

    sqlx::query("UPDATE trip_sections SET status = 'done', note = 'ran it' WHERE id = $1")
        .bind(first_row.as_i64().unwrap())
        .execute(&pool)
        .await
        .unwrap();

    let reversed: Vec<i64> = ids.iter().rev().copied().collect();
    let r = send(&app, Method::PUT, &watch, "ann", list(&reversed)).await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    let moved = row(&r.body, ids[0]);
    assert_eq!(moved["id"], first_row, "same row, not a new one");
    assert_eq!(moved["sort_order"], 3);
    assert_eq!(moved["status"], "done");
    assert_eq!(moved["note"], "ran it");

    // Dropping an entry removes only that one.
    let r = send(&app, Method::PUT, &watch, "ann", list(&reversed[..2])).await;
    assert_eq!(r.body.as_array().unwrap().len(), 2);
}

#[sqlx::test(migrations = "./migrations")]
async fn a_stale_edit_is_refused_not_applied(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    let (trip_id, stay_id) = trip(&app, &pool, "ann", &[]).await;
    let uri = format!("/trips/{trip_id}/stays/{stay_id}");

    let r = get(&app, &uri, "ann").await;
    let tag = r.headers[header::ETAG].to_str().unwrap().to_string();
    assert_eq!(
        tag,
        format!("\"{}\"", r.body["updated_at"].as_str().unwrap()),
        "the ETag is updated_at, quoted, so a list item carries its own"
    );

    let edit = |name: &str, tag: Option<String>| {
        let app = app.clone();
        let uri = uri.clone();
        let body = json!({ "name": name });
        async move {
            call(
                &app,
                Method::PATCH,
                &uri,
                Some("ann"),
                Some(body),
                tag.as_deref(),
            )
            .await
        }
    };
    assert_eq!(
        edit("First", Some(tag.clone())).await.status,
        StatusCode::OK
    );
    let r = edit("Second", Some(tag.clone())).await;
    assert_eq!(r.status, StatusCode::PRECONDITION_FAILED);
    assert_eq!(get(&app, &uri, "ann").await.body["name"], "First");

    // Without a version the write goes through, as it always did.
    assert_eq!(edit("Third", None).await.status, StatusCode::OK);
    assert_eq!(
        edit("x", Some("nonsense".into())).await.status,
        StatusCode::BAD_REQUEST
    );
}

/// A private log of a member's, linked to the trip. Returns its id.
async fn trip_log(pool: &PgPool, owner: &str, trip_id: i64, visibility: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO descents (user_id, start_time, end_time, visibility_scope, name, \
                              put_in_lat, put_in_lon, take_out_lat, take_out_lon, trip_id) \
         VALUES ($1, NOW(), NOW() + INTERVAL '1 hour', $3::visibility_scope, 'Run', \
                 47.0, 11.0, 47.1, 11.1, $2) RETURNING id",
    )
    .bind(owner)
    .bind(trip_id)
    .bind(visibility)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// A log listed in the trip must also open for the trip: it used to answer
/// "not found", and copying it opened an empty form.
#[sqlx::test(migrations = "./migrations")]
async fn a_trip_log_opens_for_the_trip_and_nobody_else(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    let bob = user(&pool, "bob").await;
    user(&pool, "eve").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &["bob"]).await;
    let log = trip_log(&pool, &bob, trip_id, "private").await;
    let uri = format!("/descents/{log}");

    let r = get(&app, &uri, "ann").await;
    assert_eq!(r.status, StatusCode::OK, "a trip member opens it");
    assert_eq!(r.body["trip_id"], trip_id);
    assert_eq!(get(&app, &uri, "eve").await.status, StatusCode::NOT_FOUND);
}

/// Which trip a log belongs to is as private as the trip itself.
#[sqlx::test(migrations = "./migrations")]
async fn a_public_log_does_not_reveal_its_trip(pool: PgPool) {
    let app = app(pool.clone());
    let ann = user(&pool, "ann").await;
    user(&pool, "eve").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &[]).await;
    let log = trip_log(&pool, &ann, trip_id, "public").await;

    let r = get(&app, &format!("/descents/{log}"), "eve").await;
    assert_eq!(r.status, StatusCode::OK);
    assert!(r.body["trip_id"].is_null(), "an outsider sees no trip id");
    let r = get(&app, "/descents", "eve").await;
    let listed = r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["id"] == log)
        .unwrap();
    assert!(listed["trip_id"].is_null(), "nor in the list");
    let r = call(
        &app,
        Method::GET,
        &format!("/descents/{log}"),
        None,
        None,
        None,
    )
    .await;
    assert!(r.body["trip_id"].is_null(), "nor signed out");

    let r = get(&app, &format!("/descents/{log}"), "ann").await;
    assert_eq!(
        r.body["trip_id"], trip_id,
        "the owner, on the trip, still does"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn names_must_say_something_and_fit(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    let (trip_id, stay_id) = trip(&app, &pool, "ann", &[]).await;
    let long = "x".repeat(256);

    let cases = [
        (
            Method::POST,
            "/trips".to_string(),
            json!({ "name": "  ", "start_date": "2026-09-09", "stay": { "kind": "camp", "name": "a" } }),
        ),
        (
            Method::POST,
            "/trips".to_string(),
            json!({ "name": long, "start_date": "2026-09-09", "stay": { "kind": "camp", "name": "a" } }),
        ),
        (
            Method::POST,
            "/trips".to_string(),
            json!({ "name": "ok", "start_date": "2026-09-09", "stay": { "kind": "camp", "name": "" } }),
        ),
        (
            Method::PATCH,
            format!("/trips/{trip_id}"),
            json!({ "name": long }),
        ),
        (
            Method::POST,
            format!("/trips/{trip_id}/stays"),
            json!({ "kind": "camp", "name": " " }),
        ),
        (
            Method::PATCH,
            format!("/trips/{trip_id}/stays/{stay_id}"),
            json!({ "name": long }),
        ),
        (
            Method::POST,
            format!("/trips/{trip_id}/candidates"),
            json!({ "kind": "camp", "name": long }),
        ),
    ];
    for (method, uri, body) in cases {
        let r = send(&app, method.clone(), &uri, "ann", body).await;
        assert_eq!(
            r.status,
            StatusCode::BAD_REQUEST,
            "{method} {uri}: {}",
            r.body
        );
    }
    // Exactly at the limit is fine: the column holds 255 characters.
    let r = send(
        &app,
        Method::PATCH,
        &format!("/trips/{trip_id}"),
        "ann",
        json!({ "name": "y".repeat(255) }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
}

/// `{"lat": 47.1, "lon": null}` is half a point. It used to pass the check
/// and quietly clear the location.
#[sqlx::test(migrations = "./migrations")]
async fn half_a_location_is_refused(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    let (trip_id, stay_id) = trip(&app, &pool, "ann", &[]).await;
    let uri = format!("/trips/{trip_id}/stays/{stay_id}");

    let r = send(
        &app,
        Method::PATCH,
        &uri,
        "ann",
        json!({ "lat": 47.1, "lon": 11.1 }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    let r = send(
        &app,
        Method::PATCH,
        &uri,
        "ann",
        json!({ "lat": 47.2, "lon": null }),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert!(
        get(&app, &uri, "ann").await.body["location"].is_object(),
        "the point survives"
    );

    // Clearing both halves together is how a location is removed.
    let r = send(
        &app,
        Method::PATCH,
        &uri,
        "ann",
        json!({ "lat": null, "lon": null }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    assert!(r.body["location"].is_null());
}

async fn invite(app: &Router, trip_id: i64, admin: &str) -> (i64, String) {
    let r = send(
        app,
        Method::POST,
        &format!("/trips/{trip_id}/invites"),
        admin,
        json!({}),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    (
        r.body["id"].as_i64().unwrap(),
        r.body["token"].as_str().unwrap().to_string(),
    )
}

/// The whole point: somebody who is on no trip, holding the link, joins -
/// and seeing it first needs no account.
#[sqlx::test(migrations = "./migrations")]
async fn an_invite_link_lets_a_newcomer_join(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "eve").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &[]).await;
    let (_, token) = invite(&app, trip_id, "ann").await;
    let preview = format!("/trips/invites/{token}");

    let r = call(&app, Method::GET, &preview, None, None, None).await;
    assert_eq!(r.status, StatusCode::OK, "readable signed out");
    assert_eq!(r.body["name"], "Test week");
    assert_eq!(r.body["invited_by"], "ann");
    assert_eq!(r.body["trip_id"], trip_id);
    assert_eq!(r.body["viewer_is_member"], false);

    let join = format!("/trips/{trip_id}/members");
    let r = send(&app, Method::POST, &join, "eve", json!({ "invite": token })).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    assert_eq!(r.body["user_id"], "user-eve");
    assert_eq!(
        r.body["role"], "member",
        "a link makes members, never admins"
    );
    assert_eq!(
        get(&app, &format!("/trips/{trip_id}"), "eve").await.status,
        StatusCode::OK
    );

    // Joining again is harmless and is not another use.
    let r = send(&app, Method::POST, &join, "eve", json!({ "invite": token })).await;
    assert_eq!(r.status, StatusCode::CREATED);
    let r = get(&app, &format!("/trips/{trip_id}/invites"), "ann").await;
    assert_eq!(r.body[0]["uses"], 1);
    assert!(
        r.body[0].get("token").is_none(),
        "a listed link never carries its token"
    );
    assert_eq!(
        get(&app, &preview, "eve").await.body["viewer_is_member"],
        true
    );

    let stored: String = sqlx::query_scalar("SELECT token_hash FROM trip_invites")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_ne!(stored, token, "only a hash of the token is kept");
}

#[sqlx::test(migrations = "./migrations")]
async fn an_invite_opens_its_own_trip_and_only_admins_make_one(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "bob").await;
    user(&pool, "eve").await;
    let (theirs, _) = trip(&app, &pool, "ann", &["bob"]).await;
    let (other, _) = trip(&app, &pool, "eve", &[]).await;
    let (_, token) = invite(&app, theirs, "ann").await;

    // A member who is not an admin cannot make or see links; an outsider
    // cannot even tell the trip exists.
    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{theirs}/invites"),
        "bob",
        json!({}),
    )
    .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    assert_eq!(
        get(&app, &format!("/trips/{theirs}/invites"), "eve")
            .await
            .status,
        StatusCode::NOT_FOUND
    );

    // A link for one trip is no key to another, and a made-up one is nothing.
    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{other}/members"),
        "bob",
        json!({ "invite": token }),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{theirs}/members"),
        "eve",
        json!({ "invite": "0".repeat(64) }),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let r = call(
        &app,
        Method::GET,
        "/trips/invites/nonsense",
        None,
        None,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    // Exactly one way in per request.
    for body in [json!({}), json!({ "user_id": "user-eve", "invite": token })] {
        let r = send(
            &app,
            Method::POST,
            &format!("/trips/{theirs}/members"),
            "ann",
            body,
        )
        .await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST);
    }
    for days in [0, 31] {
        let r = send(
            &app,
            Method::POST,
            &format!("/trips/{theirs}/invites"),
            "ann",
            json!({ "expires_in_days": days }),
        )
        .await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{days} days");
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn a_withdrawn_or_expired_link_is_dead(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "eve").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &[]).await;
    let join = format!("/trips/{trip_id}/members");

    let (id, withdrawn) = invite(&app, trip_id, "ann").await;
    let r = call(
        &app,
        Method::DELETE,
        &format!("/trips/{trip_id}/invites/{id}"),
        Some("ann"),
        None,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);

    let (id, expired) = invite(&app, trip_id, "ann").await;
    sqlx::query(
        "UPDATE trip_invites SET created_at = NOW() - INTERVAL '2 days', \
                                 expires_at = NOW() - INTERVAL '1 day' WHERE id = $1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();

    for token in [withdrawn, expired] {
        let r = call(
            &app,
            Method::GET,
            &format!("/trips/invites/{token}"),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(r.status, StatusCode::NOT_FOUND);
        let r = send(&app, Method::POST, &join, "eve", json!({ "invite": token })).await;
        assert_eq!(r.status, StatusCode::NOT_FOUND);
    }
    let r = get(&app, &format!("/trips/{trip_id}/invites"), "ann").await;
    assert_eq!(
        r.body.as_array().unwrap().len(),
        0,
        "neither is listed as working"
    );
}

/// The kinds under `who`'s bell, newest first.
async fn bell(app: &Router, who: &str) -> Vec<String> {
    let r = get(app, "/users/me/notifications", who).await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["kind"].as_str().unwrap().to_string())
        .collect()
}

async fn unread(app: &Router, who: &str) -> i64 {
    let r = get(app, "/users/me/notification-state", who).await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    r.body["unread_count"].as_i64().unwrap()
}

async fn add_stay(app: &Router, trip_id: i64, who: &str, name: &str) {
    let r = send(
        app,
        Method::POST,
        &format!("/trips/{trip_id}/stays"),
        who,
        json!({ "kind": "camp", "name": name }),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
}

#[sqlx::test(migrations = "./migrations")]
async fn a_change_reaches_everyone_else_on_the_trip(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "bob").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &["bob"]).await;
    add_stay(&app, trip_id, "ann", "Base two").await;

    assert_eq!(bell(&app, "bob").await, ["stay_added", "member_joined"]);
    let r = get(&app, "/users/me/notifications", "bob").await;
    assert_eq!(r.body["items"][0]["text"], "ann added Base two");
    assert_eq!(r.body["items"][1]["text"], "ann added bob");
    assert!(
        bell(&app, "ann").await.is_empty(),
        "nobody hears about their own change"
    );
    assert_eq!(unread(&app, "bob").await, 2);

    let r = send(
        &app,
        Method::PUT,
        "/users/me/notification-state",
        "bob",
        json!({ "read_until": chrono::Utc::now() }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["unread_count"], 0);
    assert_eq!(bell(&app, "bob").await.len(), 2, "read changes stay listed");

    // Moving the mark back does not bring them back.
    let r = send(
        &app,
        Method::PUT,
        "/users/me/notification-state",
        "bob",
        json!({ "read_until": "2000-01-01T00:00:00Z" }),
    )
    .await;
    assert_eq!(r.body["unread_count"], 0);
}

/// A week of voting would bury everything else: votes only refresh live.
#[sqlx::test(migrations = "./migrations")]
async fn votes_stay_out_of_the_bell(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "bob").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &["bob"]).await;
    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{trip_id}/candidates"),
        "ann",
        json!({ "kind": "camp", "name": "Riverside" }),
    )
    .await;
    let candidate = r.body["id"].as_i64().unwrap();
    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{trip_id}/candidates/{candidate}/vote"),
        "bob",
        json!({ "vote": 1 }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);

    let recorded: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM trip_events WHERE kind = 'candidate_voted'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(recorded, 1, "the vote is recorded for live refresh");
    assert!(bell(&app, "ann").await.is_empty());
}

/// Joining does not hand you the trip's history, and leaving takes it away.
#[sqlx::test(migrations = "./migrations")]
async fn the_bell_covers_your_trips_since_you_joined(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "eve").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &[]).await;
    add_stay(&app, trip_id, "ann", "Before").await;
    let (_, token) = invite(&app, trip_id, "ann").await;
    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{trip_id}/members"),
        "eve",
        json!({ "invite": token }),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    add_stay(&app, trip_id, "ann", "After").await;

    let r = get(&app, "/users/me/notifications", "eve").await;
    let names: Vec<_> = r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["summary"]["name"].clone())
        .collect();
    assert_eq!(names, [json!("After")]);
    assert_eq!(
        bell(&app, "ann").await,
        ["member_joined"],
        "ann hears eve join"
    );

    let r = call(
        &app,
        Method::DELETE,
        &format!("/trips/{trip_id}/members/user-eve"),
        Some("eve"),
        None,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    assert!(bell(&app, "eve").await.is_empty());
    assert_eq!(unread(&app, "eve").await, 0);
}

/// Saving a log again must not announce it again.
#[sqlx::test(migrations = "./migrations")]
async fn a_log_is_announced_once(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "bob").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &["bob"]).await;
    let log = trip_log(&pool, "user-bob", trip_id, "private").await;
    sqlx::query("UPDATE descents SET trip_id = NULL WHERE id = $1")
        .bind(log)
        .execute(&pool)
        .await
        .unwrap();

    let uri = format!("/descents/{log}");
    for body in [
        json!({ "trip_id": trip_id }),
        json!({ "trip_id": trip_id, "name": "Renamed" }),
        json!({ "name": "Again" }),
    ] {
        let r = send(&app, Method::PATCH, &uri, "bob", body).await;
        assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    }
    let announced = bell(&app, "ann").await;
    assert_eq!(
        announced.iter().filter(|k| *k == "log_linked").count(),
        1,
        "{announced:?}"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn push_is_refused_when_the_server_does_not_send_it(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    let r = send(
        &app,
        Method::POST,
        "/users/me/push-subscriptions",
        "ann",
        json!({ "endpoint": "https://push.example/abc", "keys": { "p256dh": "k", "auth": "a" } }),
    )
    .await;
    assert_eq!(r.status, StatusCode::CONFLICT, "{}", r.body);
    let r = get(&app, "/users/me/notification-state", "ann").await;
    assert!(r.body.get("push_public_key").is_none());
}

/// Waits until the live-events listener of this test's database is
/// LISTENing, so a change made next is heard.
async fn listening(pool: &PgPool) {
    for _ in 0..100 {
        let n: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_stat_activity \
             WHERE datname = current_database() AND query LIKE 'LISTEN%'",
        )
        .fetch_one(pool)
        .await
        .unwrap();
        if n > 0 {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    panic!("the live-events listener never started");
}

/// Opens `who`'s live stream.
async fn live(
    app: &Router,
    who: &str,
) -> impl futures_util::Stream<Item = Result<axum::body::Bytes, axum::Error>> {
    let req = Request::builder()
        .uri("/users/me/events")
        .header("X-Api-Key", format!("pm_{who}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    res.into_body().into_data_stream()
}

/// The stream's text until it mentions `until`, or everything said within
/// a second.
async fn read_until(
    stream: &mut (impl futures_util::Stream<Item = Result<axum::body::Bytes, axum::Error>> + Unpin),
    until: &str,
) -> String {
    use futures_util::StreamExt;
    let mut text = String::new();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(1);
    while !text.contains(until) {
        match tokio::time::timeout_at(deadline, stream.next()).await {
            Ok(Some(Ok(chunk))) => text.push_str(&String::from_utf8_lossy(&chunk)),
            _ => break,
        }
    }
    text
}

/// Someone not on the trip hears nothing about it, even with a stream open.
#[sqlx::test(migrations = "./migrations")]
async fn the_live_stream_tells_members_only(pool: PgPool) {
    // Only this test listens: a listener holds a connection for good, and
    // the tests share one small pool of them.
    let state = state(pool.clone());
    tokio::spawn(paddlemate_api::notify::run_listener(
        pool.clone(),
        state.live_events.clone(),
    ));
    let app = router(state);
    user(&pool, "ann").await;
    user(&pool, "bob").await;
    user(&pool, "eve").await;
    let (trip_id, _) = trip(&app, &pool, "ann", &["bob"]).await;
    listening(&pool).await;

    let mut bob = Box::pin(live(&app, "bob").await);
    let mut eve = Box::pin(live(&app, "eve").await);
    assert!(
        read_until(&mut bob, "event: connected")
            .await
            .contains("connected")
    );
    assert!(
        read_until(&mut eve, "event: connected")
            .await
            .contains("connected")
    );

    add_stay(&app, trip_id, "ann", "Base two").await;

    let heard = read_until(&mut bob, "stay_added").await;
    assert!(heard.contains("event: trip_event"), "{heard}");
    assert!(heard.contains(&format!("\"trip_id\":{trip_id}")), "{heard}");
    let heard = read_until(&mut eve, "trip_event").await;
    assert!(!heard.contains("trip_event"), "{heard}");

    // Membership is re-read as it changes: eve added hears from then on,
    // bob removed stops.
    let r = send(
        &app,
        Method::POST,
        &format!("/trips/{trip_id}/members"),
        "ann",
        json!({ "user_id": "user-eve" }),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let r = call(
        &app,
        Method::DELETE,
        &format!("/trips/{trip_id}/members/user-bob"),
        Some("ann"),
        None,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    add_stay(&app, trip_id, "ann", "Base three").await;

    let heard = read_until(&mut eve, "stay_added").await;
    assert!(
        heard.contains("stay_added"),
        "eve hears once added: {heard}"
    );
    let heard = read_until(&mut bob, "stay_added").await;
    assert!(
        !heard.contains("stay_added"),
        "bob stops once removed: {heard}"
    );
}

/// A key for tests only, so a test server can say it sends push.
const TEST_VAPID_KEY: &str = "AAWRSCTDt-fpNqlPTL2amTYcdxF1XZ_qMiBU9jcfdHI";

fn app_with_push(pool: PgPool) -> Router {
    let mut state = state(pool);
    state.push = paddlemate_api::notify::push::PushService::new(
        TEST_VAPID_KEY,
        "mailto:test@example.com".into(),
    )
    .map(Arc::new);
    assert!(state.push.is_some());
    router(state)
}

/// A browser subscription's JSON, with keys of the right shape.
fn subscription(endpoint: &str) -> Value {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    json!({
        "endpoint": endpoint,
        "keys": { "p256dh": b64.encode([4u8; 65]), "auth": b64.encode([7u8; 16]) }
    })
}

/// The server POSTs to whatever endpoint it stores, so only push services'
/// URLs are taken, and one account holds a bounded number of them.
#[sqlx::test(migrations = "./migrations")]
async fn push_goes_only_to_push_services_and_only_so_many(pool: PgPool) {
    let app = app_with_push(pool.clone());
    user(&pool, "ann").await;
    let subscribe = |body: Value| {
        send(
            &app,
            Method::POST,
            "/users/me/push-subscriptions",
            "ann",
            body,
        )
    };

    for endpoint in [
        "https://192.168.1.1/cgi-bin/reboot",
        "https://localhost/x",
        "http://fcm.googleapis.com/fcm/send/x",
        "https://fcm.googleapis.com.attacker.example/x",
    ] {
        let r = subscribe(subscription(endpoint)).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{endpoint}: {}", r.body);
    }
    let mut bad_keys = subscription("https://fcm.googleapis.com/fcm/send/x");
    bad_keys["keys"]["p256dh"] = json!("k");
    assert_eq!(subscribe(bad_keys).await.status, StatusCode::BAD_REQUEST);

    for i in 0..12 {
        let r = subscribe(subscription(&format!(
            "https://fcm.googleapis.com/fcm/send/{i}"
        )))
        .await;
        assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    }
    let r = get(&app, "/users/me/push-subscriptions", "ann").await;
    let endpoints: Vec<_> = r
        .body
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["endpoint"].clone())
        .collect();
    assert_eq!(endpoints.len(), 10, "the oldest make way");
    assert!(!endpoints.contains(&json!("https://fcm.googleapis.com/fcm/send/0")));
    assert!(endpoints.contains(&json!("https://fcm.googleapis.com/fcm/send/11")));
}

/// Each open stream is a connection the server holds; one account holds a
/// bounded number, and closing one frees its place.
#[sqlx::test(migrations = "./migrations")]
async fn live_streams_are_capped_per_user(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    user(&pool, "bob").await;
    let mut open = vec![];
    for _ in 0..paddlemate_api::notify::MAX_STREAMS_PER_USER {
        open.push(live(&app, "ann").await);
    }
    // The status only: an accepted stream's body never ends.
    let over = Request::builder()
        .uri("/users/me/events")
        .header("X-Api-Key", "pm_ann")
        .body(Body::empty())
        .unwrap();
    let over = app.clone().oneshot(over).await.unwrap();
    assert_eq!(over.status(), StatusCode::TOO_MANY_REQUESTS);
    let _bob = live(&app, "bob").await;

    drop(open.pop());
    let _again = live(&app, "ann").await;
}

/// A page past any real list must not overflow into a server error.
#[sqlx::test(migrations = "./migrations")]
async fn absurd_pages_are_empty_not_errors(pool: PgPool) {
    let app = app(pool.clone());
    user(&pool, "ann").await;
    for uri in [
        "/users/me/notifications?page=9223372036854775807",
        "/descents?page=9223372036854775807&per_page=100",
        "/trips?page=9223372036854775807&per_page=100",
    ] {
        let r = get(&app, uri, "ann").await;
        assert_eq!(r.status, StatusCode::OK, "{uri}: {}", r.body);
    }
}
