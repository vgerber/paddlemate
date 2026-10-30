//! Follows and the user list under `/users`, behind the real API-key layer.

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

async fn send(app: &Router, m: Method, uri: &str, key: &str, body: Option<Value>) -> common::Reply {
    call_key(app, m, uri, Some(key), body).await
}

fn names(r: &common::Reply) -> Vec<String> {
    r.body
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["username"].as_str().unwrap().to_string())
        .collect()
}

#[sqlx::test]
async fn follow_routes_need_a_signed_in_caller(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    let app = app(pool);
    for (m, uri) in [
        (Method::GET, "/users"),
        (Method::GET, "/users/me/followers"),
        (Method::GET, "/users/me/following"),
        (Method::PUT, "/users/me/following/user-mara"),
        (Method::DELETE, "/users/me/following/user-mara"),
        (Method::PATCH, "/users/me/followers/user-mara"),
    ] {
        let r = call_key(&app, m, uri, None, Some(json!({ "status": "accepted" }))).await;
        assert_eq!(r.status, StatusCode::UNAUTHORIZED, "{uri}");
    }
}

#[sqlx::test]
async fn a_follow_is_a_request_until_accepted(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    keyed_user(&pool, "jon").await;
    let app = app(pool);

    let r = send(
        &app,
        Method::PUT,
        "/users/me/following/user-jon",
        "pm_mara",
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    // Repeating changes nothing.
    let r = send(
        &app,
        Method::PUT,
        "/users/user-mara/following/user-jon",
        "pm_mara",
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);

    // Pending: not yet in either accepted list.
    let r = send(&app, Method::GET, "/users/me/following", "pm_mara", None).await;
    assert_eq!(r.body, json!([]));
    let r = send(&app, Method::GET, "/users/me/followers", "pm_jon", None).await;
    assert_eq!(r.body, json!([]));
    let r = send(
        &app,
        Method::GET,
        "/users/me/followers?status=pending",
        "pm_jon",
        None,
    )
    .await;
    assert_eq!(names(&r), ["mara"]);
    let u = &r.body[0];
    assert_eq!(u["id"], "user-mara");
    assert!(u["created_at"].is_string() && u["updated_at"].is_string());

    // The user list shows both sides of the request.
    let r = send(&app, Method::GET, "/users", "pm_mara", None).await;
    assert_eq!(r.body["items"][0]["outgoing_status"], "pending");
    assert_eq!(r.body["items"][0]["incoming_pending"], false);
    let r = send(&app, Method::GET, "/users", "pm_jon", None).await;
    assert_eq!(r.body["items"][0]["outgoing_status"], Value::Null);
    assert_eq!(r.body["items"][0]["incoming_pending"], true);

    let r = send(
        &app,
        Method::PATCH,
        "/users/me/followers/user-mara",
        "pm_jon",
        Some(json!({ "status": "accepted" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);

    let r = send(&app, Method::GET, "/users/me/following", "pm_mara", None).await;
    assert_eq!(names(&r), ["jon"]);
    let r = send(&app, Method::GET, "/users/me/followers", "pm_jon", None).await;
    assert_eq!(names(&r), ["mara"]);
    let r = send(
        &app,
        Method::GET,
        "/users/me/followers?status=pending",
        "pm_jon",
        None,
    )
    .await;
    assert_eq!(r.body, json!([]));
    let r = send(&app, Method::GET, "/users", "pm_mara", None).await;
    assert_eq!(r.body["items"][0]["outgoing_status"], "accepted");

    // Accepting again finds no pending request.
    let r = send(
        &app,
        Method::PATCH,
        "/users/me/followers/user-mara",
        "pm_jon",
        Some(json!({ "status": "accepted" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn follow_validation_and_ownership(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    keyed_user(&pool, "jon").await;
    let app = app(pool);

    let r = send(
        &app,
        Method::PUT,
        "/users/me/following/user-mara",
        "pm_mara",
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(r.body["error"]["message"], "Cannot follow yourself");

    let r = send(
        &app,
        Method::PUT,
        "/users/me/following/nobody",
        "pm_mara",
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    // Another user's collections stay closed.
    for (m, uri) in [
        (Method::GET, "/users/user-jon/followers"),
        (Method::GET, "/users/user-jon/following"),
        (Method::PUT, "/users/user-jon/following/user-mara"),
        (Method::DELETE, "/users/user-jon/following/user-mara"),
        (Method::PATCH, "/users/user-jon/followers/user-mara"),
    ] {
        let r = send(
            &app,
            m,
            uri,
            "pm_mara",
            Some(json!({ "status": "accepted" })),
        )
        .await;
        assert_eq!(r.status, StatusCode::FORBIDDEN, "{uri}");
    }

    send(
        &app,
        Method::PUT,
        "/users/me/following/user-jon",
        "pm_mara",
        None,
    )
    .await;
    let r = send(
        &app,
        Method::PATCH,
        "/users/me/followers/user-mara",
        "pm_jon",
        Some(json!({ "status": "pending" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let r = send(
        &app,
        Method::PATCH,
        "/users/me/followers/user-mara",
        "pm_jon",
        Some(json!({ "status": "bogus" })),
    )
    .await;
    assert!(r.status.is_client_error());
    let r = send(
        &app,
        Method::GET,
        "/users/me/followers?status=bogus",
        "pm_jon",
        None,
    )
    .await;
    assert!(r.status.is_client_error());
}

#[sqlx::test]
async fn unfollowing_and_rejecting_remove_the_row(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    keyed_user(&pool, "jon").await;
    let app = app(pool);

    // The follower withdraws a pending request.
    send(
        &app,
        Method::PUT,
        "/users/me/following/user-jon",
        "pm_mara",
        None,
    )
    .await;
    let r = send(
        &app,
        Method::DELETE,
        "/users/me/following/user-jon",
        "pm_mara",
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let r = send(
        &app,
        Method::GET,
        "/users/me/followers?status=pending",
        "pm_jon",
        None,
    )
    .await;
    assert_eq!(r.body, json!([]));

    // The target rejects a pending request with the same call.
    send(
        &app,
        Method::PUT,
        "/users/me/following/user-jon",
        "pm_mara",
        None,
    )
    .await;
    let r = send(
        &app,
        Method::DELETE,
        "/users/me/following/user-mara",
        "pm_jon",
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let r = send(
        &app,
        Method::GET,
        "/users/me/followers?status=pending",
        "pm_jon",
        None,
    )
    .await;
    assert_eq!(r.body, json!([]));

    // An accepted follow is ended only by the follower.
    send(
        &app,
        Method::PUT,
        "/users/me/following/user-jon",
        "pm_mara",
        None,
    )
    .await;
    send(
        &app,
        Method::PATCH,
        "/users/me/followers/user-mara",
        "pm_jon",
        Some(json!({ "status": "accepted" })),
    )
    .await;
    send(
        &app,
        Method::DELETE,
        "/users/me/following/user-mara",
        "pm_jon",
        None,
    )
    .await;
    let r = send(&app, Method::GET, "/users/me/following", "pm_mara", None).await;
    assert_eq!(names(&r), ["jon"]);
    let r = send(
        &app,
        Method::DELETE,
        "/users/me/following/user-jon",
        "pm_mara",
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let r = send(&app, Method::GET, "/users/me/following", "pm_mara", None).await;
    assert_eq!(r.body, json!([]));

    // Deleting what is not there is still 204.
    let r = send(
        &app,
        Method::DELETE,
        "/users/me/following/user-jon",
        "pm_mara",
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn the_user_list_is_paged_searched_and_leaves_out_the_caller(pool: PgPool) {
    keyed_user(&pool, "mara").await;
    for n in ["anna", "bert", "cleo", "dora"] {
        keyed_user(&pool, n).await;
    }
    let app = app(pool);

    let r = send(&app, Method::GET, "/users", "pm_mara", None).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["total"], 4);
    assert_eq!(r.body["page"], 1);
    assert_eq!(r.body["per_page"], 100);
    assert_eq!(r.body["total_pages"], 1);
    let items: Vec<&str> = r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["username"].as_str().unwrap())
        .collect();
    assert_eq!(items, ["anna", "bert", "cleo", "dora"]);

    let r = send(
        &app,
        Method::GET,
        "/users?per_page=3&page=2",
        "pm_mara",
        None,
    )
    .await;
    assert_eq!(r.body["total"], 4);
    assert_eq!(r.body["total_pages"], 2);
    assert_eq!(r.body["items"].as_array().unwrap().len(), 1);
    assert_eq!(r.body["items"][0]["username"], "dora");

    let r = send(&app, Method::GET, "/users?q=ER", "pm_mara", None).await;
    assert_eq!(r.body["total"], 1);
    assert_eq!(r.body["items"][0]["username"], "bert");

    let long = "x".repeat(300);
    let r = send(
        &app,
        Method::GET,
        &format!("/users?q={long}"),
        "pm_mara",
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}
