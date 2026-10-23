//! Input and scoping guards on the comment, descent, user and group routes.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, add_user, call, fake_auth, state};
use paddlemate_api::routes::{
    descents::descents_routes, groups::group_routes, proposals::proposals_routes,
    users::users_routes, waterways::waterways_routes,
};
use serde_json::{Value, json};
use sqlx::PgPool;

fn app(pool: PgPool) -> Router {
    let state = state(pool);
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/waterways", waterways_routes(state.clone()))
        .nest_api_service("/descents", descents_routes(state.clone()))
        .nest_api_service("/users", users_routes(state.clone()))
        .nest_api_service("/groups", group_routes(state.clone()))
        .nest_api_service("/proposals", proposals_routes(state))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

async fn people(pool: &PgPool) {
    add_user(pool, common::ADMIN, "root").await;
    add_user(pool, "mara-1", "mara").await;
    add_user(pool, "jon-1", "jon").await;
}

fn line() -> Value {
    json!({ "type": "LineString", "coordinates": [[10.0, 47.0], [10.1, 47.1]] })
}

async fn id_of(r: common::Reply) -> i64 {
    assert!(r.status.is_success(), "{} {}", r.status, r.body);
    r.body["id"].as_i64().unwrap()
}

#[sqlx::test]
async fn comments_are_reached_only_through_their_own_parents(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let make = |w: &'static str| {
        let app = app.clone();
        async move {
            id_of(
                call(
                    &app,
                    Method::POST,
                    "/waterways",
                    Who::Admin,
                    Some(json!({ "name": w })),
                )
                .await,
            )
            .await
        }
    };
    let (w1, w2) = (make("Inn").await, make("Salzach").await);
    let s1 = id_of(
        call(
            &app,
            Method::POST,
            &format!("/waterways/{w1}/sections"),
            Who::Admin,
            Some(json!({ "name": "Upper", "location": line(), "country": "AT" })),
        )
        .await,
    )
    .await;
    let s2 = id_of(
        call(
            &app,
            Method::POST,
            &format!("/waterways/{w1}/sections"),
            Who::Admin,
            Some(json!({ "name": "Lower", "location": line(), "country": "AT" })),
        )
        .await,
    )
    .await;
    let river = id_of(
        call(
            &app,
            Method::POST,
            &format!("/waterways/{w1}/comments"),
            Who::User("mara-1"),
            Some(json!({ "body": "river note" })),
        )
        .await,
    )
    .await;
    let section = id_of(
        call(
            &app,
            Method::POST,
            &format!("/waterways/{w1}/sections/{s1}/comments"),
            Who::User("mara-1"),
            Some(json!({ "body": "section note" })),
        )
        .await,
    )
    .await;

    // (path to the comment, comment id)
    let wrong = [
        (format!("/waterways/{w2}/comments/{river}"), river),
        (format!("/waterways/{w2}/comments/{section}"), section),
        (
            format!("/waterways/{w1}/sections/{s2}/comments/{section}"),
            section,
        ),
        (
            format!("/waterways/{w2}/sections/{s1}/comments/{section}"),
            section,
        ),
        (
            format!("/waterways/{w1}/sections/{s1}/comments/{river}"),
            river,
        ),
    ];
    for (path, _) in &wrong {
        let r = call(
            &app,
            Method::PUT,
            path,
            Who::User("mara-1"),
            Some(json!({ "body": "x" })),
        )
        .await;
        assert_eq!(r.status, StatusCode::NOT_FOUND, "PUT {path}");
        let r = call(&app, Method::DELETE, path, Who::Admin, None).await;
        assert_eq!(r.status, StatusCode::NOT_FOUND, "DELETE {path}");
    }
    let r = call(
        &app,
        Method::PUT,
        &format!("/waterways/{w2}/comments/{river}/status"),
        Who::Admin,
        Some(json!({ "status": "spam" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    // Through their own parents they work; a river's path reaches its sections' notes.
    for (path, who) in [
        (
            format!("/waterways/{w1}/comments/{river}"),
            Who::User("mara-1"),
        ),
        (
            format!("/waterways/{w1}/comments/{section}"),
            Who::User("mara-1"),
        ),
        (
            format!("/waterways/{w1}/sections/{s1}/comments/{section}"),
            Who::User("mara-1"),
        ),
    ] {
        let r = call(
            &app,
            Method::PUT,
            &path,
            who,
            Some(json!({ "body": "edited" })),
        )
        .await;
        assert_eq!(r.status, StatusCode::OK, "PUT {path} {}", r.body);
    }
    let r = call(
        &app,
        Method::PUT,
        &format!("/waterways/{w1}/comments/{river}/status"),
        Who::Admin,
        Some(json!({ "status": "merged" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    let r = call(
        &app,
        Method::DELETE,
        &format!("/waterways/{w1}/comments/{river}"),
        Who::User("mara-1"),
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
}

fn descent(extra: Value) -> Value {
    let mut body = json!({
        "start_time": "2026-07-01T09:00:00Z",
        "end_time": "2026-07-01T12:00:00Z",
        "visibility": { "type": "private" },
        "put_in_lat": 47.0,
        "put_in_lon": 10.0,
        "take_out_feature_id": null,
        "take_out_lat": 47.1,
        "take_out_lon": 10.1,
        "sections": [],
    });
    for (k, v) in extra.as_object().unwrap() {
        body[k] = v.clone();
    }
    body
}

#[sqlx::test]
async fn descent_text_and_coordinates_are_bounded(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let who = Who::User("mara-1");
    let ok = call(
        &app,
        Method::POST,
        "/descents",
        who,
        Some(descent(json!({ "name": "n".repeat(255) }))),
    )
    .await;
    assert_eq!(ok.status, StatusCode::CREATED, "{}", ok.body);
    let id = ok.body["id"].as_i64().unwrap();

    for (extra, target) in [
        (json!({ "name": "n".repeat(256) }), "name"),
        (json!({ "note": "n".repeat(10_001) }), "note"),
        (json!({ "put_in_label": "l".repeat(256) }), "put_in_label"),
        (json!({ "put_in_lat": 999.0 }), "put_in_lat"),
        (json!({ "take_out_lon": -181.0 }), "take_out_lon"),
    ] {
        let r = call(
            &app,
            Method::POST,
            "/descents",
            who,
            Some(descent(extra.clone())),
        )
        .await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "POST {extra}");
        assert_eq!(r.body["error"]["target"], target);
        let patch = extra.clone();
        let r = call(
            &app,
            Method::PATCH,
            &format!("/descents/{id}"),
            who,
            Some(patch),
        )
        .await;
        // A lone coordinate also fails the pairing rule, still a 400.
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "PATCH {extra}");
    }
}

#[sqlx::test]
async fn the_user_list_is_paged_and_searchable(pool: PgPool) {
    people(&pool).await;
    for i in 0..5 {
        add_user(&pool, &format!("u-{i}"), &format!("paddler{i}")).await;
    }
    let app = app(pool.clone());
    let who = Who::User("mara-1");
    let all = call(&app, Method::GET, "/users", who, None).await;
    assert_eq!(all.status, StatusCode::OK);
    assert_eq!(all.body["items"].as_array().unwrap().len(), 7);
    assert_eq!(all.body["total"], 7);

    let page = call(&app, Method::GET, "/users?per_page=2&page=2", who, None).await;
    assert_eq!(page.body["items"].as_array().unwrap().len(), 2);
    assert_eq!(
        (
            page.body["total"].as_i64(),
            page.body["total_pages"].as_i64()
        ),
        (Some(7), Some(4))
    );
    let last = call(&app, Method::GET, "/users?per_page=2&page=4", who, None).await;
    assert_eq!(last.body["items"].as_array().unwrap().len(), 1);
    let past = call(&app, Method::GET, "/users?per_page=2&page=9", who, None).await;
    assert_eq!(
        (
            past.body["items"].as_array().unwrap().len(),
            past.body["total"].as_i64()
        ),
        (0, Some(7))
    );
    let huge = call(&app, Method::GET, "/users?per_page=100000", who, None).await;
    assert_eq!(huge.status, StatusCode::OK);

    let found = call(&app, Method::GET, "/users?q=PADDLER3", who, None).await;
    let names: Vec<&str> = found
        .body
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["username"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["paddler3"]);
    let r = call(
        &app,
        Method::GET,
        &format!("/users?q={}", "x".repeat(101)),
        who,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn the_owner_keeps_the_owner_role(pool: PgPool) {
    use paddlemate_api::models::group::GroupMemberRole;
    use paddlemate_api::query::groups;
    people(&pool).await;
    let app = app(pool.clone());
    let g = id_of(
        call(
            &app,
            Method::POST,
            "/groups",
            Who::User("mara-1"),
            Some(json!({ "name": "Club" })),
        )
        .await,
    )
    .await;
    // An admin, who may add members.
    sqlx::query("INSERT INTO group_members (group_id, user_id, role, added_by) VALUES ($1, 'jon-1', 'admin', 'mara-1')")
        .bind(g)
        .execute(&pool)
        .await
        .unwrap();

    // The owner cannot demote themselves.
    let r = call(
        &app,
        Method::PUT,
        &format!("/groups/{g}/members/mara-1"),
        Who::User("mara-1"),
        Some(json!({ "role": "member" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST, "{}", r.body);
    // Nor can an admin do it by adding the owner again.
    let added = groups::add_member(&pool, g, "mara-1", GroupMemberRole::Member, "jon-1")
        .await
        .unwrap();
    assert!(added.is_none());
    let role: String = sqlx::query_scalar(
        "SELECT role::text FROM group_members WHERE group_id = $1 AND user_id = 'mara-1'",
    )
    .bind(g)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(role, "owner");

    // Other members still change.
    let r = call(
        &app,
        Method::PUT,
        &format!("/groups/{g}/members/jon-1"),
        Who::User("mara-1"),
        Some(json!({ "role": "member" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
}

#[sqlx::test]
async fn votes_need_a_pending_proposal_and_the_list_is_paged(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = id_of(
        call(
            &app,
            Method::POST,
            "/waterways",
            Who::Admin,
            Some(json!({ "name": "Inn" })),
        )
        .await,
    )
    .await;
    let mut ids = vec![];
    for text in ["one", "two", "three"] {
        let r = call(
            &app,
            Method::PUT,
            &format!("/waterways/{w}"),
            Who::User("mara-1"),
            Some(json!({ "description": text })),
        )
        .await;
        assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
        ids.push(r.body["id"].as_i64().unwrap());
    }
    let vote = |id: i64| format!("/proposals/{id}/vote");
    let r = call(
        &app,
        Method::POST,
        &vote(ids[0]),
        Who::User("jon-1"),
        Some(json!({ "vote": 1 })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);

    let r = call(
        &app,
        Method::PATCH,
        &format!("/proposals/{}", ids[0]),
        Who::Admin,
        Some(json!({ "status": "approved" })),
    )
    .await;
    assert!(r.status.is_success(), "{} {}", r.status, r.body);
    let r = call(
        &app,
        Method::POST,
        &vote(ids[0]),
        Who::User("jon-1"),
        Some(json!({ "vote": -1 })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    let r = call(
        &app,
        Method::POST,
        &vote(999_999),
        Who::User("jon-1"),
        Some(json!({ "vote": 1 })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    let all = call(&app, Method::GET, "/proposals", Who::Admin, None).await;
    assert_eq!(all.body["items"].as_array().unwrap().len(), 3);
    assert_eq!(all.body["total"], 3);
    let p1 = call(&app, Method::GET, "/proposals?per_page=2", Who::Admin, None).await;
    assert_eq!(p1.body["items"].as_array().unwrap().len(), 2);
    assert_eq!(
        (p1.body["total"].as_i64(), p1.body["total_pages"].as_i64()),
        (Some(3), Some(2))
    );
    let p2 = call(
        &app,
        Method::GET,
        "/proposals?per_page=2&page=2",
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(p2.body["items"].as_array().unwrap().len(), 1);
    let past = call(
        &app,
        Method::GET,
        "/proposals?per_page=2&page=7",
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(
        (
            past.body["items"].as_array().unwrap().len(),
            past.body["total"].as_i64()
        ),
        (0, Some(3))
    );
}

async fn upload(app: &Router, uri: &str, size: usize) -> common::Reply {
    use axum::{body::Body, extract::Request, http::header};
    use tower::ServiceExt;
    let boundary = "XBOUNDARY";
    let mut body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"kind\"\r\n\r\nphoto\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.jpg\"\r\n\
         Content-Type: image/jpeg\r\n\r\n"
    )
    .into_bytes();
    body.extend(std::iter::repeat_n(0u8, size));
    body.extend(format!("\r\n--{boundary}--\r\n").into_bytes());
    let req = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("x-test-user", "mara-1")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    common::Reply {
        status,
        body: serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    }
}

#[sqlx::test]
async fn photo_uploads_get_the_advertised_size_limit(pool: PgPool) {
    people(&pool).await;
    let app = app(pool.clone());
    let w = id_of(
        call(
            &app,
            Method::POST,
            "/waterways",
            Who::Admin,
            Some(json!({ "name": "Inn" })),
        )
        .await,
    )
    .await;
    let uri = format!("/waterways/{w}/media");
    // Past axum's 2 MB default: reaches the handler, which says what is wrong.
    let r = upload(&app, &uri, 3 * 1024 * 1024).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert!(
        !r.body["error"]["message"]
            .as_str()
            .unwrap()
            .contains("Could not read"),
        "{}",
        r.body
    );
    let r = upload(&app, &uri, 8 * 1024 * 1024 + 1).await;
    assert_eq!(r.body["error"]["message"], "Image must be 8 MB or smaller");
    // Far past the limit is refused outright.
    let r = upload(&app, &uri, 12 * 1024 * 1024).await;
    assert!(
        r.status == StatusCode::PAYLOAD_TOO_LARGE || r.status == StatusCode::BAD_REQUEST,
        "{}",
        r.status
    );
}
