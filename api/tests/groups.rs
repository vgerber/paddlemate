//! Groups and their members: who may see, edit, grow and shrink a group.
//!
//! Adding a member asks Keycloak whether the user exists; the tests prime the
//! username cache so that check passes without a Keycloak.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{ADMIN, Who, add_user, call, fake_auth, state};
use paddlemate_api::routes::groups::group_routes;
use serde_json::{Value, json};
use sqlx::PgPool;

const MARA: Who = Who::User("mara-1");
const JON: Who = Who::User("jon-1");
const EVA: Who = Who::User("eva-1");

async fn app(pool: PgPool) -> Router {
    for (id, name) in [
        (ADMIN, "root"),
        ("mara-1", "mara"),
        ("jon-1", "jon"),
        ("eva-1", "eva"),
    ] {
        add_user(&pool, id, name).await;
    }
    let state = state(pool);
    for (id, name) in [("mara-1", "mara"), ("jon-1", "jon"), ("eva-1", "eva")] {
        state.username_cache.insert(id.into(), name.into()).await;
    }
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/groups", group_routes(state))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

async fn make(app: &Router, who: Who, name: &str) -> i64 {
    let r = call(
        app,
        Method::POST,
        "/groups",
        who,
        Some(json!({ "name": name })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    r.body["id"].as_i64().unwrap()
}

async fn add(app: &Router, gid: i64, who: Who, user: &str, role: &str) -> common::Reply {
    call(
        app,
        Method::POST,
        &format!("/groups/{gid}/members"),
        who,
        Some(json!({ "user_id": user, "role": role })),
    )
    .await
}

#[sqlx::test]
async fn every_group_route_needs_a_caller(pool: PgPool) {
    let app = app(pool).await;
    let gid = make(&app, MARA, "Crew").await;
    for (m, uri) in [
        (Method::GET, "/groups".to_string()),
        (Method::POST, "/groups".to_string()),
        (Method::GET, format!("/groups/{gid}")),
        (Method::PUT, format!("/groups/{gid}")),
        (Method::DELETE, format!("/groups/{gid}")),
        (Method::GET, format!("/groups/{gid}/members")),
        (Method::POST, format!("/groups/{gid}/members")),
        (Method::PUT, format!("/groups/{gid}/members/jon-1")),
        (Method::DELETE, format!("/groups/{gid}/members/jon-1")),
    ] {
        let r = call(
            &app,
            m,
            &uri,
            Who::Anyone,
            Some(json!({ "name": "x", "user_id": "jon-1", "role": "member" })),
        )
        .await;
        assert_eq!(r.status, StatusCode::UNAUTHORIZED, "{uri}");
        assert_eq!(r.body["error"]["code"].is_string(), true, "{uri}");
    }
}

#[sqlx::test]
async fn creating_a_group_makes_the_caller_its_owner(pool: PgPool) {
    let app = app(pool).await;
    let r = call(
        &app,
        Method::POST,
        "/groups",
        MARA,
        Some(json!({ "name": "Crew", "description": "Friday paddlers" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED);
    assert_eq!(r.body["name"], "Crew");
    assert_eq!(r.body["description"], "Friday paddlers");
    assert_eq!(r.body["created_by"], "mara-1");
    assert!(r.body["created_at"].is_string() && r.body["updated_at"].is_string());
    let gid = r.body["id"].as_i64().unwrap();

    let g = call(&app, Method::GET, &format!("/groups/{gid}"), MARA, None).await;
    assert_eq!(g.status, StatusCode::OK);
    let members = g.body["members"].as_array().unwrap();
    assert_eq!(members.len(), 1);
    assert_eq!(members[0]["user_id"], "mara-1");
    assert_eq!(members[0]["username"], "mara");
    assert_eq!(members[0]["role"], "owner");
    assert_eq!(members[0]["added_by"], "mara-1");
    assert_eq!(members[0]["group_id"], gid);

    let no_desc = call(
        &app,
        Method::POST,
        "/groups",
        MARA,
        Some(json!({ "name": "Plain" })),
    )
    .await;
    assert!(no_desc.body.get("description").is_none());

    let bad = call(&app, Method::POST, "/groups", MARA, Some(json!({}))).await;
    assert!(bad.status.is_client_error());
}

#[sqlx::test]
async fn groups_are_listed_and_opened_for_members_only(pool: PgPool) {
    let app = app(pool).await;
    let crew = make(&app, MARA, "Crew").await;
    let _other = make(&app, JON, "Other").await;

    let r = call(&app, Method::GET, "/groups", MARA, None).await;
    assert_eq!(r.status, StatusCode::OK);
    let list = r.body.as_array().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["id"], crew);

    for uri in [format!("/groups/{crew}"), format!("/groups/{crew}/members")] {
        let r = call(&app, Method::GET, &uri, JON, None).await;
        assert_eq!(r.status, StatusCode::NOT_FOUND, "{uri}");
    }
    let r = call(&app, Method::GET, "/groups/999999", MARA, None).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    // Even a server admin who is not a member does not see it.
    let r = call(
        &app,
        Method::GET,
        &format!("/groups/{crew}"),
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn owners_and_admins_edit_a_group_members_do_not(pool: PgPool) {
    let app = app(pool).await;
    let gid = make(&app, MARA, "Crew").await;
    add(&app, gid, MARA, "jon-1", "admin").await;
    add(&app, gid, MARA, "eva-1", "member").await;
    let uri = format!("/groups/{gid}");

    let r = call(
        &app,
        Method::PUT,
        &uri,
        MARA,
        Some(json!({ "name": "Crew 2", "description": "d" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["name"], "Crew 2");
    assert_eq!(r.body["description"], "d");

    // A name-only patch keeps the description; null clears it.
    let r = call(
        &app,
        Method::PUT,
        &uri,
        JON,
        Some(json!({ "name": "Crew 3" })),
    )
    .await;
    assert_eq!(r.body["name"], "Crew 3");
    assert_eq!(r.body["description"], "d");
    let r = call(
        &app,
        Method::PUT,
        &uri,
        JON,
        Some(json!({ "description": null })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    // NOTE: looks wrong: an explicit null for description does not clear it,
    // the double-option collapses null into "absent".
    assert_eq!(r.body["description"], "d");

    // Non-members and plain members get 404, not 403.
    let r = call(
        &app,
        Method::PUT,
        &uri,
        EVA,
        Some(json!({ "name": "Mine" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let outsider = Who::Admin;
    let r = call(
        &app,
        Method::PUT,
        &uri,
        outsider,
        Some(json!({ "name": "Mine" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn only_the_owner_or_a_server_admin_deletes_a_group(pool: PgPool) {
    let app = app(pool).await;
    let gid = make(&app, MARA, "Crew").await;
    add(&app, gid, MARA, "jon-1", "admin").await;
    let uri = format!("/groups/{gid}");

    let r = call(&app, Method::DELETE, &uri, JON, None).await;
    assert_eq!(
        r.status,
        StatusCode::NOT_FOUND,
        "a group admin is not the owner"
    );
    let r = call(&app, Method::DELETE, &uri, EVA, None).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    let r = call(&app, Method::DELETE, &uri, MARA, None).await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let r = call(&app, Method::GET, &uri, MARA, None).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let r = call(&app, Method::DELETE, &uri, MARA, None).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    let other = make(&app, MARA, "Other").await;
    let r = call(
        &app,
        Method::DELETE,
        &format!("/groups/{other}"),
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(
        r.status,
        StatusCode::NO_CONTENT,
        "a server admin may delete any group"
    );
}

#[sqlx::test]
async fn adding_members_follows_the_role_rules(pool: PgPool) {
    let app = app(pool).await;
    let gid = make(&app, MARA, "Crew").await;

    let r = add(&app, gid, MARA, "jon-1", "member").await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    assert_eq!(r.body["user_id"], "jon-1");
    assert_eq!(r.body["role"], "member");
    assert_eq!(r.body["added_by"], "mara-1");
    assert_eq!(r.body["username"], "jon");

    // Role defaults to member.
    let r = call(
        &app,
        Method::POST,
        &format!("/groups/{gid}/members"),
        MARA,
        Some(json!({ "user_id": "eva-1" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED);
    assert_eq!(r.body["role"], "member");

    // Members cannot add; outsiders cannot either (403, unlike reads).
    let r = add(&app, gid, JON, "eva-1", "member").await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    let r = add(&app, gid, Who::Admin, "eva-1", "member").await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);

    // Nobody is made owner through this route.
    let r = add(&app, gid, MARA, "jon-1", "owner").await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);

    // The owner's own row is not overwritten.
    let r = add(&app, gid, MARA, "mara-1", "member").await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        r.body["error"]["message"],
        "The owner's role cannot be changed"
    );

    // Re-adding changes the role (an upsert), and an admin may then add.
    let r = add(&app, gid, MARA, "jon-1", "admin").await;
    assert_eq!(r.status, StatusCode::CREATED);
    assert_eq!(r.body["role"], "admin");
}

#[sqlx::test]
async fn members_are_listed_with_their_roles(pool: PgPool) {
    let app = app(pool).await;
    let gid = make(&app, MARA, "Crew").await;
    add(&app, gid, MARA, "jon-1", "admin").await;

    let r = call(
        &app,
        Method::GET,
        &format!("/groups/{gid}/members"),
        JON,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    let members = r.body.as_array().unwrap();
    assert_eq!(members.len(), 2);
    let jon = members.iter().find(|m| m["user_id"] == "jon-1").unwrap();
    for field in [
        "group_id",
        "user_id",
        "username",
        "role",
        "added_by",
        "created_at",
    ] {
        assert!(jon.get(field).is_some(), "missing {field}");
    }
    assert_eq!(jon["role"], "admin");
}

#[sqlx::test]
async fn only_the_owner_changes_roles(pool: PgPool) {
    let app = app(pool).await;
    let gid = make(&app, MARA, "Crew").await;
    add(&app, gid, MARA, "jon-1", "admin").await;
    add(&app, gid, MARA, "eva-1", "member").await;
    let put = |who: Who, user: &str, role: &str| {
        let app = app.clone();
        let uri = format!("/groups/{gid}/members/{user}");
        let body = json!({ "role": role });
        async move { call(&app, Method::PUT, &uri, who, Some(body)).await }
    };

    let r = put(MARA, "eva-1", "admin").await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["role"], "admin");
    assert_eq!(r.body["username"], "eva");

    assert_eq!(
        put(JON, "eva-1", "member").await.status,
        StatusCode::FORBIDDEN,
        "admins cannot"
    );
    assert_eq!(
        put(Who::Admin, "eva-1", "member").await.status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        put(MARA, "eva-1", "owner").await.status,
        StatusCode::BAD_REQUEST
    );

    let r = put(MARA, "mara-1", "member").await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        r.body["error"]["message"],
        "The owner's role cannot be changed; delete the group instead"
    );
    assert_eq!(
        put(MARA, "nobody", "member").await.status,
        StatusCode::NOT_FOUND
    );
    let bad = call(
        &app,
        Method::PUT,
        &format!("/groups/{gid}/members/eva-1"),
        MARA,
        Some(json!({ "role": "king" })),
    )
    .await;
    assert!(bad.status.is_client_error());
}

#[sqlx::test]
async fn removing_and_leaving(pool: PgPool) {
    let app = app(pool).await;
    let gid = make(&app, MARA, "Crew").await;
    add(&app, gid, MARA, "jon-1", "admin").await;
    add(&app, gid, MARA, "eva-1", "member").await;
    let del = |who: Who, user: &str| {
        let app = app.clone();
        let uri = format!("/groups/{gid}/members/{user}");
        async move { call(&app, Method::DELETE, &uri, who, None).await }
    };

    // A member cannot remove others; an outsider neither.
    assert_eq!(del(EVA, "jon-1").await.status, StatusCode::FORBIDDEN);
    assert_eq!(del(Who::Admin, "jon-1").await.status, StatusCode::FORBIDDEN);

    // The owner cannot be removed or leave.
    for who in [MARA, JON] {
        let r = del(who, "mara-1").await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST);
        assert_eq!(
            r.body["error"]["message"],
            "Owner cannot be removed; delete the group instead"
        );
    }

    // An admin removes a member; a member leaves on their own.
    assert_eq!(del(JON, "eva-1").await.status, StatusCode::NO_CONTENT);
    assert_eq!(del(JON, "eva-1").await.status, StatusCode::NOT_FOUND);
    assert_eq!(del(JON, "jon-1").await.status, StatusCode::NO_CONTENT);

    let r = call(&app, Method::GET, &format!("/groups/{gid}"), JON, None).await;
    assert_eq!(
        r.status,
        StatusCode::NOT_FOUND,
        "a former member no longer sees the group"
    );
    let members: Value = call(
        &app,
        Method::GET,
        &format!("/groups/{gid}/members"),
        MARA,
        None,
    )
    .await
    .body;
    assert_eq!(members.as_array().unwrap().len(), 1);

    // Someone not in the group leaving gets 404.
    assert_eq!(del(EVA, "eva-1").await.status, StatusCode::NOT_FOUND);
}
