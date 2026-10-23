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
