//! The proposals API: who sees which proposals, the review step and the vote
//! flow. Proposals are made the way the app makes them, by a non-admin
//! calling a waterway route (202).

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, add_user, call, fake_auth, state};
use paddlemate_api::routes::{proposals::proposals_routes, waterways::waterways_routes};
use serde_json::{Value, json};
use sqlx::PgPool;

const MARA: Who = Who::User("mara-1");
const JON: Who = Who::User("jon-1");

async fn app(pool: PgPool) -> Router {
    for (id, name) in [
        (common::ADMIN, "root"),
        ("mara-1", "mara"),
        ("jon-1", "jon"),
    ] {
        add_user(&pool, id, name).await;
    }
    let state = state(pool);
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/waterways", waterways_routes(state.clone()))
        .nest_api_service("/proposals", proposals_routes(state))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

/// A pending "create waterway" proposal by `who`; returns its id.
async fn propose(app: &Router, who: Who, name: &str) -> i64 {
    let r = call(
        app,
        Method::POST,
        "/waterways",
        who,
        Some(json!({ "name": name })),
    )
    .await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    r.body["id"].as_i64().unwrap()
}

async fn review(app: &Router, id: i64, who: Who, body: Value) -> common::Reply {
    call(
        app,
        Method::PATCH,
        &format!("/proposals/{id}"),
        who,
        Some(body),
    )
    .await
}

async fn vote(app: &Router, id: i64, who: Who, v: i64) -> common::Reply {
    call(
        app,
        Method::POST,
        &format!("/proposals/{id}/vote"),
        who,
        Some(json!({ "vote": v })),
    )
    .await
}

fn ids(r: &common::Reply) -> Vec<i64> {
    r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].as_i64().unwrap())
        .collect()
}

