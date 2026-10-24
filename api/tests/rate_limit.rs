//! Per-caller budgets: which key a request is charged to, and how much each
//! kind of request may spend. No database: the routes are stubs.

mod common;

use axum::{
    Router,
    body::Body,
    extract::{ConnectInfo, Request},
    http::{Method, StatusCode},
    middleware,
    routing::{get, post},
};
use common::fake_auth;
use paddlemate_api::layers::limit::{
    RateLimits, Rates, TrustedProxies, limit_requests, limit_writes,
};
use serde_json::Value;
use std::net::SocketAddr;
use tower::ServiceExt;

const READS: u64 = 20;

fn app(rates: Rates, proxies: &str) -> Router {
    let limits = RateLimits::new(rates, TrustedProxies::parse(proxies).unwrap(), "/api/v1");
    Router::new()
        .route(
            "/api/v1/waterways",
            get(|| async { "ok" }).post(|| async { "ok" }),
        )
        .route("/api/v1/geo/regions", get(|| async { "ok" }))
        .route("/api/v1/geo/region-outlines", get(|| async { "ok" }))
        .route("/api/v1/waterways/{id}/geometry", get(|| async { "ok" }))
        .route(
            "/api/v1/waterways/gauges/{g}/series/{s}/readings/summary",
            get(|| async { "ok" }),
        )
        .route("/api/v1/other", post(|| async { "ok" }))
        .layer(middleware::from_fn_with_state(limits.clone(), limit_writes))
        .layer(middleware::from_fn(fake_auth))
        .layer(middleware::from_fn_with_state(limits, limit_requests))
}

fn rates() -> Rates {
    Rates {
        reads: READS,
        writes: 1,
        expensive: 2,
    }
}

struct Req<'a> {
    method: Method,
    uri: &'a str,
    peer: &'a str,
    headers: Vec<(&'a str, &'a str)>,
}

fn req<'a>(method: Method, uri: &'a str, peer: &'a str) -> Req<'a> {
    Req {
        method,
        uri,
        peer,
        headers: vec![],
    }
}

impl<'a> Req<'a> {
    fn h(mut self, k: &'a str, v: &'a str) -> Self {
        self.headers.push((k, v));
        self
    }
}

async fn send(app: &Router, r: Req<'_>) -> axum::response::Response {
    let mut b = Request::builder().method(r.method).uri(r.uri);
    for (k, v) in r.headers {
        b = b.header(k, v);
    }
    let mut request = b.body(Body::empty()).unwrap();
    let peer: SocketAddr = format!("{}:4000", r.peer).parse().unwrap();
    request.extensions_mut().insert(ConnectInfo(peer));
    app.clone().oneshot(request).await.unwrap()
}

/// How many of `n` requests got through.
async fn passed(app: &Router, n: usize, mk: impl Fn(usize) -> Req<'static>) -> usize {
    let mut ok = 0;
    for i in 0..n {
        if send(app, mk(i)).await.status() == StatusCode::OK {
            ok += 1;
        }
    }
    ok
}

