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
    layers::rejection::envelope_rejections,
    models::region::RegionKind,
    query,
    routes::geo::geo_routes,
    state::{AppState, KeycloakState},
};
use serde_json::Value;
use sqlx::PgPool;
use tokio::sync::{Notify, RwLock};
use tower::ServiceExt;

/// Marks the ground the tests browse as already fetched, so no request starts
/// a fill and the tests never reach Overpass.
async fn cover_tiles(pool: &PgPool) {
    sqlx::query(
        "INSERT INTO region_tiles (tier, x, y)
         SELECT t.tier, x, y
         FROM (VALUES ('countries', 8.0), ('states', 4.0), ('ranges', 2.0),
                      ('districts', 1.0), ('valleys', 0.25)) AS t(tier, size),
              generate_series(floor(0 / t.size)::int, floor(16 / t.size)::int) AS x,
              generate_series(floor(40 / t.size)::int, floor(52 / t.size)::int) AS y",
    )
    .execute(pool)
    .await
    .unwrap();
}

async fn app(pool: PgPool) -> Router {
    cover_tiles(&pool).await;
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
        .layer(axum::middleware::from_fn(envelope_rejections))
        .finish_api(&mut api)
}

async fn get(app: &Router, uri: &str) -> (StatusCode, Value) {
    let req = Request::builder().uri(uri).body(Body::empty()).unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), usize::MAX).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
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
    let app = app(pool).await;

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
    let app = app(pool).await;
    let (status, body) = get(&app, "/geo/region-outlines?bbox=46.5,9.5,47.5,10.5").await;
    assert_eq!(status, StatusCode::OK);
    let countries = body["countries"].as_array().unwrap();
    let neighbours = |code: &str| -> Vec<String> {
        countries.iter().find(|c| c["country"] == code).unwrap()["neighbours"]
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
    let app = app(pool).await;
    let (_, body) = get(&app, "/geo/region-outlines?bbox=46.5,9.5,47.5,10.5").await;
    let at = &body["countries"][0];
    assert_eq!(at["country"], "AT");
    assert!(at["neighbours"].as_array().unwrap().is_empty());
}

fn names(body: &Value) -> Vec<String> {
    body.as_array()
        .unwrap()
        .iter()
        .map(|r| r["name"].as_str().unwrap().to_owned())
        .collect()
}

#[sqlx::test]
async fn search_tolerates_misspellings(pool: PgPool) {
    world(&pool).await;
    let app = app(pool).await;
    // "Tirool" has an extra letter, "Otztall" a doubled one.
    let (_, body) = get(&app, "/geo/regions?q=Tirool").await;
    assert_eq!(names(&body), ["Tirol"]);
    let (_, body) = get(&app, "/geo/regions?q=Otztall").await;
    assert_eq!(names(&body), ["Otztal"]);
    // Short terms stay exact, so noise does not flood a two-letter search.
    let (_, body) = get(&app, "/geo/regions?q=Tx").await;
    assert!(names(&body).is_empty());
}

#[sqlx::test]
async fn search_finds_regions_by_english_country_name(pool: PgPool) {
    world(&pool).await;
    square(&pool, "Piemonte", "state", "IT", [10.2, 46.0, 10.8, 47.0]).await;
    let app = app(pool).await;
    let (_, body) = get(&app, "/geo/regions?q=Austria").await;
    let found = names(&body);
    assert!(found.contains(&"Tirol".to_string()) && !found.contains(&"Piemonte".to_string()));
    // States lead, valleys come last.
    assert_eq!(found, ["Sliver", "Tirol", "Alpen", "Imst", "Otztal"]);
    // A typo of the country name still finds it.
    let (_, body) = get(&app, "/geo/regions?q=Austrria").await;
    assert!(names(&body).contains(&"Tirol".to_string()));
    // The English name finds the Italian regions.
    let (_, body) = get(&app, "/geo/regions?q=Italy").await;
    assert_eq!(names(&body), ["Piemonte"]);
}