#[sqlx::test]
async fn a_proposal_has_the_shape_the_app_reads(pool: PgPool) {
    let app = app(pool).await;
    let id = propose(&app, MARA, "Inn").await;

    let r = call(
        &app,
        Method::GET,
        &format!("/proposals/{id}"),
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    let p = &r.body;
    assert_eq!(p["id"], id);
    assert_eq!(p["entity_type"], "waterway");
    assert_eq!(p["operation"], "create");
    assert_eq!(p["status"], "pending");
    assert_eq!(p["proposed_data"]["name"], "Inn");
    assert_eq!(p["submitted_by"], "mara-1");
    assert_eq!(p["submitted_by_name"], "mara");
    assert_eq!(p["reviewed_by_name"], Value::Null);
    assert_eq!(p["upvotes"], 0);
    assert_eq!(p["downvotes"], 0);
    assert!(p["created_at"].is_string() && p["updated_at"].is_string());
    for absent in [
        "entity_id",
        "original_data",
        "reviewed_by",
        "review_note",
        "submitter_note",
        "user_vote",
    ] {
        assert!(p.get(absent).is_none(), "{absent} is omitted when empty");
    }

    assert_eq!(
        call(&app, Method::GET, "/proposals/999999", Who::Anyone, None)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn the_list_depends_on_who_asks(pool: PgPool) {
    let app = app(pool).await;
    let a = propose(&app, MARA, "Inn").await;
    let b = propose(&app, JON, "Lech").await;
    let c = propose(&app, MARA, "Isar").await;
    review(&app, c, Who::Admin, json!({ "status": "rejected" })).await;

    // Anonymous: pending only, from everyone, newest first; filters on submitter and status are ignored.
    let r = call(&app, Method::GET, "/proposals", Who::Anyone, None).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(ids(&r), [b, a]);
    let r = call(
        &app,
        Method::GET,
        "/proposals?status=rejected&submitted_by=mara-1",
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(ids(&r), [b, a]);

    // Signed-in non-admin: every pending proposal plus their own reviewed ones.
    let r = call(&app, Method::GET, "/proposals", MARA, None).await;
    assert_eq!(ids(&r), [c, b, a]);
    let r = call(&app, Method::GET, "/proposals", JON, None).await;
    assert_eq!(ids(&r), [b, a], "another user's rejected proposal stays hidden");
    let r = call(
        &app,
        Method::GET,
        "/proposals?submitted_by=jon-1",
        MARA,
        None,
    )
    .await;
    assert_eq!(
        ids(&r),
        [b],
        "the submitter filter narrows within what the contributor may see"
    );
    let r = call(&app, Method::GET, "/proposals?status=rejected", JON, None).await;
    assert_eq!(ids(&r), Vec::<i64>::new());
    let r = call(&app, Method::GET, "/proposals?status=pending", MARA, None).await;
    assert_eq!(ids(&r), [b, a]);

    // Admin: everything, with filters.
    let r = call(&app, Method::GET, "/proposals", Who::Admin, None).await;
    assert_eq!(ids(&r), [c, b, a]);
    let r = call(
        &app,
        Method::GET,
        "/proposals?submitted_by=jon-1",
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(ids(&r), [b]);
    let r = call(
        &app,
        Method::GET,
        "/proposals?status=rejected",
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(ids(&r), [c]);
    let r = call(
        &app,
        Method::GET,
        "/proposals?entity_type=feature",
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(ids(&r), Vec::<i64>::new());
    let r = call(
        &app,
        Method::GET,
        "/proposals?operation=create&entity_type=waterway",
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(ids(&r), [c, b, a]);
}

#[sqlx::test]
async fn the_list_is_paged(pool: PgPool) {
    let app = app(pool).await;
    for n in 0..3 {
        propose(&app, MARA, &format!("River {n}")).await;
    }
    let r = call(
        &app,
        Method::GET,
        "/proposals?per_page=2",
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.body["total"], 3);
    assert_eq!(r.body["page"], 1);
    assert_eq!(r.body["per_page"], 2);
    assert_eq!(r.body["total_pages"], 2);
    assert_eq!(r.body["items"].as_array().unwrap().len(), 2);

    let r = call(
        &app,
        Method::GET,
        "/proposals?per_page=2&page=2",
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.body["items"].as_array().unwrap().len(), 1);

    let r = call(
        &app,
        Method::GET,
        "/proposals?per_page=2&page=9",
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.body["items"].as_array().unwrap().len(), 0);
    assert_eq!(r.body["total"], 3, "the total survives a page past the end");

    let r = call(
        &app,
        Method::GET,
        "/proposals?per_page=100000",
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.body["per_page"], 100);
}

#[sqlx::test]
async fn reviewed_proposals_are_private_to_their_submitter_and_admins(pool: PgPool) {
    let app = app(pool).await;
    let id = propose(&app, MARA, "Inn").await;
    review(
        &app,
        id,
        Who::Admin,
        json!({ "status": "rejected", "review_note": "Duplicate" }),
    )
    .await;
    let uri = format!("/proposals/{id}");

    let r = call(&app, Method::GET, &uri, MARA, None).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["status"], "rejected");
    assert_eq!(r.body["review_note"], "Duplicate");
    assert_eq!(r.body["reviewed_by"], common::ADMIN);
    assert_eq!(r.body["reviewed_by_name"], "root");
    assert_eq!(
        call(&app, Method::GET, &uri, Who::Admin, None).await.status,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, Method::GET, &uri, JON, None).await.status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, Method::GET, &uri, Who::Anyone, None)
            .await
            .status,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test]
async fn only_an_admin_reviews_and_only_once(pool: PgPool) {
    let app = app(pool.clone()).await;
    let id = propose(&app, MARA, "Inn").await;

    let r = review(&app, id, Who::Anyone, json!({ "status": "approved" })).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    for who in [MARA, JON] {
        let r = review(&app, id, who, json!({ "status": "approved" })).await;
        assert_eq!(r.status, StatusCode::FORBIDDEN);
    }
    let r = review(&app, id, Who::Admin, json!({ "status": "pending" })).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let r = review(&app, id, Who::Admin, json!({ "status": "maybe" })).await;
    assert!(r.status.is_client_error());
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM waterways")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0, "nothing applied yet");

    let r = review(
        &app,
        id,
        Who::Admin,
        json!({ "status": "approved", "review_note": "Thanks" }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["status"], "approved");
    assert_eq!(r.body["review_note"], "Thanks");
    assert_eq!(r.body["reviewed_by"], common::ADMIN);
    let name: String = sqlx::query_scalar("SELECT name FROM waterways")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, "Inn", "approval applies the change");

    let r = review(&app, id, Who::Admin, json!({ "status": "rejected" })).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND, "already reviewed");
    let r = review(&app, 999999, Who::Admin, json!({ "status": "rejected" })).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn approving_a_duplicate_is_a_conflict_and_leaves_it_pending(pool: PgPool) {
    let app = app(pool).await;
    let a = propose(&app, MARA, "Inn").await;
    let b = propose(&app, JON, "Inn").await;
    assert_eq!(
        review(&app, a, Who::Admin, json!({ "status": "approved" }))
            .await
            .status,
        StatusCode::OK
    );
    let r = review(&app, b, Who::Admin, json!({ "status": "approved" })).await;
    assert_eq!(r.status, StatusCode::CONFLICT, "{}", r.body);
    let r = call(
        &app,
        Method::GET,
        &format!("/proposals/{b}"),
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.body["status"], "pending");
    assert_eq!(
        review(&app, b, Who::Admin, json!({ "status": "rejected" }))
            .await
            .status,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn votes_are_counted_changed_and_withdrawn(pool: PgPool) {
    let app = app(pool).await;
    let id = propose(&app, MARA, "Inn").await;
    let uri = format!("/proposals/{id}");

    assert_eq!(
        vote(&app, id, Who::Anyone, 1).await.status,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(vote(&app, id, JON, 0).await.status, StatusCode::BAD_REQUEST);
    assert_eq!(vote(&app, id, JON, 2).await.status, StatusCode::BAD_REQUEST);
    let r = vote(&app, id, MARA, 1).await;
    assert_eq!(r.status, StatusCode::FORBIDDEN, "the author may not vote");
    assert_eq!(
        vote(&app, 999999, JON, 1).await.status,
        StatusCode::NOT_FOUND
    );

    assert_eq!(vote(&app, id, JON, 1).await.status, StatusCode::NO_CONTENT);
    assert_eq!(
        vote(&app, id, Who::Admin, -1).await.status,
        StatusCode::NO_CONTENT
    );
    let r = call(&app, Method::GET, &uri, JON, None).await;
    assert_eq!(
        (r.body["upvotes"].as_i64(), r.body["downvotes"].as_i64()),
        (Some(1), Some(1))
    );
    assert_eq!(r.body["user_vote"], 1);
    let r = call(&app, Method::GET, &uri, Who::Anyone, None).await;
    assert!(r.body.get("user_vote").is_none());

    // Voting again changes the vote instead of adding one.
    assert_eq!(vote(&app, id, JON, -1).await.status, StatusCode::NO_CONTENT);
    let r = call(&app, Method::GET, &uri, JON, None).await;
    assert_eq!(
        (r.body["upvotes"].as_i64(), r.body["downvotes"].as_i64()),
        (Some(0), Some(2))
    );
    assert_eq!(r.body["user_vote"], -1);

    let del = call(&app, Method::DELETE, &format!("{uri}/vote"), JON, None).await;
    assert_eq!(del.status, StatusCode::NO_CONTENT);
    let again = call(&app, Method::DELETE, &format!("{uri}/vote"), JON, None).await;
    assert_eq!(
        again.status,
        StatusCode::NO_CONTENT,
        "withdrawing nothing is fine"
    );
    let anon = call(
        &app,
        Method::DELETE,
        &format!("{uri}/vote"),
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(anon.status, StatusCode::UNAUTHORIZED);
    let r = call(&app, Method::GET, &uri, JON, None).await;
    assert_eq!(r.body["downvotes"], 1);
    assert!(r.body.get("user_vote").is_none());
}

#[sqlx::test]
async fn a_reviewed_proposal_takes_no_votes(pool: PgPool) {
    let app = app(pool).await;
    let id = propose(&app, MARA, "Inn").await;
    review(&app, id, Who::Admin, json!({ "status": "rejected" })).await;
    let r = vote(&app, id, JON, 1).await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    assert_eq!(
        r.body["error"]["message"],
        "Only pending proposals can be voted on"
    );
}

#[sqlx::test]
async fn withdrawing_a_proposal(pool: PgPool) {
    let app = app(pool).await;
    let id = propose(&app, MARA, "Inn").await;
    let uri = format!("/proposals/{id}");

    assert_eq!(
        call(&app, Method::DELETE, &uri, Who::Anyone, None)
            .await
            .status,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(&app, Method::DELETE, &uri, JON, None).await.status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, Method::DELETE, "/proposals/999999", MARA, None)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, Method::DELETE, &uri, MARA, None).await.status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, Method::GET, &uri, MARA, None).await.status,
        StatusCode::NOT_FOUND
    );

    // An admin may withdraw anyone's; a reviewed one stays.
    let b = propose(&app, MARA, "Lech").await;
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("/proposals/{b}"),
            Who::Admin,
            None
        )
        .await
        .status,
        StatusCode::NO_CONTENT
    );
    let c = propose(&app, MARA, "Isar").await;
    review(&app, c, Who::Admin, json!({ "status": "approved" })).await;
    let r = call(&app, Method::DELETE, &format!("/proposals/{c}"), MARA, None).await;
    assert_eq!(r.status, StatusCode::CONFLICT);
}
