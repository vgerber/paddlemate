//! Request analytics: what an event holds, that it never blocks a request and
//! that nothing runs when it is off. No database; ClickHouse only in the test
//! gated by ANALYTICS_TEST_URL.

use std::{net::SocketAddr, time::Duration};

use axum::{
    Router,
    body::Body,
    extract::{ConnectInfo, Request},
    http::StatusCode,
    middleware,
    routing::get,
};
use paddlemate_api::{
    analytics::{self, Event, Sink},
    config::{AnalyticsSettings, Config},
    layers::{
        auth::{AuthMethod, AuthMethodKind},
        limit::{RateLimits, Rates, TrustedProxies},
    },
    metrics,
};
use tokio::sync::mpsc;
use tower::ServiceExt;

fn limits() -> RateLimits {
    RateLimits::new(
        Rates {
            reads: 0,
            writes: 0,
            expensive: 0,
        },
        TrustedProxies::private_ranges(),
        "/api/v1",
    )
}

fn app(sink: Option<Sink>) -> Router {
    let api = Router::new()
        .route("/api/v1/things/{id}", get(|| async { "ok" }))
        .layer(middleware::from_fn(metrics::tag_client))
        .layer(middleware::from_fn(
            |mut req: Request, next: middleware::Next| async move {
                if req.headers().contains_key("x-token") {
                    req.extensions_mut().insert(AuthMethod {
                        kind: AuthMethodKind::ApiToken { token_id: 7 },
                    });
                }
                next.run(req).await
            },
        ));
    metrics::wrap(api, metrics::install(), None, sink)
}

fn request(uri: &str, ip: &str, ua: &str) -> Request {
    let mut req = Request::builder()
        .uri(uri)
        .header("user-agent", ua)
        .header("x-token", "secret-token-value")
        .body(Body::empty())
        .unwrap();
    let addr: SocketAddr = format!("{ip}:4000").parse().unwrap();
    req.extensions_mut().insert(ConnectInfo(addr));
    req
}

async fn collect(rx: &mut mpsc::Receiver<Event>, n: usize) -> Vec<Event> {
    let mut out = Vec::new();
    for _ in 0..n {
        let event = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("event in time")
            .expect("channel open");
        out.push(event);
    }
    out
}

#[test]
fn off_without_a_url_no_task_no_sink() {
    let config = Config::from_lookup(|name| match name {
        "DATABASE_URL"
        | "KEYCLOAK_URL"
        | "KEYCLOAK_REALM"
        | "KEYCLOAK_AUDIENCE"
        | "KEYCLOAK_CLIENT_ID"
        | "KEYCLOAK_CLIENT_SECRET" => Some("x".to_string()),
        _ => None,
    })
    .unwrap();
    assert!(config.analytics.is_none());
    assert!(analytics::start(&config, &limits()).is_none());
}