#[sqlx::test]
async fn borders_follow_country_changes(pool: PgPool) {
    world(&pool).await;
    let pairs = |pool: PgPool| async move {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM country_borders")
            .fetch_one(&pool)
            .await
            .unwrap()
    };
    assert_eq!(pairs(pool.clone()).await, 2);
    sqlx::query("DELETE FROM regions WHERE name = 'IT'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(pairs(pool.clone()).await, 0);
}

#[sqlx::test]
async fn europe_wide_view_answers_with_borders(pool: PgPool) {
    // A ring of countries side by side, queried at the widest span the
    // browse view allows; the lookup must not depend on span or count.
    for i in 0..40 {
        let x = f64::from(i) * 0.7;
        let code = format!(
            "{}{}",
            (b'A' + (i / 26) as u8) as char,
            (b'A' + (i % 26) as u8) as char
        );
        square(&pool, &code, "country", &code, [x, 40.0, x + 0.7, 52.0]).await;
    }
    let app = app(pool).await;
    let started = std::time::Instant::now();
    let (status, body) = get(&app, "/geo/region-outlines?bbox=-80,-180,80,180").await;
    assert_eq!(status, StatusCode::OK);
    assert!(started.elapsed() < std::time::Duration::from_secs(1));
    let countries = body["countries"].as_array().unwrap();
    assert_eq!(countries.len(), 40);
    assert_eq!(countries[1]["neighbours"].as_array().unwrap().len(), 2);
}

fn outline_names(body: &Value) -> Vec<String> {
    let mut found = names(&body["regions"]);
    found.sort();
    found
}

#[sqlx::test]
async fn kinds_param_picks_the_levels(pool: PgPool) {
    world(&pool).await;
    let app = app(pool).await;
    // A one degree view would pick districts on its own.
    let view = "bbox=46.0,9.0,47.0,10.0";
    let (_, body) = get(
        &app,
        &format!("/geo/region-outlines?{view}&kinds=range,valley"),
    )
    .await;
    assert_eq!(outline_names(&body), ["Alpen", "Otztal"]);
    assert!(body["hidden_kinds"].as_array().unwrap().is_empty());
    let (_, body) = get(&app, &format!("/geo/region-outlines?{view}&kinds=state")).await;
    assert_eq!(outline_names(&body), ["Sliver", "Tirol"]);
    let (_, body) = get(&app, &format!("/geo/region-outlines?{view}")).await;
    assert_eq!(outline_names(&body), ["Imst"]);
    assert_eq!(body["filling"], false);
}

#[sqlx::test]
async fn kind_past_its_span_is_hidden_and_listed(pool: PgPool) {
    world(&pool).await;
    let app = app(pool).await;
    // Four degrees wide: valleys give up at 3, districts and states do not.
    let (status, body) = get(
        &app,
        "/geo/region-outlines?bbox=45.0,7.0,49.0,11.0&kinds=valley,district,state",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["hidden_kinds"], serde_json::json!(["valley"]));
    assert_eq!(outline_names(&body), ["Imst", "Sliver", "Tirol"]);
}

#[sqlx::test]
async fn unknown_kind_is_rejected(pool: PgPool) {
    let app = app(pool).await;
    for kinds in ["lake", "valley,country", ""] {
        let uri = format!("/geo/region-outlines?bbox=46,9,47,10&kinds={kinds}");
        let (status, body) = get(&app, &uri).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{kinds}");
        assert_eq!(body["error"]["target"], "kinds");
    }
}

#[sqlx::test]
async fn every_range_in_view_is_returned_past_the_old_cap(pool: PgPool) {
    for i in 0..200 {
        let x = 9.0 + f64::from(i % 20) * 0.04;
        let y = 46.0 + f64::from(i / 20) * 0.04;
        square(
            &pool,
            &format!("R{i}"),
            "range",
            "AT",
            [x, y, x + 0.03, y + 0.03],
        )
        .await;
    }
    let app = app(pool).await;
    let (_, body) = get(
        &app,
        "/geo/region-outlines?bbox=45.9,8.9,46.5,10.0&kinds=range",
    )
    .await;
    assert_eq!(body["regions"].as_array().unwrap().len(), 200);
}

#[sqlx::test]
async fn cap_keeps_what_is_most_inside_the_view(pool: PgPool) {
    // Huge overall, but only a corner of it is in view.
    square(&pool, "Giant", "range", "AT", [5.0, 40.0, 9.05, 46.05]).await;
    square(&pool, "Inside", "range", "AT", [9.2, 46.2, 9.4, 46.4]).await;
    let found = query::regions::in_bbox(&pool, (46.0, 9.0, 47.0, 10.0), &[RegionKind::Range], 1)
        .await
        .unwrap();
    let found: Vec<_> = found.iter().map(|r| r.name.as_str()).collect();
    assert_eq!(found, ["Inside"]);
}

#[sqlx::test]
async fn range_beside_the_view_is_not_returned(pool: PgPool) {
    // Its bounding box covers the view, the area itself does not.
    sqlx::query(
        "INSERT INTO regions (name, kind, country, geom) VALUES ('Diagonal', 'range', 'AT',
         ST_GeomFromText('POLYGON((8.0 45.0, 11.0 48.0, 11.0 47.5, 8.5 45.0, 8.0 45.0))', 4326))",
    )
    .execute(&pool)
    .await
    .unwrap();
    let app = app(pool).await;
    let (_, body) = get(
        &app,
        "/geo/region-outlines?bbox=45.0,9.5,45.5,10.0&kinds=range",
    )
    .await;
    assert!(outline_names(&body).is_empty());
}

