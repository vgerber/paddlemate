//! Region search parents and the neighbour named on each country border.

use std::sync::Arc;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::Request,
    http::StatusCode,
};
use moka::future::Cache;
use paddlemate_api::{
    routes::geo::geo_routes,
    state::{AppState, KeycloakState},
};
use serde_json::Value;
use sqlx::PgPool;
use tokio::sync::{Notify, RwLock};
use tower::ServiceExt;

fn app(pool: PgPool) -> Router {
    let state = AppState {
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
    };
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/geo", geo_routes(state))
        .finish_api(&mut api)
}

async fn get(app: &Router, uri: &str) -> (StatusCode, Value) {
    let req = Request::builder().uri(uri).body(Body::empty()).unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

/// A square region from (x0, y0) to (x1, y1).
async fn square(pool: &PgPool, name: &str, kind: &str, country: &str, b: [f64; 4]) {
    sqlx::query(
        "INSERT INTO regions (name, kind, country, geom)
         VALUES ($1, $2, $3, ST_MakeEnvelope($4, $5, $6, $7, 4326))",
    )
    .bind(name)
    .bind(kind)
    .bind(country)
    .bind(b[0])
    .bind(b[1])
    .bind(b[2])
    .bind(b[3])
    .execute(pool)
    .await
    .unwrap();
}

/// Two countries sharing the line x = 10, a state and a district in AT.
async fn world(pool: &PgPool) {
    square(pool, "AT", "country", "AT", [9.0, 46.0, 10.0, 48.0]).await;
    square(pool, "IT", "country", "IT", [10.0, 46.0, 11.0, 48.0]).await;
    square(pool, "Tirol", "state", "AT", [9.0, 46.0, 9.8, 47.0]).await;
    square(pool, "Imst", "district", "AT", [9.1, 46.1, 9.5, 46.5]).await;
    square(pool, "Otztal", "valley", "AT", [9.2, 46.2, 9.3, 46.3]).await;
    square(pool, "Alpen", "range", "AT", [9.0, 46.0, 9.9, 47.9]).await;
    // Its bounding box covers the district's centre, the area itself does not.
    sqlx::query(
        "INSERT INTO regions (name, kind, country, geom) VALUES ('Sliver', 'state', 'AT',
         ST_GeomFromText('POLYGON((9.6 46.0, 9.0 46.9, 9.6 46.9, 9.6 46.0))', 4326))",
    )
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test]
async fn search_lists_the_parent_chain(pool: PgPool) {
    world(&pool).await;
    let app = app(pool);

    let (status, body) = get(&app, "/geo/regions?q=imst").await;
    assert_eq!(status, StatusCode::OK);
    let parents = body[0]["parents"].as_array().unwrap();
    let chain: Vec<_> = parents
        .iter()
        .map(|p| (p["kind"].as_str().unwrap(), p["name"].as_str().unwrap()))
        .collect();
    assert_eq!(chain, [("state", "Tirol"), ("country", "AT")]);

    let (_, body) = get(&app, "/geo/regions?q=otztal").await;
    let kinds: Vec<_> = body[0]["parents"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["kind"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(kinds, ["district", "state", "country"]);

    // A range spans states, so it lists its country only.
    let (_, body) = get(&app, "/geo/regions?q=alpen").await;
    let kinds: Vec<_> = body[0]["parents"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["kind"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(kinds, ["country"]);

    // A state's parent is its country, never a sibling state or itself.
    let (_, body) = get(&app, "/geo/regions?q=tirol").await;
    assert_eq!(body[0]["parents"].as_array().unwrap().len(), 1);
}

#[sqlx::test]
async fn border_names_the_country_on_the_other_side(pool: PgPool) {
    world(&pool).await;
    let app = app(pool);
    let (status, body) = get(&app, "/geo/region-outlines?bbox=46.5,9.5,47.5,10.5").await;
    assert_eq!(status, StatusCode::OK);
    let countries = body["countries"].as_array().unwrap();
    let neighbours = |code: &str| -> Vec<String> {
        countries
            .iter()
            .find(|c| c["country"] == code)
            .unwrap()["neighbours"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_str().unwrap().to_owned())
            .collect()
    };
    assert_eq!(neighbours("AT"), ["IT"]);
    assert_eq!(neighbours("IT"), ["AT"]);
}

#[sqlx::test]
async fn border_far_from_any_country_has_no_neighbour(pool: PgPool) {
    square(&pool, "AT", "country", "AT", [9.0, 46.0, 10.0, 48.0]).await;
    square(&pool, "FR", "country", "FR", [0.0, 46.0, 1.0, 48.0]).await;
    let app = app(pool);
    let (_, body) = get(&app, "/geo/region-outlines?bbox=46.5,9.5,47.5,10.5").await;
    let at = &body["countries"][0];
    assert_eq!(at["country"], "AT");
    assert!(at["neighbours"].as_array().unwrap().is_empty());
}