#[tokio::test]
async fn events_hold_template_route_client_and_no_identity() {
    let (tx, mut rx) = mpsc::channel(16);
    let app = app(Some(Sink::new(tx, limits())));
    for id in 1..=3 {
        let uri = format!("/api/v1/things/{id}?q=weser&page=2&secret=abc&user_id=9");
        let res = app
            .clone()
            .oneshot(request(&uri, "203.0.113.7", "curl/8.5.0"))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
    let events = collect(&mut rx, 3).await;
    for event in &events {
        assert_eq!(event.route, "/api/v1/things/{id}");
        assert_eq!(event.client, "api_token");
        assert_eq!(event.ua_family, "curl");
        assert_eq!(event.status, 200);
        let json = serde_json::to_string(event).unwrap();
        for secret in [
            "203.0.113.7",
            "secret-token-value",
            "abc",
            "user_id",
            "curl/8",
        ] {
            assert!(!json.contains(secret), "{secret} leaked into {json}");
        }
        assert_eq!(event.query.len(), 2);
    }
    assert_eq!(events[0].caller, events[2].caller);
}

#[tokio::test]
async fn callers_differ_by_address() {
    let (tx, mut rx) = mpsc::channel(16);
    let app = app(Some(Sink::new(tx, limits())));
    for ip in ["203.0.113.7", "203.0.113.8"] {
        app.clone()
            .oneshot(request("/api/v1/things/1", ip, "ua"))
            .await
            .unwrap();
    }
    let events = collect(&mut rx, 2).await;
    assert_ne!(events[0].caller, events[1].caller);
}

#[tokio::test]
async fn unmatched_paths_use_the_placeholder_route() {
    let (tx, mut rx) = mpsc::channel(16);
    let app = app(Some(Sink::new(tx, limits())));
    app.oneshot(request("/api/v1/wp-login.php", "203.0.113.7", "x"))
        .await
        .unwrap();
    let event = collect(&mut rx, 1).await.remove(0);
    assert_eq!(event.route, metrics::UNMATCHED);
    assert_eq!(event.status, 404);
}

#[tokio::test]
async fn a_full_queue_drops_events_and_requests_still_answer() {
    let (tx, _rx) = mpsc::channel(1);
    let app = app(Some(Sink::new(tx, limits())));
    for _ in 0..5 {
        let res = tokio::time::timeout(
            Duration::from_millis(500),
            app.clone()
                .oneshot(request("/api/v1/things/1", "203.0.113.7", "ua")),
        )
        .await
        .expect("request not blocked")
        .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
    let text = metrics::install().render();
    let dropped = text
        .lines()
        .find(|l| l.starts_with("analytics_events_dropped_total"))
        .expect("drop counter exported");
    let count: f64 = dropped.rsplit(' ').next().unwrap().parse().unwrap();
    assert!(count >= 4.0, "{dropped}");
}

#[tokio::test]
async fn clickhouse_down_requests_answer_and_batches_are_counted_dropped() {
    let (tx, rx) = mpsc::channel(analytics::QUEUE);
    paddlemate_api::jobs::analytics::run(
        AnalyticsSettings {
            url: "http://127.0.0.1:1".into(),
            user: None,
            password: None,
            database: "paddlemate".into(),
        },
        rx,
    );
    let app = app(Some(Sink::new(tx, limits())));
    let before = dropped_total();
    for _ in 0..3 {
        let res = tokio::time::timeout(
            Duration::from_millis(500),
            app.clone()
                .oneshot(request("/api/v1/things/1", "203.0.113.7", "ua")),
        )
        .await
        .expect("request not blocked")
        .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
    let wait = paddlemate_api::jobs::analytics::BATCH_WAIT + Duration::from_secs(3);
    tokio::time::sleep(wait).await;
    assert!(dropped_total() >= before + 3.0);
}

fn dropped_total() -> f64 {
    metrics::install()
        .render()
        .lines()
        .find(|l| l.starts_with("analytics_events_dropped_total"))
        .and_then(|l| l.rsplit(' ').next()?.parse().ok())
        .unwrap_or(0.0)
}

/// Needs a ClickHouse: ANALYTICS_TEST_URL, ANALYTICS_TEST_USER and
/// ANALYTICS_TEST_PASSWORD. Skipped (passes) without them.
#[tokio::test]
async fn n_requests_become_n_rows_in_clickhouse() {
    let Ok(url) = std::env::var("ANALYTICS_TEST_URL") else {
        return;
    };
    let user = std::env::var("ANALYTICS_TEST_USER").ok();
    let password = std::env::var("ANALYTICS_TEST_PASSWORD").ok();
    let database = "paddlemate_test".to_string();
    let (tx, rx) = mpsc::channel(analytics::QUEUE);
    paddlemate_api::jobs::analytics::run(
        AnalyticsSettings {
            url: url.clone(),
            user: user.clone(),
            password: password.clone(),
            database: database.clone(),
        },
        rx,
    );
    let app = app(Some(Sink::new(tx, limits())));
    let marker = format!("it{}", std::process::id());
    for _ in 0..7 {
        app.clone()
            .oneshot(request(
                &format!("/api/v1/things/1?q={marker}"),
                "203.0.113.7",
                "curl/8",
            ))
            .await
            .unwrap();
    }
    tokio::time::sleep(paddlemate_api::jobs::analytics::BATCH_WAIT + Duration::from_secs(2)).await;
    let sql = format!(
        "SELECT count(), uniqExact(caller), any(route), any(client) FROM {database}.api_events WHERE query['q'] = '{marker}' FORMAT TSV"
    );
    let mut req = reqwest::Client::new().post(&url).body(sql);
    if let Some(user) = user {
        req = req.basic_auth(user, password);
    }
    let text = req.send().await.unwrap().text().await.unwrap();
    assert_eq!(
        text.trim(),
        "7\t1\t/api/v1/things/{id}\tapi_token",
        "{text}"
    );
}

#[tokio::test]
async fn nested_routers_report_their_full_template() {
    let (tx, mut rx) = mpsc::channel(4);
    let inner = Router::new()
        .route("/{id}/gauges", get(|| async { "ok" }))
        .layer(middleware::from_fn(metrics::tag_route));
    let api = Router::new().nest_service("/api/v1/waterways", inner);
    let app = metrics::wrap(api, metrics::install(), None, Some(Sink::new(tx, limits())));
    app.oneshot(request("/api/v1/waterways/5/gauges", "203.0.113.7", "ua"))
        .await
        .unwrap();
    let event = collect(&mut rx, 1).await.remove(0);
    assert_eq!(event.route, "/api/v1/waterways/{id}/gauges");
}