fn long(n: usize) -> String {
    "a".repeat(n)
}

#[sqlx::test]
async fn search_term_is_bounded(pool: PgPool) {
    let app = app(pool).await;
    let (status, _) = get(&app, &format!("/geo/regions?q={}", long(100))).await;
    assert_eq!(status, StatusCode::OK);
    let (status, body) = get(&app, &format!("/geo/regions?q={}", long(101))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["target"], "q");
    // Padding does not count, so a trimmed 100 still passes.
    let (status, _) = get(&app, &format!("/geo/regions?q=%20{}%20", long(100))).await;
    assert_eq!(status, StatusCode::OK);
}

#[sqlx::test]
async fn country_filter_must_be_a_code(pool: PgPool) {
    let app = app(pool).await;
    let (status, _) = get(&app, "/geo/regions?q=imst&country=AT").await;
    assert_eq!(status, StatusCode::OK);
    let (status, body) = get(&app, "/geo/regions?q=imst&country=AUT").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["target"], "country");
}

#[sqlx::test]
async fn malformed_query_gets_the_error_envelope(pool: PgPool) {
    let app = app(pool).await;
    let (status, body) = get(&app, "/geo/region-outlines").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "validation_failed");
    assert_eq!(body["error"]["target"], "bbox");
    let (status, body) = get(&app, "/geo/regions?kind=bogus").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "validation_failed");
    let (status, body) = get(&app, "/geo/regions/abc").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "validation_failed");
}

/// Insert a country square in its own open transaction and keep it open.
async fn store_country(pool: &PgPool, code: &str, west: f64) -> sqlx::Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO regions (name, kind, country, geom)
         VALUES ($1, 'country', $1, ST_MakeEnvelope($2, 46, $3, 48, 4326))",
    )
    .bind(code)
    .bind(west)
    .bind(west + 1.0)
    .execute(&mut *tx)
    .await?;
    // Give the other writer time to start its own refresh.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    tx.commit().await
}

#[sqlx::test]
async fn concurrent_country_stores_both_land(pool: PgPool) {
    for round in 0..10 {
        let (a, b) = (format!("A{round}"), format!("B{round}"));
        let (first, second) = tokio::join!(
            store_country(&pool, &a, 9.0 + f64::from(round) * 3.0),
            store_country(&pool, &b, 10.0 + f64::from(round) * 3.0),
        );
        first.unwrap();
        second.unwrap();
        let pairs: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM country_borders WHERE country IN ($1, $2)")
                .bind(&a)
                .bind(&b)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(pairs, 2, "round {round}");
    }
}

#[sqlx::test]
async fn unchanged_outline_leaves_borders_alone(pool: PgPool) {
    world(&pool).await;
    let stamp = |pool: PgPool| async move {
        sqlx::query_scalar::<_, String>(
            "SELECT string_agg(xmin::text, ',' ORDER BY country, neighbour) FROM country_borders",
        )
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    let before = stamp(pool.clone()).await;
    sqlx::query("UPDATE regions SET geom = geom, country = country WHERE kind = 'country'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(stamp(pool.clone()).await, before);
    sqlx::query(
        "UPDATE regions SET geom = ST_MakeEnvelope(9, 46, 10.1, 48, 4326) WHERE name = 'AT'",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_ne!(stamp(pool).await, before);
}
