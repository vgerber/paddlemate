//! Mirrors the catalogue's product photos into MEDIA_DIR.
//!
//! Every round takes the next pending photo of each host that is not on
//! cooldown, so a host sees at most one request per round and rounds are
//! `ROUND_PAUSE` apart. A 403 or 429 puts the host on a 24 hour cooldown
//! (robots.txt is not read: the makers' sites answer a bot they refuse with
//! one of those, and a robots parser is more code than that rule needs).

use std::{collections::HashSet, sync::Arc, time::Duration};

use sqlx::PgPool;

use crate::{
    media,
    query::materials::images::{self, PendingImage},
};

/// Pause between rounds; the per-host request spacing.
pub const ROUND_PAUSE: Duration = Duration::from_secs(2);
/// Hosts contacted in one round.
const ROUND_HOSTS: i64 = 8;
/// Largest download kept.
pub const MAX_BYTES: usize = 5 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: usize = 3;

/// A downloaded body.
pub struct Fetched {
    pub content_type: Option<String>,
    pub bytes: Vec<u8>,
}

#[derive(Debug)]
pub enum FetchError {
    /// The host answered with this status.
    Status(u16),
    /// Timeout, connection failure, or a body over the cap.
    Transport(String),
}

/// The network, behind a trait so tests never touch it.
pub trait Fetcher: Sync {
    fn fetch(
        &self,
        url: &str,
    ) -> impl std::future::Future<Output = Result<Fetched, FetchError>> + Send;
}

/// Whether a redirect may be followed: https, and still on an allowed host.
pub fn redirect_allowed(allowed: &HashSet<String>, url: &reqwest::Url) -> bool {
    url.scheme() == "https" && url.host_str().is_some_and(|h| allowed.contains(h))
}

/// The real fetcher. Redirects are followed only to allowed hosts.
pub struct HttpFetcher {
    client: reqwest::Client,
    allowed: Arc<std::sync::RwLock<HashSet<String>>>,
}

impl HttpFetcher {
    pub fn new() -> Self {
        let allowed: Arc<std::sync::RwLock<HashSet<String>>> = Default::default();
        let for_policy = allowed.clone();
        let policy = reqwest::redirect::Policy::custom(move |attempt| {
            let ok = attempt.previous().len() < MAX_REDIRECTS
                && for_policy
                    .read()
                    .is_ok_and(|set| redirect_allowed(&set, attempt.url()));
            if ok { attempt.follow() } else { attempt.stop() }
        });
        let client = reqwest::Client::builder()
            .user_agent("paddlemate-catalogue-mirror")
            .timeout(REQUEST_TIMEOUT)
            .redirect(policy)
            .build()
            .expect("http client");
        Self { client, allowed }
    }

    fn set_allowed(&self, hosts: &HashSet<String>) {
        if let Ok(mut set) = self.allowed.write() {
            *set = hosts.clone();
        }
    }
}

impl Default for HttpFetcher {
    fn default() -> Self {
        Self::new()
    }
}

