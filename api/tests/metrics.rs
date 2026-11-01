//! Prometheus metrics: the scrape route, label cardinality and the counters.
//! No database: the routes are stubs.

mod common;

use axum::{
    Router,
    body::Body,
    extract::{ConnectInfo, Request},
    http::{Method, StatusCode, header::CONTENT_TYPE},
    middleware,
    routing::{get, post},
};
use paddlemate_api::{
    layers::limit::{RateLimits, Rates, TrustedProxies, limit_requests, limit_writes},
    metrics,
};
use std::net::SocketAddr;
use tower::ServiceExt;

fn app() -> Router {
    let limits = RateLimits::new(
        Rates {
            reads: 20,
            writes: 1,
            expensive: 2,
        },
        TrustedProxies::private_ranges(),
        "/api/v1",
    );
    let api = Router::new()
        .route("/api/v1/thing/{id}", get(|| async { "ok" }))
        .route("/api/v1/open", post(|| async { "ok" }))
        .layer(middleware::from_fn_with_state(limits.clone(), limit_writes))
        .layer(middleware::from_fn(metrics::tag_client))
        .layer(middleware::from_fn(fake_auth_method))
        .layer(middleware::from_fn_with_state(limits, limit_requests));
    metrics::wrap(api, metrics::install(), None, None)
}

/// Stand-in for the sign-in layers: sets the auth method from a header.
async fn fake_auth_method(mut req: Request, next: middleware::Next) -> axum::response::Response {
    use paddlemate_api::layers::auth::{AuthMethod, AuthMethodKind};
    let kind = match req
        .headers()
        .get("x-test-kind")
        .and_then(|v| v.to_str().ok())
    {
        Some("app") => Some(AuthMethodKind::Keycloak),
        Some("token") => Some(AuthMethodKind::ApiToken { token_id: 1 }),
        _ => None,
    };
    if let Some(kind) = kind {
        req.extensions_mut().insert(AuthMethod { kind });
    }
    let req = req;
    common::fake_auth(req, next).await
}

async fn send(
    app: &Router,
    method: Method,
    uri: &str,
    headers: &[(&str, &str)],
) -> (StatusCode, String, Option<String>) {
    let mut b = Request::builder().method(method).uri(uri);
    for (k, v) in headers {
        b = b.header(*k, *v);
    }
    let mut request = b.body(Body::empty()).unwrap();
    let peer: SocketAddr = "203.0.113.7:4000".parse().unwrap();
    request.extensions_mut().insert(ConnectInfo(peer));
    let res = app.clone().oneshot(request).await.unwrap();
    let status = res.status();
    let ct = res
        .headers()
        .get(CONTENT_TYPE)
        .map(|v| v.to_str().unwrap().to_string());
    let body = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    (status, String::from_utf8(body.to_vec()).unwrap(), ct)
}

async fn scrape(app: &Router) -> String {
    send(app, Method::GET, "/metrics", &[]).await.1
}

/// Value of the series whose line starts with `prefix`, or 0.
fn value(text: &str, prefix: &str) -> f64 {
    text.lines()
        .find(|l| l.starts_with(prefix))
        .and_then(|l| l.rsplit(' ').next())
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0)
}

#[tokio::test]
async fn scrape_answers_in_text_format_with_the_request_counter() {
    let app = app();
    send(&app, Method::GET, "/api/v1/thing/1", &[]).await;
    let (status, body, ct) = send(&app, Method::GET, "/metrics", &[]).await;
    assert_eq!(status, StatusCode::OK);
    assert!(ct.unwrap().starts_with("text/plain"));
    assert!(
        body.contains("# TYPE http_requests_total counter"),
        "{body}"
    );
    assert!(
        body.contains("http_request_duration_seconds_bucket"),
        "{body}"
    );
    assert!(body.contains("http_requests_in_flight"), "{body}");
    assert!(body.contains("process_"), "{body}");
}

#[tokio::test]
async fn the_route_label_is_the_template_not_the_path() {
    let app = app();
    for id in ["9001", "9002", "9003"] {
        send(&app, Method::GET, &format!("/api/v1/thing/{id}"), &[]).await;
    }
    send(&app, Method::GET, "/no/such/path/4242", &[]).await;
    let body = scrape(&app).await;
    assert!(
        value(
            &body,
            r#"http_requests_total{method="GET",route="/api/v1/thing/{id}",status="200",client="anonymous"}"#
        ) >= 3.0,
        "{body}"
    );
    for raw in ["/9001", "/9002", "/4242"] {
        assert!(!body.contains(raw), "raw path leaked: {raw}");
    }
    assert!(body.contains(r#"route="unmatched""#), "{body}");
}

#[tokio::test]
async fn metrics_is_not_served_under_the_base_path() {
    let app = app();
    let (status, ..) = send(&app, Method::GET, "/api/v1/metrics", &[]).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn scrapes_are_not_counted_or_rate_limited() {
    let app = app();
    for _ in 0..300 {
        let (status, ..) = send(&app, Method::GET, "/metrics", &[]).await;
        assert_eq!(status, StatusCode::OK);
    }
    let body = scrape(&app).await;
    assert!(!body.contains(r#"route="/metrics""#), "{body}");
}

#[tokio::test]
async fn a_rejected_write_counts_against_its_budget() {
    let app = app();
    let before = value(
        &scrape(&app).await,
        r#"rate_limit_rejections_total{budget="write"}"#,
    );
    for _ in 0..30 {
        send(&app, Method::POST, "/api/v1/open", &[]).await;
    }
    let after = value(
        &scrape(&app).await,
        r#"rate_limit_rejections_total{budget="write"}"#,
    );
    assert!(after > before, "{before} -> {after}");
}

#[tokio::test]
async fn client_kind_is_one_of_three_and_never_an_identity() {
    let app = app();
    send(
        &app,
        Method::GET,
        "/api/v1/thing/1",
        &[("x-test-kind", "app"), ("x-test-user", "user-secret-77")],
    )
    .await;
    send(
        &app,
        Method::GET,
        "/api/v1/thing/1",
        &[("x-test-kind", "token")],
    )
    .await;
    let body = scrape(&app).await;
    assert!(body.contains(r#"client="app""#), "{body}");
    assert!(body.contains(r#"client="api_token""#), "{body}");
    assert!(!body.contains("user-secret-77"));
    assert!(!body.contains("203.0.113.7"));
}
