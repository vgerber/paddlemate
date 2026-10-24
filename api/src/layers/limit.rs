//! Per-caller request budgets.
//!
//! Three budgets, all keyed by the caller: cheap requests by address,
//! expensive reads (the ones that can make the server call Overpass or scan a
//! long span) by address on top of that, and writes by signed-in user, or by
//! address when nobody is signed in.
//!
//! The address is the peer address. Forwarded headers are read only when the
//! peer is a trusted proxy, since any client can send them. No maintained
//! crate takes a CIDR list of proxies and skips them from the right, so the
//! few lines doing that are here, built on `ipnet`.

use std::{
    net::{IpAddr, SocketAddr},
    num::NonZeroU32,
    sync::Arc,
    time::Duration,
};

use axum::{
    body::Body,
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, HeaderValue, Method, header::RETRY_AFTER},
    middleware::Next,
    response::{IntoResponse, Response},
};
use governor::{
    Quota, RateLimiter,
    clock::{Clock, DefaultClock},
    state::keyed::DefaultKeyedStateStore,
};
use ipnet::IpNet;

use crate::{error::ApiError, layers::auth::AuthToken};

/// Networks a reverse proxy reaches the API from when nothing is configured:
/// loopback and the private ranges, which covers a Docker network.
const DEFAULT_PROXIES: &str =
    "127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128,fc00::/7";

/// Who a budget is charged to.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Caller {
    Addr(IpAddr),
    User(String),
}

/// The proxies whose forwarded headers are believed.
#[derive(Clone, Debug)]
pub struct TrustedProxies(Vec<IpNet>);

impl TrustedProxies {
    /// Parses a comma separated CIDR list; a bare address is a single host.
    pub fn parse(raw: &str) -> Result<Self, String> {
        let mut nets = Vec::new();
        for part in raw.split(',').map(str::trim).filter(|p| !p.is_empty()) {
            let net = part
                .parse::<IpNet>()
                .or_else(|_| part.parse::<IpAddr>().map(IpNet::from))
                .map_err(|_| format!("invalid TRUSTED_PROXIES entry: {part}"))?;
            nets.push(net);
        }
        Ok(Self(nets))
    }

    pub fn private_ranges() -> Self {
        Self::parse(DEFAULT_PROXIES).expect("default proxy list is valid")
    }

    fn contains(&self, ip: IpAddr) -> bool {
        self.0.iter().any(|net| net.contains(&ip))
    }

    /// The caller's address. Forwarded headers count only when the peer is a
    /// trusted proxy, and then the right-most `X-Forwarded-For` entry that is
    /// not itself a proxy wins: the left-most is whatever the client wrote.
    pub fn client_ip(&self, peer: IpAddr, headers: &HeaderMap) -> IpAddr {
        let peer = peer.to_canonical();
        if !self.contains(peer) {
            return peer;
        }
        let forwarded: Vec<&str> = headers
            .get_all("x-forwarded-for")
            .iter()
            .filter_map(|v| v.to_str().ok())
            .flat_map(|v| v.split(','))
            .map(str::trim)
            .collect();
        for entry in forwarded.iter().rev() {
            match entry.parse::<IpAddr>() {
                Ok(ip) if self.contains(ip.to_canonical()) => continue,
                Ok(ip) => return ip.to_canonical(),
                Err(_) => return peer,
            }
        }
        headers
            .get("x-real-ip")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<IpAddr>().ok())
            .map(|ip| ip.to_canonical())
            .unwrap_or(peer)
    }
}

type Keyed = RateLimiter<Caller, DefaultKeyedStateStore<Caller>, DefaultClock>;

struct Budget {
    limiter: Keyed,
}

impl Budget {
    /// `per_second` requests a second with a burst of `burst`; 0 means off.
    fn new(per_second: u64, burst: u32) -> Option<Self> {
        if per_second == 0 {
            return None;
        }
        // The period must not be zero, so a rate above 1000/s refills every
        // millisecond.
        let period = Duration::from_millis((1000 / per_second).max(1));
        let quota = Quota::with_period(period)?.allow_burst(NonZeroU32::new(burst.max(1))?);
        Some(Self {
            limiter: RateLimiter::keyed(quota),
        })
    }

    /// Seconds to wait when the caller is over budget.
    fn check(&self, caller: &Caller) -> Result<(), u64> {
        self.limiter.check_key(caller).map_err(|denied| {
            let wait = denied.wait_time_from(DefaultClock::default().now());
            wait.as_secs() + 1
        })
    }
}

/// The budgets and the proxy list; cheap to clone.
#[derive(Clone)]
pub struct RateLimits {
    inner: Arc<Inner>,
}

struct Inner {
    proxies: TrustedProxies,
    base: String,
    reads: Option<Budget>,
    expensive: Option<Budget>,
    writes: Option<Budget>,
}

/// Request rates a second; 0 turns a budget off.
#[derive(Clone, Copy, Debug)]
pub struct Rates {
    pub reads: u64,
    pub writes: u64,
    pub expensive: u64,
}

