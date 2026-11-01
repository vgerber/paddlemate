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
    layers::auth::{AuthMethod, AuthMethodKind},
    metrics,
};
use tokio::sync::mpsc;
use tower::ServiceExt;

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
    assert!(analytics::start(&config).is_none());
}

#[tokio::test]
async fn events_hold_template_route_client_and_no_identity() {
    let (tx, mut rx) = mpsc::channel(16);
    let app = app(Some(Sink::new(tx)));
    let ua =
        "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0 uniqueagent-77";
    for id in 1..=3 {
        let uri =
            format!("/api/v1/things/{id}?q=SomeName&page=2&secret=abc&user_id=9&category=kayak");
        let res = app
            .clone()
            .oneshot(request(&uri, "203.0.113.7", ua))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
    let events = collect(&mut rx, 3).await;
    for event in &events {
        assert_eq!(event.route, "/api/v1/things/{id}");
        assert_eq!(event.client, "api_token");
        assert_eq!((event.browser, event.os), ("firefox", "linux"));
        assert_eq!(event.status, 200);
        let json = serde_json::to_string(event).unwrap();
        for secret in [
            "203.0.113.7",
            "secret-token-value",
            "SomeName",
            "abc",
            "user_id",
            "uniqueagent",
            "Gecko",
            "121",
        ] {
            assert!(!json.contains(secret), "{secret} leaked into {json}");
        }
        assert_eq!(event.query.len(), 1);
        assert_eq!(event.query["category"], "kayak");
    }
}

#[tokio::test]
async fn unknown_enum_values_are_stored_as_other() {
    let (tx, mut rx) = mpsc::channel(4);
    let app = app(Some(Sink::new(tx)));
    app.oneshot(request(
        "/api/v1/things/1?category=SomeName&discipline=creek",
        "203.0.113.7",
        "SomeScanner/1.0 secret-id-123",
    ))
    .await
    .unwrap();
    let event = collect(&mut rx, 1).await.remove(0);
    assert_eq!(event.query["category"], "other");
    assert_eq!(event.query["discipline"], "creek");
    assert_eq!((event.browser, event.os), ("other", "other"));
    let json = serde_json::to_string(&event).unwrap();
    assert!(
        !json.contains("SomeName") && !json.contains("secret-id"),
        "{json}"
    );
}

#[tokio::test]
async fn unmatched_paths_use_the_placeholder_route() {
    let (tx, mut rx) = mpsc::channel(16);
    let app = app(Some(Sink::new(tx)));
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
    let app = app(Some(Sink::new(tx)));
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
    let app = app(Some(Sink::new(tx)));
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
    let app = app(Some(Sink::new(tx)));
    let start = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for _ in 0..7 {
        app.clone()
            .oneshot(request(
                "/api/v1/things/1?category=zzz",
                "203.0.113.7",
                "curl/8",
            ))
            .await
            .unwrap();
    }
    tokio::time::sleep(paddlemate_api::jobs::analytics::BATCH_WAIT + Duration::from_secs(2)).await;
    let sql = format!(
        "SELECT count(), any(route), any(client), any(browser), any(os), any(query['category']) FROM {database}.api_events WHERE ts >= '{start}' FORMAT TSV"
    );
    let mut req = reqwest::Client::new().post(&url).body(sql);
    if let Some(user) = user {
        req = req.basic_auth(user, password);
    }
    let text = req.send().await.unwrap().text().await.unwrap();
    assert_eq!(
        text.trim(),
        "7\t/api/v1/things/{id}\tapi_token\tcurl\tother\tother",
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
    let app = metrics::wrap(api, metrics::install(), None, Some(Sink::new(tx)));
    app.oneshot(request("/api/v1/waterways/5/gauges", "203.0.113.7", "ua"))
        .await
        .unwrap();
    let event = collect(&mut rx, 1).await.remove(0);
    assert_eq!(event.route, "/api/v1/waterways/{id}/gauges");
}