impl Fetcher for HttpFetcher {
    async fn fetch(&self, url: &str) -> Result<Fetched, FetchError> {
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| FetchError::Transport(e.without_url().to_string()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(FetchError::Status(status.as_u16()));
        }
        if response
            .content_length()
            .is_some_and(|len| len > MAX_BYTES as u64)
        {
            return Err(FetchError::Transport("image over the size cap".into()));
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| FetchError::Transport(e.without_url().to_string()))?
        {
            if bytes.len() + chunk.len() > MAX_BYTES {
                return Err(FetchError::Transport("image over the size cap".into()));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(Fetched {
            content_type,
            bytes,
        })
    }
}

/// How one photo ended.
#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    Stored,
    /// Not fetched: the host is not allowed or the link is not https.
    Refused,
    /// The host refused us; it is on cooldown now.
    HostBlocked,
    Failed,
    /// A takedown landed while the photo was downloading.
    Withdrawn,
}

fn is_image(content_type: Option<&str>) -> bool {
    content_type
        .map(|t| t.trim().to_ascii_lowercase())
        .is_some_and(|t| t.starts_with("image/") && !t.starts_with("image/svg"))
}

/// Fetch, check and store one photo.
pub async fn mirror_one<F: Fetcher>(
    pool: &PgPool,
    fetcher: &F,
    allowed: &HashSet<String>,
    pending: &PendingImage,
) -> Result<Outcome, sqlx::Error> {
    let url_ok = reqwest::Url::parse(&pending.source_url).is_ok_and(|url| {
        redirect_allowed(allowed, &url) && url.host_str() == Some(pending.host.as_str())
    });
    if !url_ok {
        images::mark_failed(pool, pending.id, "host not allowed", true).await?;
        return Ok(Outcome::Refused);
    }

    let fetched = match fetcher.fetch(&pending.source_url).await {
        Ok(fetched) => fetched,
        Err(FetchError::Status(code @ (403 | 429))) => {
            images::block_host(pool, &pending.host, &format!("answered {code}")).await?;
            return Ok(Outcome::HostBlocked);
        }
        Err(FetchError::Status(code)) => {
            // A 5xx may pass; any other status will not.
            let permanent = code < 500;
            images::mark_failed(pool, pending.id, &format!("status {code}"), permanent).await?;
            return Ok(Outcome::Failed);
        }
        Err(FetchError::Transport(message)) => {
            images::mark_failed(pool, pending.id, &message, false).await?;
            return Ok(Outcome::Failed);
        }
    };

    if !is_image(fetched.content_type.as_deref()) {
        images::mark_failed(pool, pending.id, "not an image", true).await?;
        return Ok(Outcome::Failed);
    }
    if fetched.bytes.len() > MAX_BYTES {
        images::mark_failed(pool, pending.id, "image over the size cap", true).await?;
        return Ok(Outcome::Failed);
    }
    // Decoding and re-encoding strips metadata and caps the size.
    let stored = match media::store_image(&fetched.bytes).await {
        Ok(stored) => stored,
        Err(err) => {
            images::mark_failed(pool, pending.id, &err.to_string(), true).await?;
            return Ok(Outcome::Failed);
        }
    };
    if images::mark_fetched(pool, pending.id, &stored.storage_key).await? {
        Ok(Outcome::Stored)
    } else {
        media::delete_image(&stored.storage_key).await;
        Ok(Outcome::Withdrawn)
    }
}

/// One round: one photo per eligible host. Returns how many were tried.
pub async fn run_round<F: Fetcher>(pool: &PgPool, fetcher: &F) -> Result<usize, sqlx::Error> {
    let round = images::next_round(pool, ROUND_HOSTS).await?;
    if round.is_empty() {
        return Ok(0);
    }
    let allowed: HashSet<String> = images::allowed_hosts(pool).await?.into_iter().collect();
    let results = futures_util::future::join_all(
        round
            .iter()
            .map(|pending| mirror_one(pool, fetcher, &allowed, pending)),
    )
    .await;
    for (pending, result) in round.iter().zip(results) {
        match result {
            Ok(Outcome::Stored) => crate::metrics::image_mirrored("ok"),
            Ok(Outcome::Failed) => crate::metrics::image_mirrored("failed"),
            Ok(Outcome::Refused | Outcome::HostBlocked) => {
                crate::metrics::image_mirrored("blocked")
            }
            Ok(Outcome::Withdrawn) => {}
            Err(err) => {
                crate::metrics::image_mirrored("failed");
                tracing::error!("Mirroring image {} failed: {err}", pending.id);
            }
        }
    }
    Ok(round.len())
}

/// Work through the pending photos for the life of the server.
pub fn run(pool: PgPool) {
    tokio::spawn(async move {
        let fetcher = HttpFetcher::new();
        loop {
            match images::allowed_hosts(&pool).await {
                Ok(hosts) => fetcher.set_allowed(&hosts.into_iter().collect()),
                Err(err) => tracing::error!("Reading mirror hosts failed: {err}"),
            }
            let idle = match run_round(&pool, &fetcher).await {
                Ok(tried) => tried == 0,
                Err(err) => {
                    tracing::error!("Image mirror round failed: {err}");
                    true
                }
            };
            // Nothing pending is the common case once the catalogue is
            // mirrored; look again rarely.
            let pause = if idle {
                Duration::from_secs(300)
            } else {
                ROUND_PAUSE
            };
            tokio::time::sleep(pause).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed() -> HashSet<String> {
        HashSet::from(["cdn.acme.test".to_string()])
    }

    #[test]
    fn redirects_stay_on_allowed_https_hosts() {
        let url = |s: &str| reqwest::Url::parse(s).unwrap();
        assert!(redirect_allowed(
            &allowed(),
            &url("https://cdn.acme.test/a.jpg")
        ));
        assert!(!redirect_allowed(
            &allowed(),
            &url("https://evil.test/a.jpg")
        ));
        assert!(!redirect_allowed(
            &allowed(),
            &url("http://cdn.acme.test/a.jpg")
        ));
    }

    #[test]
    fn only_raster_images_pass() {
        assert!(is_image(Some("image/jpeg")));
        assert!(is_image(Some(" IMAGE/PNG; charset=x")));
        assert!(!is_image(Some("image/svg+xml")));
        assert!(!is_image(Some("text/html")));
        assert!(!is_image(None));
    }
}