impl RateLimits {
    /// `base` is the API path prefix, used to recognise expensive routes.
    pub fn new(rates: Rates, proxies: TrustedProxies, base: &str) -> Self {
        Self {
            inner: Arc::new(Inner {
                proxies,
                base: base.trim_end_matches('/').to_string(),
                reads: Budget::new(rates.reads, (rates.reads.saturating_mul(5)) as u32),
                expensive: Budget::new(rates.expensive, 10),
                writes: Budget::new(rates.writes, 10),
            }),
        }
    }

    /// Reads `RATE_LIMIT_PER_SECOND` (20), `WRITE_RATE_LIMIT_PER_SECOND` (1),
    /// `EXPENSIVE_RATE_LIMIT_PER_SECOND` (2) and `TRUSTED_PROXIES`.
    pub fn from_env(base: &str) -> Self {
        let rate = |name: &str, default: u64| {
            std::env::var(name)
                .ok()
                .and_then(|raw| raw.trim().parse::<u64>().ok())
                .unwrap_or(default)
        };
        let proxies = match std::env::var("TRUSTED_PROXIES") {
            Ok(raw) if !raw.trim().is_empty() => {
                TrustedProxies::parse(&raw).expect("TRUSTED_PROXIES must be a CIDR list")
            }
            _ => TrustedProxies::private_ranges(),
        };
        let rates = Rates {
            reads: rate("RATE_LIMIT_PER_SECOND", 20),
            writes: rate("WRITE_RATE_LIMIT_PER_SECOND", 1),
            expensive: rate("EXPENSIVE_RATE_LIMIT_PER_SECOND", 2),
        };
        tracing::info!(
            "Rate limit per caller: reads {}/s, writes {}/s, expensive reads {}/s (0 is off)",
            rates.reads,
            rates.writes,
            rates.expensive
        );
        match std::env::var("TRUSTED_PROXIES") {
            Ok(raw) if !raw.trim().is_empty() => {
                tracing::info!("Caller address: forwarded headers trusted from {raw}")
            }
            _ => tracing::info!(
                "Caller address: forwarded headers trusted from private ranges (TRUSTED_PROXIES unset)"
            ),
        }
        Self::new(rates, proxies, base)
    }

    /// Forgets callers whose budget has refilled; run it now and then.
    pub fn prune(&self) {
        for budget in [&self.inner.reads, &self.inner.expensive, &self.inner.writes]
            .into_iter()
            .flatten()
        {
            budget.limiter.retain_recent();
            budget.limiter.shrink_to_fit();
        }
    }

    fn addr(&self, req: &Request<Body>) -> Caller {
        let peer = req
            .extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|info| info.0.ip())
            .unwrap_or(IpAddr::from([0, 0, 0, 0]));
        Caller::Addr(self.inner.proxies.client_ip(peer, req.headers()))
    }

    /// Reads that can make the server call Overpass or fill regions, or sum a
    /// long span of readings.
    fn is_expensive(&self, req: &Request<Body>) -> bool {
        if req.method() != Method::GET {
            return false;
        }
        let path = req.uri().path();
        let Some(rest) = path.strip_prefix(self.inner.base.as_str()) else {
            return false;
        };
        let segs: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
        matches!(
            segs.as_slice(),
            ["geo", "regions" | "region-outlines" | "river-segments", ..]
                | ["waterways", _, "geometry"]
                | [.., "readings", "summary"]
        )
    }
}

fn is_write(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

fn too_many(wait: u64) -> Response {
    let mut res =
        ApiError::too_many_requests(format!("Too many requests, retry in {wait}s")).into_response();
    if let Ok(value) = HeaderValue::from_str(&wait.to_string()) {
        res.headers_mut().insert(RETRY_AFTER, value);
    }
    res
}

/// Outer layer: charges every request to the cheap budget by address, and
/// expensive reads to their own budget as well.
pub async fn limit_requests(
    State(limits): State<RateLimits>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let caller = limits.addr(&req);
    if let Some(budget) = &limits.inner.reads {
        if let Err(wait) = budget.check(&caller) {
            return too_many(wait);
        }
    }
    if let Some(budget) = &limits.inner.expensive {
        if limits.is_expensive(&req) {
            if let Err(wait) = budget.check(&caller) {
                return too_many(wait);
            }
        }
    }
    next.run(req).await
}

/// Inner layer, after sign-in: charges writes to the signed-in user, or to
/// the address when there is none.
pub async fn limit_writes(
    State(limits): State<RateLimits>,
    req: Request<Body>,
    next: Next,
) -> Response {
    if let Some(budget) = &limits.inner.writes {
        if is_write(req.method()) {
            let caller = match req.extensions().get::<AuthToken>() {
                Some(token) => Caller::User(token.user_id().to_string()),
                None => limits.addr(&req),
            };
            if let Err(wait) = budget.check(&caller) {
                return too_many(wait);
            }
        }
    }
    next.run(req).await
}
