//! Wiki changes from non-admins: stored as proposals, applied on approval
//! through the same writes the admin path uses.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, call, fake_auth, people, state};
use paddlemate_api::routes::{
    materials::materials_routes, proposals::proposals_routes, waterways::waterways_routes,
};
use serde_json::{Value, json};
use sqlx::PgPool;

const MARA: Who = Who::User("mara-1");
const NOA: Who = Who::User("noa-1");

fn app(pool: PgPool) -> Router {
    let state = state(pool);
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/materials", materials_routes(state.clone()))
        .nest_api_service("/waterways", waterways_routes(state.clone()))
        .nest_api_service("/proposals", proposals_routes(state))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

fn entry(model: &str) -> Value {
    json!({ "category": "kayak", "brand": "Zedboats", "model": model, "disciplines": ["creek"] })
}

/// An entry the admin created; returns its id.
async fn seed(app: &Router, model: &str) -> i64 {
    let r = call(
        app,
        Method::POST,
        "/materials",
        Who::Admin,
        Some(entry(model)),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    r.body["id"].as_i64().unwrap()
}

async fn propose(app: &Router, method: Method, uri: &str, who: Who, body: Option<Value>) -> i64 {
    let r = call(app, method, uri, who, body).await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    r.body["id"].as_i64().unwrap()
}

async fn decide(app: &Router, id: i64, who: Who, status: &str) -> common::Reply {
    let body = json!({ "status": status });
    call(
        app,
        Method::PATCH,
        &format!("/proposals/{id}"),
        who,
        Some(body),
    )
    .await
}

async fn entry_of(app: &Router, id: i64) -> common::Reply {
    call(
        app,
        Method::GET,
        &format!("/materials/{id}"),
        Who::Anyone,
        None,
    )
    .await
}

#[sqlx::test]
async fn approving_each_kind_applies_it_and_rejecting_changes_nothing(pool: PgPool) {
    people(&pool).await;
    common::add_user(&pool, "noa-1", "noa").await;
    let app = app(pool.clone());
    let id = seed(&app, "Ripper").await;
    let uri = format!("/materials/{id}");

    let create = propose(
        &app,
        Method::POST,
        "/materials",
        MARA,
        Some(entry("Zed One")),
    )
    .await;
    let mut edit = entry("Ripper");
    edit["volume_l"] = json!(240);
    let update = propose(&app, Method::PUT, &uri, MARA, Some(edit)).await;
    let delete = propose(&app, Method::DELETE, &uri, NOA, None).await;

    // Only an admin decides.
    assert_eq!(
        decide(&app, create, MARA, "approved").await.status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        decide(&app, create, Who::Anyone, "approved").await.status,
        StatusCode::UNAUTHORIZED
    );

    // Rejecting leaves the wiki as it was.
    let r = decide(&app, delete, Who::Admin, "rejected").await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["status"], "rejected");
    assert_eq!(entry_of(&app, id).await.status, StatusCode::OK);
    let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM materials WHERE model = 'Zed One'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 0);

    let r = decide(&app, create, Who::Admin, "approved").await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    let (created_by, updated_by): (String, Option<String>) =
        sqlx::query_as("SELECT created_by, updated_by FROM materials WHERE model = 'Zed One'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((created_by.as_str(), updated_by), ("mara-1", None));

    let r = decide(&app, update, Who::Admin, "approved").await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    let r = entry_of(&app, id).await;
    assert_eq!(r.body["volume_l"], 240.0);
    assert_eq!(r.body["updated_by_username"], "mara");

    // A proposal is decided once.
    assert_eq!(
        decide(&app, update, Who::Admin, "rejected").await.status,
        StatusCode::NOT_FOUND
    );

    let delete = propose(&app, Method::DELETE, &uri, NOA, None).await;
    assert_eq!(
        decide(&app, delete, Who::Admin, "approved").await.status,
        StatusCode::OK
    );
    assert_eq!(entry_of(&app, id).await.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn an_approved_update_replaces_the_entry_as_proposed_even_if_it_changed_since(pool: PgPool) {
    // Same rule as waterway proposals: the stored change is applied as it
    // is, with no check against edits made after it was proposed.
    people(&pool).await;
    common::add_user(&pool, "noa-1", "noa").await;
    let app = app(pool);
    let id = seed(&app, "Ripper").await;
    let uri = format!("/materials/{id}");
    let mut edit = entry("Ripper");
    edit["weight_kg"] = json!(20);
    let proposal = propose(&app, Method::PUT, &uri, MARA, Some(edit)).await;

    let mut newer = entry("Ripper");
    newer["volume_l"] = json!(300);
    let r = call(&app, Method::PUT, &uri, Who::Admin, Some(newer)).await;
    assert_eq!(r.status, StatusCode::OK);

    assert_eq!(
        decide(&app, proposal, Who::Admin, "approved").await.status,
        StatusCode::OK
    );
    let r = entry_of(&app, id).await;
    assert_eq!(r.body["weight_kg"], 20.0);
    assert!(r.body.get("volume_l").is_none());
}

#[sqlx::test]
async fn approving_for_an_entry_that_is_gone_does_nothing(pool: PgPool) {
    people(&pool).await;
    common::add_user(&pool, "noa-1", "noa").await;
    let app = app(pool);
    let id = seed(&app, "Ripper").await;
    let uri = format!("/materials/{id}");
    let update = propose(&app, Method::PUT, &uri, MARA, Some(entry("Ripper"))).await;
    let delete = propose(&app, Method::DELETE, &uri, NOA, None).await;
    let r = call(&app, Method::DELETE, &uri, Who::Admin, None).await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);

    for id in [update, delete] {
        let r = decide(&app, id, Who::Admin, "approved").await;
        assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    }
}

#[sqlx::test]
async fn approving_a_name_taken_meanwhile_is_a_conflict_and_stays_pending(pool: PgPool) {
    people(&pool).await;
    common::add_user(&pool, "noa-1", "noa").await;
    let app = app(pool);
    let proposal = propose(
        &app,
        Method::POST,
        "/materials",
        MARA,
        Some(entry("Zed One")),
    )
    .await;
    seed(&app, "Zed One").await;

    let r = decide(&app, proposal, Who::Admin, "approved").await;
    assert_eq!(r.status, StatusCode::CONFLICT, "{}", r.body);
    let r = call(
        &app,
        Method::GET,
        &format!("/proposals/{proposal}"),
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(r.body["status"], "pending");
}

#[sqlx::test]
async fn one_pending_update_or_delete_per_user_and_entry(pool: PgPool) {
    people(&pool).await;
    common::add_user(&pool, "noa-1", "noa").await;
    let app = app(pool);
    let id = seed(&app, "Ripper").await;
    let other = seed(&app, "Slicer").await;
    let uri = format!("/materials/{id}");
    let first = propose(&app, Method::PUT, &uri, MARA, Some(entry("Ripper"))).await;

    let r = call(&app, Method::PUT, &uri, MARA, Some(entry("Ripper"))).await;
    assert_eq!(r.status, StatusCode::CONFLICT, "{}", r.body);
    assert_eq!(r.body["error"]["target"], "id");
    let r = call(&app, Method::DELETE, &uri, MARA, None).await;
    assert_eq!(r.status, StatusCode::CONFLICT, "{}", r.body);

    // Another entry, another user, creates and an admin are not blocked.
    propose(
        &app,
        Method::PUT,
        &format!("/materials/{other}"),
        MARA,
        Some(entry("Slicer")),
    )
    .await;
    propose(&app, Method::PUT, &uri, NOA, Some(entry("Ripper"))).await;
    propose(&app, Method::POST, "/materials", MARA, Some(entry("Fresh"))).await;
    propose(
        &app,
        Method::POST,
        "/materials",
        MARA,
        Some(entry("Fresher")),
    )
    .await;
    let r = call(&app, Method::PUT, &uri, Who::Admin, Some(entry("Ripper"))).await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);

    // Once decided, a new one is allowed.
    assert_eq!(
        decide(&app, first, Who::Admin, "rejected").await.status,
        StatusCode::OK
    );
    let second = propose(&app, Method::DELETE, &uri, MARA, None).await;
    let r = call(&app, Method::PUT, &uri, MARA, Some(entry("Ripper"))).await;
    assert_eq!(r.status, StatusCode::CONFLICT, "{}", r.body);
    assert_eq!(
        decide(&app, second, Who::Admin, "approved").await.status,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn material_proposals_list_filter_and_take_votes(pool: PgPool) {
    people(&pool).await;
    common::add_user(&pool, "noa-1", "noa").await;
    let app = app(pool);
    let material = propose(
        &app,
        Method::POST,
        "/materials",
        MARA,
        Some(entry("Zed One")),
    )
    .await;
    propose(
        &app,
        Method::POST,
        "/waterways",
        MARA,
        Some(json!({ "name": "Some creek" })),
    )
    .await;

    let r = call(
        &app,
        Method::GET,
        "/proposals?entity_type=material",
        Who::Anyone,
        None,
    )
    .await;
    let ids: Vec<i64> = r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].as_i64().unwrap())
        .collect();
    assert_eq!(ids, vec![material]);
    assert_eq!(r.body["items"][0]["entity_type"], "material");

    let vote = async |who: Who| {
        let uri = format!("/proposals/{material}/vote");
        call(&app, Method::POST, &uri, who, Some(json!({ "vote": 1 }))).await
    };
    assert_eq!(
        vote(MARA).await.status,
        StatusCode::FORBIDDEN,
        "no vote on your own"
    );
    assert_eq!(vote(Who::Admin).await.status, StatusCode::NO_CONTENT);
    let r = call(
        &app,
        Method::GET,
        &format!("/proposals/{material}"),
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(r.body["upvotes"], 1);
}

#[sqlx::test]
async fn withdrawn_proposals_still_count_toward_the_daily_cap(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    for i in 0..30 {
        let id = propose(
            &app,
            Method::POST,
            "/materials",
            MARA,
            Some(entry(&format!("Cycle {i}"))),
        )
        .await;
        let r = call(
            &app,
            Method::DELETE,
            &format!("/proposals/{id}"),
            MARA,
            None,
        )
        .await;
        assert_eq!(r.status, StatusCode::NO_CONTENT, "{i}: {}", r.body);
    }
    let r = call(
        &app,
        Method::POST,
        "/materials",
        MARA,
        Some(entry("One more")),
    )
    .await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS, "{}", r.body);
}
