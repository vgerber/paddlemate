//! Prometheus metrics, served at `/metrics` outside the API base path.
//!
//! Built on `metrics` and `metrics-exporter-prometheus` (the standard pair)
//! with `metrics-process` for CPU, memory and fd gauges. The request
//! middleware is a few lines here instead of `axum-prometheus`, which has no
//! way to add the client-kind label or to keep the route label bounded the
//! way this API needs.
//!
//! Labels never carry a user id, address, token or raw path: `route` is the
//! matched template (or `unmatched`), `client` is one of three fixed values.

use std::{sync::OnceLock, time::Instant};

use axum::{
    Router,
    body::Body,
    extract::{MatchedPath, Request, State},
    http::{HeaderValue, StatusCode, header::CONTENT_TYPE},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::get,
};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use sqlx::PgPool;

use crate::analytics::Sink;
use crate::layers::auth::{AuthMethod, AuthMethodKind};

/// Route label for requests no route matched (404s, scanners).
pub const UNMATCHED: &str = "unmatched";

/// Request duration buckets in seconds.
const BUCKETS: &[f64] = &[
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
];

/// How a request authenticated, for the `client` label.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClientKind {
    Anonymous,
    ApiToken,
    App,
}

impl ClientKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Anonymous => "anonymous",
            Self::ApiToken => "api_token",
            Self::App => "app",
        }
    }
}

/// The matched route template, carried out on the response by `tag_route`.
/// The outermost layer runs before routing, so only a layer inside the
/// routers can see the template of a nested route.
#[derive(Clone, Debug)]
struct RouteTemplate(String);

/// Installs the global recorder once and returns its handle.
pub fn install() -> PrometheusHandle {
    static HANDLE: OnceLock<PrometheusHandle> = OnceLock::new();
    HANDLE
        .get_or_init(|| {
            PrometheusBuilder::new()
                .set_buckets(BUCKETS)
                .expect("buckets are not empty")
                .install_recorder()
                .expect("metrics recorder installs once")
        })
        .clone()
}

/// Counts a request turned away by a rate budget (`general`, `write` or
/// `expensive`).
pub fn rate_limited(budget: &'static str) {
    metrics::counter!("rate_limit_rejections_total", "budget" => budget).increment(1);
}

/// Counts a submitted proposal. The type comes from the database, so only
/// known entity types are used as a label.
pub fn proposal_submitted(entity_type: &str) {
    let label = match entity_type {
        "waterway" | "water_section" | "feature" | "material" => entity_type.to_string(),
        _ => "other".to_string(),
    };
    metrics::counter!("proposals_submitted_total", "entity_type" => label).increment(1);
}

/// Counts how a material image fetch ended (`ok`, `failed` or `blocked`).
pub fn image_mirrored(result: &'static str) {
    metrics::counter!("material_image_mirror_total", "result" => result).increment(1);
}

/// Inner layer, after sign-in: tells the outer request metrics who called,
/// through a response extension.
pub async fn tag_client(req: Request<Body>, next: Next) -> Response {
    let kind = match req.extensions().get::<AuthMethod>().map(|m| &m.kind) {
        Some(AuthMethodKind::Keycloak) => ClientKind::App,
        Some(AuthMethodKind::ApiToken { .. }) => ClientKind::ApiToken,
        None => ClientKind::Anonymous,
    };
    let mut res = next.run(req).await;
    res.extensions_mut().insert(kind);
    res
}

/// Layer each nested router with this, at the nesting site: inside the
/// router it runs after routing and sees the full route template, which the
/// outermost layer cannot (it runs before nested routers match).
pub async fn tag_route(req: Request<Body>, next: Next) -> Response {
    let route = req.extensions().get::<MatchedPath>().cloned();
    let mut res = next.run(req).await;
    // The innermost layer answered first and knows the real template.
    if let (Some(route), None) = (route, res.extensions().get::<RouteTemplate>()) {
        res.extensions_mut()
            .insert(RouteTemplate(route.as_str().to_string()));
    }
    res
}

struct InFlight;

impl InFlight {
    fn enter() -> Self {
        metrics::gauge!("http_requests_in_flight").increment(1.0);
        Self
    }
}

impl Drop for InFlight {
    fn drop(&mut self) {
        metrics::gauge!("http_requests_in_flight").decrement(1.0);
    }
}

/// Outermost layer on the API router: counts and times every request.
/// With a sink, every request also becomes one analytics event.
pub async fn track_requests(
    State(analytics): State<Option<Sink>>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let _in_flight = InFlight::enter();
    let start = Instant::now();
    let method = req.method().as_str().to_string();
    let outer_route = req
        .extensions()
        .get::<MatchedPath>()
        .map(|p| p.as_str().to_string());
    let seen = analytics.as_ref().map(|sink| sink.see(&req, &method));
    let res = next.run(req).await;
    let route = res
        .extensions()
        .get::<RouteTemplate>()
        .map(|r| r.0.clone())
        .or(outer_route)
        .unwrap_or_else(|| UNMATCHED.to_string());
    let client = res
        .extensions()
        .get::<ClientKind>()
        .copied()
        .unwrap_or(ClientKind::Anonymous);
    metrics::counter!(
        "http_requests_total",
        "method" => method.clone(),
        "route" => route.clone(),
        "status" => res.status().as_u16().to_string(),
        "client" => client.as_str(),
    )
    .increment(1);
    metrics::histogram!("http_request_duration_seconds", "method" => method, "route" => route.clone())
        .record(start.elapsed().as_secs_f64());
    if let (Some(sink), Some(seen)) = (&analytics, seen) {
        let bytes = axum::body::HttpBody::size_hint(res.body())
            .exact()
            .unwrap_or(0);
        sink.record(seen, &route, res.status().as_u16(), client, bytes);
    }
    res
}

#[derive(Clone)]
struct Scrape {
    handle: PrometheusHandle,
    pool: Option<PgPool>,
    process: std::sync::Arc<metrics_process::Collector>,
}

async fn scrape(State(s): State<Scrape>) -> Response {
    s.process.collect();
    if let Some(pool) = &s.pool {
        metrics::gauge!("db_pool_connections").set(pool.size() as f64);
        metrics::gauge!("db_pool_idle_connections").set(pool.num_idle() as f64);
    }
    let mut res = (StatusCode::OK, s.handle.render()).into_response();
    res.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/plain; version=0.0.4; charset=utf-8"),
    );
    res
}

/// Counts every request to `app`, then adds `/metrics` next to it. The route
/// is merged after the layer, so scrapes are not counted, and callers must
/// add their rate limits to `app` first, so scrapes are not limited.
pub fn wrap(
    app: Router,
    handle: PrometheusHandle,
    pool: Option<PgPool>,
    analytics: Option<Sink>,
) -> Router {
    // An explicit fallback, or the default one skips the layer and 404s are
    // not counted.
    app.fallback(|| async { StatusCode::NOT_FOUND })
        .layer(axum::middleware::from_fn_with_state(
            analytics,
            track_requests,
        ))
        .merge(route(handle, pool))
}

/// The `/metrics` route at the root of the host. It is merged in after the
/// request layers, so it is neither counted nor rate limited. A reverse proxy
/// that forwards only the API base path never exposes it.
fn route(handle: PrometheusHandle, pool: Option<PgPool>) -> Router {
    let collector = metrics_process::Collector::default();
    collector.describe();
    Router::new()
        .route("/metrics", get(scrape))
        .with_state(Scrape {
            handle,
            pool,
            process: std::sync::Arc::new(collector),
        })
}
