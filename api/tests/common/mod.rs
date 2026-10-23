//! Shared harness for the route tests that fake sign-in with a header.

#![allow(dead_code)]

use std::sync::Arc;

use axum::{
    Router,
    body::{Body, to_bytes},
    extract::Request,
    http::{Method, StatusCode, header},
    middleware::Next,
    response::Response,
};
use axum_keycloak_auth::{
    decode::{Email, KeycloakToken, Profile, ProfileAndEmail},
    role::KeycloakRole,
};
use moka::future::Cache;
use paddlemate_api::{
    layers::auth::AuthToken,
    state::{AppState, KeycloakState},
};
use serde_json::Value;
use sqlx::PgPool;
use tokio::sync::{Notify, RwLock};
use tower::ServiceExt;

pub fn state(pool: PgPool) -> AppState {
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

pub fn token(user_id: &str, admin: bool) -> AuthToken {
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
pub async fn fake_auth(mut req: Request, next: Next) -> Response {
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

#[derive(Clone, Copy)]
pub enum Who {
    Anyone,
    Admin,
    User(&'static str),
}

pub struct Reply {
    pub status: StatusCode,
    pub body: Value,
}

pub const ADMIN: &str = "admin-1";

pub async fn add_user(pool: &PgPool, id: &str, name: &str) {
    sqlx::query("INSERT INTO users (id, username) VALUES ($1, $2)")
        .bind(id)
        .bind(name)
        .execute(pool)
        .await
        .unwrap();
}

/// An admin and one ordinary contributor.
pub async fn people(pool: &PgPool) {
    add_user(pool, ADMIN, "root").await;
    add_user(pool, "mara-1", "mara").await;
}

pub async fn call(app: &Router, method: Method, uri: &str, who: Who, body: Option<Value>) -> Reply {
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

pub async fn get(app: &Router, uri: &str) -> Reply {
    call(app, Method::GET, uri, Who::Anyone, None).await
}
