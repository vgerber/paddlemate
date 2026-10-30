//! The descents (logs) API: validation, the owner-only writes and who can see
//! a log as private, shared or public, including the `user_id` filter.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, add_user, call, fake_auth, state};
use paddlemate_api::routes::{
    descents::descents_routes, groups::group_routes, waterways::waterways_routes,
};
use serde_json::{Value, json};
use sqlx::PgPool;

const MARA: Who = Who::User("mara-1");
const JON: Who = Who::User("jon-1");
const EVA: Who = Who::User("eva-1");

struct Env {
    pool: PgPool,
    app: Router,
    section: i64,
}

async fn env(pool: PgPool) -> Env {
    for (id, name) in [
        (common::ADMIN, "root"),
        ("mara-1", "mara"),
        ("jon-1", "jon"),
        ("eva-1", "eva"),
    ] {
        add_user(&pool, id, name).await;
    }
    let state = state(pool.clone());
    let mut api = OpenApi::default();
    let app = ApiRouter::new()
        .nest_api_service("/waterways", waterways_routes(state.clone()))
        .nest_api_service("/descents", descents_routes(state.clone()))
        .nest_api_service("/groups", group_routes(state))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api);
    let w = call(
        &app,
        Method::POST,
        "/waterways",
        Who::Admin,
        Some(json!({ "name": "Inn" })),
    )
    .await;
    let w = w.body["id"].as_i64().unwrap();
    let s = call(
        &app,
        Method::POST,
        &format!("/waterways/{w}/sections"),
        Who::Admin,
        Some(json!({
            "name": "Upper",
            "country": "AT",
            "location": { "type": "LineString", "coordinates": [[10.0, 47.0], [10.1, 47.1]] }
        })),
    )
    .await;
    assert!(s.status.is_success(), "{}", s.body);
    Env {
        pool,
        app,
        section: s.body["id"].as_i64().unwrap(),
    }
}

impl Env {
    fn body(&self, visibility: Value) -> Value {
        json!({
            "start_time": "2026-05-01T09:00:00Z",
            "end_time": "2026-05-01T12:00:00Z",
            "name": "Morning run",
            "put_in_lat": 47.0,
            "put_in_lon": 10.0,
            "take_out_lat": 47.1,
            "take_out_lon": 10.1,
            "visibility": visibility,
            "sections": [{ "section_id": self.section, "sort_order": 1 }]
        })
    }

    async fn log(&self, who: Who, visibility: Value) -> i64 {
        self.log_with(who, visibility, json!({})).await
    }

    async fn log_with(&self, who: Who, visibility: Value, extra: Value) -> i64 {
        let mut body = self.body(visibility);
        for (k, v) in extra.as_object().unwrap() {
            body[k] = v.clone();
        }
        let r = call(&self.app, Method::POST, "/descents", who, Some(body)).await;
        assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
        r.body["id"].as_i64().unwrap()
    }

    async fn list(&self, who: Who, query: &str) -> common::Reply {
        call(
            &self.app,
            Method::GET,
            &format!("/descents{query}"),
            who,
            None,
        )
        .await
    }

    async fn ids(&self, who: Who, query: &str) -> Vec<i64> {
        let r = self.list(who, query).await;
        assert_eq!(r.status, StatusCode::OK, "{}", r.body);
        let mut ids: Vec<i64> = r.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| d["id"].as_i64().unwrap())
            .collect();
        ids.sort();
        ids
    }

    async fn can_open(&self, who: Who, id: i64) -> bool {
        let r = call(
            &self.app,
            Method::GET,
            &format!("/descents/{id}"),
            who,
            None,
        )
        .await;
        match r.status {
            StatusCode::OK => true,
            StatusCode::NOT_FOUND => false,
            other => panic!("unexpected {other}"),
        }
    }
}

fn private() -> Value {
    json!({ "type": "private" })
}

fn public() -> Value {
    json!({ "type": "public" })
}