fn read(peer: &'static str) -> Req<'static> {
    req(Method::GET, "/api/v1/waterways", peer)
}

#[tokio::test]
async fn one_client_runs_out_of_reads() {
    let app = app(rates(), "10.0.0.0/8");
    let ok = passed(&app, 200, |_| read("203.0.113.5")).await;
    assert!((READS * 5..=READS * 5 + 2).contains(&(ok as u64)), "{ok}");
}

#[tokio::test]
async fn another_client_has_its_own_budget() {
    let app = app(rates(), "10.0.0.0/8");
    passed(&app, 200, |_| read("203.0.113.5")).await;
    assert_eq!(
        send(&app, read("203.0.113.6")).await.status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn spoofed_forwarding_headers_from_an_untrusted_peer_change_nothing() {
    let app = app(rates(), "10.0.0.0/8");
    let xff = passed(&app, 200, |i| {
        let v: &'static str = Box::leak(format!("198.51.100.{}", i % 250).into_boxed_str());
        read("203.0.113.5").h("x-forwarded-for", v)
    })
    .await;
    let real = passed(&app, 200, |i| {
        let v: &'static str = Box::leak(format!("198.51.101.{}", i % 250).into_boxed_str());
        read("203.0.113.5").h("x-real-ip", v)
    })
    .await;
    // The first 100 spend the whole budget; nothing is left for the second run.
    assert!((READS * 5..=READS * 5 + 2).contains(&(xff as u64)), "{xff}");
    assert!(real <= 2, "{real}");
}

#[tokio::test]
async fn a_trusted_proxy_passes_on_the_rightmost_client_address() {
    let app = app(rates(), "10.0.0.0/8");
    // The left-most entry is the client's own claim and is ignored; the
    // right-most address that is not a proxy is who the proxy saw.
    let chain = |i: usize| {
        let v: &'static str =
            Box::leak(format!("198.51.100.{i}, 203.0.113.9, 10.1.1.1").into_boxed_str());
        read("10.0.0.2").h("x-forwarded-for", v)
    };
    let ok = passed(&app, 200, chain).await as u64;
    assert!((READS * 5..=READS * 5 + 2).contains(&ok), "{ok}");
    // A different real client behind the same proxy is unaffected.
    let other = read("10.0.0.2").h("x-forwarded-for", "203.0.113.10");
    assert_eq!(send(&app, other).await.status(), StatusCode::OK);
}

#[tokio::test]
async fn a_trusted_proxy_may_send_only_x_real_ip() {
    let app = app(rates(), "10.0.0.0/8");
    let ok = passed(&app, 200, |_| {
        read("10.0.0.2").h("x-real-ip", "203.0.113.9")
    })
    .await;
    assert!((READS * 5..=READS * 5 + 2).contains(&(ok as u64)), "{ok}");
    let other = read("10.0.0.2").h("x-real-ip", "203.0.113.10");
    assert_eq!(send(&app, other).await.status(), StatusCode::OK);
}

#[test]
fn client_ip_reads_headers_only_from_trusted_peers() {
    use axum::http::HeaderMap;
    let proxies = TrustedProxies::parse("10.0.0.0/8, ::1").unwrap();
    let mut h = HeaderMap::new();
    h.insert("x-forwarded-for", "1.2.3.4, 9.9.9.9".parse().unwrap());
    let ip = |s: &str| s.parse().unwrap();
    assert_eq!(proxies.client_ip(ip("8.8.8.8"), &h), ip("8.8.8.8"));
    assert_eq!(proxies.client_ip(ip("10.0.0.1"), &h), ip("9.9.9.9"));
    assert_eq!(proxies.client_ip(ip("::ffff:10.0.0.1"), &h), ip("9.9.9.9"));
    h.insert("x-forwarded-for", "garbage".parse().unwrap());
    assert_eq!(proxies.client_ip(ip("10.0.0.1"), &h), ip("10.0.0.1"));
    assert!(TrustedProxies::parse("nonsense").is_err());
}

#[tokio::test]
async fn writes_have_their_own_budget() {
    let app = app(rates(), "10.0.0.0/8");
    let post = |_| req(Method::POST, "/api/v1/waterways", "203.0.113.5");
    assert_eq!(passed(&app, 30, post).await, 10);
    // Reads were not spent by the writes... only the cheap budget counts them.
    assert_eq!(
        send(&app, read("203.0.113.5")).await.status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn writes_are_counted_per_user_when_signed_in() {
    let app = app(rates(), "10.0.0.0/8");
    let as_user =
        |u: &'static str| req(Method::POST, "/api/v1/waterways", "203.0.113.5").h("x-test-user", u);
    assert_eq!(passed(&app, 30, |_| as_user("mara-1")).await, 10);
    // Same address, other user: own budget. Anonymous on that address too.
    assert_eq!(send(&app, as_user("jon-1")).await.status(), StatusCode::OK);
    let anon = req(Method::POST, "/api/v1/waterways", "203.0.113.5");
    assert_eq!(send(&app, anon).await.status(), StatusCode::OK);
}

#[tokio::test]
async fn a_user_keeps_the_write_budget_across_addresses() {
    let app = app(rates(), "10.0.0.0/8");
    let ok = passed(&app, 30, |i| {
        let peer: &'static str = Box::leak(format!("203.0.113.{}", i + 1).into_boxed_str());
        req(Method::POST, "/api/v1/waterways", peer).h("x-test-user", "mara-1")
    })
    .await;
    assert_eq!(ok, 10);
}

#[tokio::test]
async fn expensive_reads_have_their_own_budget() {
    let app = app(rates(), "10.0.0.0/8");
    for (peer, uri) in [
        ("203.0.113.7", "/api/v1/geo/regions?x=1"),
        ("203.0.113.8", "/api/v1/geo/region-outlines"),
        ("203.0.113.9", "/api/v1/waterways/7/geometry"),
        (
            "203.0.113.10",
            "/api/v1/waterways/gauges/1/series/2/readings/summary",
        ),
    ] {
        let ok = passed(&app, 30, |_| req(Method::GET, uri, peer)).await;
        assert!((10..=11).contains(&ok), "{uri}: {ok}");
    }
    // Cheap reads from that caller still work: the expensive budget is extra.
    assert_eq!(
        send(&app, read("203.0.113.7")).await.status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn too_many_requests_carries_retry_after_and_the_envelope() {
    let app = app(rates(), "10.0.0.0/8");
    passed(&app, 120, |_| read("203.0.113.5")).await;
    let res = send(&app, read("203.0.113.5")).await;
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
    let wait: u64 = res.headers()["retry-after"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!(wait >= 1);
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["error"]["code"], "too_many_requests");
    assert!(body["error"]["message"].is_string());
}

#[tokio::test]
async fn a_write_429_has_retry_after_too() {
    let app = app(rates(), "10.0.0.0/8");
    passed(&app, 11, |_| {
        req(Method::POST, "/api/v1/other", "203.0.113.5")
    })
    .await;
    let res = send(&app, req(Method::POST, "/api/v1/other", "203.0.113.5")).await;
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(res.headers().contains_key("retry-after"));
}

#[tokio::test]
async fn zero_turns_a_budget_off() {
    let off = Rates {
        reads: 0,
        writes: 0,
        expensive: 0,
    };
    let app = app(off, "10.0.0.0/8");
    assert_eq!(passed(&app, 300, |_| read("203.0.113.5")).await, 300);
}