#[sqlx::test]
async fn a_log_is_returned_in_the_shape_the_app_reads(pool: PgPool) {
    let e = env(pool).await;
    let r = call(
        &e.app,
        Method::POST,
        "/descents",
        MARA,
        Some(e.body(private())),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let d = &r.body;
    assert_eq!(d["user_id"], "mara-1");
    assert_eq!(d["username"], "mara");
    assert_eq!(d["name"], "Morning run");
    assert_eq!(d["start_time"], "2026-05-01T09:00:00Z");
    assert_eq!(d["put_in_lat"], 47.0);
    assert_eq!(d["take_out_lon"], 10.1);
    assert_eq!(d["visibility"], json!({ "type": "private" }));
    let sections = d["sections"].as_array().unwrap();
    assert_eq!(sections.len(), 1);
    assert_eq!(sections[0]["section_id"], e.section);
    assert_eq!(sections[0]["sort_order"], 1);
    assert_eq!(sections[0]["section_name"], "Upper");
    assert_eq!(sections[0]["waterway_name"], "Inn");
    assert!(d["created_at"].is_string() && d["updated_at"].is_string());
    for absent in [
        "note",
        "put_in_feature_id",
        "put_in_label",
        "trip_id",
        "visible_from",
    ] {
        assert!(d.get(absent).is_none(), "{absent} is omitted when empty");
    }

    let id = d["id"].as_i64().unwrap();
    let got = call(&e.app, Method::GET, &format!("/descents/{id}"), MARA, None).await;
    assert_eq!(got.status, StatusCode::OK);
    assert_eq!(got.body["id"], id);
    assert_eq!(got.body["username"], "mara");
    assert_eq!(got.body["sections"][0]["section_name"], "Upper");
}

#[sqlx::test]
async fn writes_need_a_caller(pool: PgPool) {
    let e = env(pool).await;
    let id = e.log(MARA, public()).await;
    let r = call(
        &e.app,
        Method::POST,
        "/descents",
        Who::Anyone,
        Some(e.body(public())),
    )
    .await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    let r = call(
        &e.app,
        Method::PATCH,
        &format!("/descents/{id}"),
        Who::Anyone,
        Some(json!({ "name": "x" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    let r = call(
        &e.app,
        Method::DELETE,
        &format!("/descents/{id}"),
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    assert_eq!(
        e.list(Who::Anyone, "?scope=owned").await.status,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        e.list(Who::Anyone, "?scope=following").await.status,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test]
async fn create_validation(pool: PgPool) {
    let e = env(pool).await;
    let cases: Vec<(&str, Value)> = vec![
        (
            "end before start",
            json!({ "end_time": "2026-05-01T08:00:00Z" }),
        ),
        (
            "no put-in",
            json!({ "put_in_lat": null, "put_in_lon": null }),
        ),
        ("latitude only", json!({ "put_in_lon": null })),
        ("feature and coordinates", json!({ "put_in_feature_id": 1 })),
        (
            "no take-out",
            json!({ "take_out_lat": null, "take_out_lon": null }),
        ),
        ("latitude out of range", json!({ "put_in_lat": 91.0 })),
        ("longitude out of range", json!({ "take_out_lon": -181.0 })),
        ("name too long", json!({ "name": "n".repeat(256) })),
        ("note too long", json!({ "note": "n".repeat(10_001) })),
        ("label too long", json!({ "put_in_label": "l".repeat(256) })),
        (
            "empty shared audience",
            json!({ "visibility": { "type": "shared", "users": [], "groups": [] } }),
        ),
        (
            "unknown section",
            json!({ "sections": [{ "section_id": 999999, "sort_order": 1 }] }),
        ),
        (
            "section order below 1",
            json!({ "sections": [{ "section_id": 1, "sort_order": 0 }] }),
        ),
        (
            "unknown put-in feature",
            json!({ "put_in_feature_id": 999999, "put_in_lat": null, "put_in_lon": null }),
        ),
    ];
    for (what, patch) in cases {
        let mut body = e.body(private());
        for (k, v) in patch.as_object().unwrap() {
            body[k] = v.clone();
        }
        let r = call(&e.app, Method::POST, "/descents", MARA, Some(body)).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{what}: {}", r.body);
        assert!(r.body["error"]["message"].is_string(), "{what}");
        if what == "section order below 1" {
            assert_eq!(r.body["error"]["target"], "sections.sort_order");
        }
    }

    let r = call(
        &e.app,
        Method::POST,
        "/descents",
        MARA,
        Some(json!({ "name": "x" })),
    )
    .await;
    assert!(r.status.is_client_error(), "a body missing required fields");

    // The field a text limit applies to is named.
    let mut body = e.body(private());
    body["name"] = json!("n".repeat(256));
    let r = call(&e.app, Method::POST, "/descents", MARA, Some(body)).await;
    assert_eq!(r.body["error"]["target"], "name");

    // Exactly at the limit is accepted.
    let mut body = e.body(private());
    body["name"] = json!("n".repeat(255));
    assert_eq!(
        call(&e.app, Method::POST, "/descents", MARA, Some(body))
            .await
            .status,
        StatusCode::CREATED
    );

    // Linking a trip the caller is not in.
    let mut body = e.body(private());
    body["trip_id"] = json!(999999);
    let r = call(&e.app, Method::POST, "/descents", MARA, Some(body)).await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
}

#[sqlx::test]
async fn only_the_owner_changes_or_deletes_a_log(pool: PgPool) {
    let e = env(pool).await;
    let id = e.log(MARA, public()).await;
    let uri = format!("/descents/{id}");

    // Another user, even with read access, gets 404 rather than 403.
    let r = call(
        &e.app,
        Method::PATCH,
        &uri,
        JON,
        Some(json!({ "name": "Mine" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let r = call(&e.app, Method::DELETE, &uri, JON, None).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let r = call(&e.app, Method::DELETE, &uri, Who::Admin, None).await;
    assert_eq!(
        r.status,
        StatusCode::NOT_FOUND,
        "a server admin has no extra say"
    );
    let r = call(
        &e.app,
        Method::PATCH,
        "/descents/999999",
        MARA,
        Some(json!({ "name": "x" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    let r = call(
        &e.app,
        Method::PATCH,
        &uri,
        MARA,
        Some(json!({ "name": "Renamed", "note": "Cold" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["name"], "Renamed");
    assert_eq!(r.body["note"], "Cold");
    assert_eq!(
        r.body["start_time"], "2026-05-01T09:00:00Z",
        "untouched fields stay"
    );

    // null clears a nullable field.
    let r = call(
        &e.app,
        Method::PATCH,
        &uri,
        MARA,
        Some(json!({ "note": null })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    assert!(r.body.get("note").is_none());

    assert_eq!(
        call(&e.app, Method::DELETE, &uri, MARA, None).await.status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&e.app, Method::GET, &uri, MARA, None).await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&e.app, Method::DELETE, &uri, MARA, None).await.status,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn patch_validation(pool: PgPool) {
    let e = env(pool).await;
    let id = e.log(MARA, private()).await;
    let uri = format!("/descents/{id}");
    let cases: Vec<(&str, Value)> = vec![
        (
            "end before start",
            json!({ "start_time": "2026-05-02T09:00:00Z", "end_time": "2026-05-01T09:00:00Z" }),
        ),
        ("latitude without longitude", json!({ "put_in_lat": 47.0 })),
        ("label only", json!({ "take_out_label": "Bridge" })),
        (
            "feature and coordinates",
            json!({ "take_out_feature_id": 1, "take_out_lat": 1.0, "take_out_lon": 1.0 }),
        ),
        (
            "latitude out of range",
            json!({ "put_in_lat": 95.0, "put_in_lon": 10.0 }),
        ),
        ("name too long", json!({ "name": "n".repeat(256) })),
        (
            "empty shared audience",
            json!({ "visibility": { "type": "shared" } }),
        ),
    ];
    for (what, body) in cases {
        let r = call(&e.app, Method::PATCH, &uri, MARA, Some(body)).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{what}: {}", r.body);
    }
    // A single bound that conflicts with the stored other bound is caught by the schema.
    let r = call(
        &e.app,
        Method::PATCH,
        &uri,
        MARA,
        Some(json!({ "end_time": "2026-05-01T08:00:00Z" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST, "{}", r.body);
    assert_eq!(
        r.body["error"]["message"],
        "end_time must be on or after start_time"
    );

    let r = call(
        &e.app,
        Method::PATCH,
        &uri,
        MARA,
        Some(json!({ "trip_id": 999999 })),
    )
    .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);

    // New coordinates replace the old point.
    let r = call(
        &e.app,
        Method::PATCH,
        &uri,
        MARA,
        Some(json!({ "put_in_lat": 48.0, "put_in_lon": 11.0, "put_in_label": "Dam" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["put_in_lat"], 48.0);
    assert_eq!(r.body["put_in_label"], "Dam");
}

#[sqlx::test]
async fn private_shared_and_public_logs_are_seen_by_the_right_people(pool: PgPool) {
    let e = env(pool).await;
    let private_log = e.log(MARA, private()).await;
    let public_log = e.log(MARA, public()).await;
    let shared_user = e
        .log(MARA, json!({ "type": "shared", "users": ["jon-1"] }))
        .await;
    let g = call(
        &e.app,
        Method::POST,
        "/groups",
        MARA,
        Some(json!({ "name": "Crew" })),
    )
    .await;
    let gid = g.body["id"].as_i64().unwrap();
    sqlx::query("INSERT INTO group_members (group_id, user_id, role, added_by) VALUES ($1, 'eva-1', 'member', 'mara-1')")
        .bind(gid)
        .execute(&e.pool)
        .await
        .unwrap();
    let shared_group = e
        .log(MARA, json!({ "type": "shared", "groups": [gid] }))
        .await;

    // The owner sees everything of their own.
    for id in [private_log, public_log, shared_user, shared_group] {
        assert!(e.can_open(MARA, id).await);
    }
    // Anonymous: public only.
    assert!(e.can_open(Who::Anyone, public_log).await);
    for id in [private_log, shared_user, shared_group] {
        assert!(!e.can_open(Who::Anyone, id).await, "{id}");
    }
    // Jon is named on one shared log.
    assert!(e.can_open(JON, public_log).await);
    assert!(e.can_open(JON, shared_user).await);
    assert!(!e.can_open(JON, private_log).await);
    assert!(!e.can_open(JON, shared_group).await);
    // Eva is in the shared group.
    assert!(e.can_open(EVA, shared_group).await);
    assert!(!e.can_open(EVA, shared_user).await);
    assert!(!e.can_open(EVA, private_log).await);
    // A server admin is an ordinary viewer here.
    assert!(!e.can_open(Who::Admin, private_log).await);

    // The lists agree with the single reads.
    assert_eq!(e.ids(Who::Anyone, "").await, [public_log]);
    assert_eq!(e.ids(JON, "").await, [public_log, shared_user]);
    assert_eq!(e.ids(EVA, "").await, [public_log, shared_group]);
    assert_eq!(
        e.ids(MARA, "").await,
        [private_log, public_log, shared_user, shared_group]
    );

    // The shared audience is part of the owner's view of the log.
    let r = call(
        &e.app,
        Method::GET,
        &format!("/descents/{shared_user}"),
        MARA,
        None,
    )
    .await;
    assert_eq!(
        r.body["visibility"],
        json!({ "type": "shared", "users": ["jon-1"], "groups": [] })
    );
    let r = call(
        &e.app,
        Method::GET,
        &format!("/descents/{shared_group}"),
        MARA,
        None,
    )
    .await;
    assert_eq!(r.body["visibility"]["groups"], json!([gid]));
}

#[sqlx::test]
async fn changing_visibility_replaces_the_audience(pool: PgPool) {
    let e = env(pool).await;
    let id = e
        .log(MARA, json!({ "type": "shared", "users": ["jon-1"] }))
        .await;
    assert!(e.can_open(JON, id).await);

    let uri = format!("/descents/{id}");
    let r = call(
        &e.app,
        Method::PATCH,
        &uri,
        MARA,
        Some(json!({ "visibility": { "type": "shared", "users": ["eva-1"] } })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert!(!e.can_open(JON, id).await);
    assert!(e.can_open(EVA, id).await);

    call(
        &e.app,
        Method::PATCH,
        &uri,
        MARA,
        Some(json!({ "visibility": { "type": "private" } })),
    )
    .await;
    assert!(!e.can_open(EVA, id).await);
    call(
        &e.app,
        Method::PATCH,
        &uri,
        MARA,
        Some(json!({ "visibility": { "type": "public" } })),
    )
    .await;
    assert!(e.can_open(Who::Anyone, id).await);
}

#[sqlx::test]
async fn a_public_log_waits_for_visible_from(pool: PgPool) {
    let e = env(pool).await;
    let later = e
        .log_with(
            MARA,
            public(),
            json!({ "visible_from": "2999-01-01T00:00:00Z" }),
        )
        .await;
    let past = e
        .log_with(
            MARA,
            public(),
            json!({ "visible_from": "2000-01-01T00:00:00Z" }),
        )
        .await;
    assert!(e.can_open(MARA, later).await, "the owner always sees it");
    assert!(!e.can_open(Who::Anyone, later).await);
    assert!(!e.can_open(JON, later).await);
    assert!(e.can_open(JON, past).await);
    assert_eq!(e.ids(Who::Anyone, "").await, [past]);
    let r = call(
        &e.app,
        Method::GET,
        &format!("/descents/{later}"),
        MARA,
        None,
    )
    .await;
    assert_eq!(r.body["visible_from"], "2999-01-01T00:00:00Z");
}

#[sqlx::test]
async fn the_user_filter_narrows_on_top_of_visibility(pool: PgPool) {
    let e = env(pool).await;
    let m_private = e.log(MARA, private()).await;
    let m_public = e.log(MARA, public()).await;
    let m_shared = e
        .log(MARA, json!({ "type": "shared", "users": ["jon-1"] }))
        .await;
    let j_public = e.log(JON, public()).await;

    // Others see only what they could see anyway.
    assert_eq!(e.ids(Who::Anyone, "?user_id=mara-1").await, [m_public]);
    assert_eq!(e.ids(EVA, "?user_id=mara-1").await, [m_public]);
    assert_eq!(e.ids(JON, "?user_id=mara-1").await, [m_public, m_shared]);
    assert_eq!(e.ids(JON, "?user_id=jon-1").await, [j_public]);
    // The owner sees all of their own.
    assert_eq!(
        e.ids(MARA, "?user_id=mara-1").await,
        [m_private, m_public, m_shared]
    );
    assert_eq!(e.ids(MARA, "?user_id=jon-1").await, [j_public]);
    // An unknown author is simply empty.
    assert_eq!(e.ids(MARA, "?user_id=nobody").await, Vec::<i64>::new());
}

#[sqlx::test]
async fn scopes_owned_and_following(pool: PgPool) {
    let e = env(pool).await;
    let m_private = e.log(MARA, private()).await;
    let m_public = e.log(MARA, public()).await;
    let j_public = e.log(JON, public()).await;
    let j_private = e.log(JON, private()).await;
    let _ = j_private;

    assert_eq!(e.ids(MARA, "?scope=owned").await, [m_private, m_public]);
    assert_eq!(
        e.ids(MARA, "?scope=owned&visibility=public").await,
        [m_public]
    );
    assert_eq!(
        e.ids(MARA, "?scope=owned&visibility=private").await,
        [m_private]
    );

    assert_eq!(
        e.ids(MARA, "?scope=following").await,
        Vec::<i64>::new(),
        "follows nobody yet"
    );
    sqlx::query("INSERT INTO user_follows (follower_id, following_id, status) VALUES ('mara-1', 'jon-1', 'pending')")
        .execute(&e.pool)
        .await
        .unwrap();
    assert_eq!(
        e.ids(MARA, "?scope=following").await,
        Vec::<i64>::new(),
        "a pending request does not count"
    );
    sqlx::query("UPDATE user_follows SET status = 'accepted'")
        .execute(&e.pool)
        .await
        .unwrap();
    assert_eq!(
        e.ids(MARA, "?scope=following").await,
        [j_public],
        "only what the follower may see"
    );

    // An unknown scope is the default "visible" listing.
    assert_eq!(
        e.ids(MARA, "?scope=bogus").await,
        [m_private, m_public, j_public]
    );
}

#[sqlx::test]
async fn the_list_filters_by_time_section_and_visibility_and_pages(pool: PgPool) {
    let e = env(pool).await;
    let may = e
        .log_with(
            MARA,
            public(),
            json!({ "start_time": "2026-05-01T09:00:00Z", "end_time": "2026-05-01T10:00:00Z" }),
        )
        .await;
    let june = e.log_with(MARA, public(), json!({ "start_time": "2026-06-01T09:00:00Z", "end_time": "2026-06-01T10:00:00Z", "sections": [] })).await;
    let july = e
        .log_with(
            MARA,
            private(),
            json!({ "start_time": "2026-07-01T09:00:00Z", "end_time": "2026-07-01T10:00:00Z" }),
        )
        .await;

    assert_eq!(
        e.ids(MARA, "?from=2026-06-01T00:00:00Z").await,
        [june, july]
    );
    assert_eq!(e.ids(MARA, "?to=2026-06-01T00:00:00Z").await, [may]);
    assert_eq!(
        e.ids(MARA, &format!("?section_id={}", e.section)).await,
        [may, july]
    );
    assert_eq!(e.ids(MARA, "?visibility=private").await, [july]);
    assert_eq!(
        e.ids(Who::Anyone, &format!("?section_id={}", e.section))
            .await,
        [may]
    );
    assert!(
        e.list(MARA, "?from=yesterday")
            .await
            .status
            .is_client_error()
    );

    // Newest start first, paged in the usual envelope.
    let r = e.list(MARA, "?per_page=2").await;
    assert_eq!(r.body["total"], 3);
    assert_eq!(r.body["page"], 1);
    assert_eq!(r.body["per_page"], 2);
    assert_eq!(r.body["total_pages"], 2);
    let first: Vec<i64> = r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["id"].as_i64().unwrap())
        .collect();
    assert_eq!(first, [july, june]);
    let r = e.list(MARA, "?per_page=2&page=2").await;
    assert_eq!(r.body["items"][0]["id"], may);
    let r = e.list(MARA, "?per_page=2&page=7").await;
    assert_eq!(r.body["items"].as_array().unwrap().len(), 0);
    let r = e.list(MARA, "?per_page=100000").await;
    assert_eq!(r.body["per_page"], 100);
    assert_eq!(e.list(MARA, "").await.body["per_page"], 25);
}
