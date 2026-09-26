//! Web push: the encrypted message a browser's push service delivers to a
//! phone or desktop even when Paddlemate is closed.

use std::time::Duration;

use axum::http::Uri;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64URL};
use tokio::sync::Semaphore;
use web_push::{
    ContentEncoding, IsahcWebPushClient, PartialVapidSignatureBuilder, SubscriptionInfo,
    SubscriptionKeys, URL_SAFE_NO_PAD, Urgency, VapidSignatureBuilder, WebPushClient, WebPushError,
    WebPushMessageBuilder,
};

use crate::query::push_subscriptions::PushTarget;

/// The push services browsers subscribe through. An endpoint is a URL the
/// client hands us and we then POST to, so anything else would let a caller
/// point the server at hosts on its own network.
const PUSH_HOSTS: &[&str] = &[
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    ".push.apple.com",
    ".notify.windows.com",
];

/// A push service that does not answer in this time is given up on, so a
/// slow one cannot pile up senders.
const SEND_TIMEOUT: Duration = Duration::from_secs(10);

/// Deliveries in flight at once, across every change being pushed.
const MAX_SENDING: usize = 8;

/// The server's VAPID identity and an HTTP client to reach push services.
pub struct PushService {
    client: IsahcWebPushClient,
    signer: PartialVapidSignatureBuilder,
    subject: String,
    public_key: String,
    sending: Semaphore,
}

/// How one delivery went.
pub enum Delivery {
    Sent,
    /// The push service no longer knows the subscription: the browser
    /// dropped it, so should we.
    Gone,
    Failed(String),
}

impl PushService {
    /// Reads `VAPID_PRIVATE_KEY` (the raw P-256 key, base64url) and
    /// `VAPID_SUBJECT` (a `mailto:` or `https:` contact for push services).
    /// `None` when either is missing: this server simply does not push, and
    /// everything else works as before. The public key browsers need is
    /// derived from the private one, so the two cannot drift apart.
    pub fn from_env() -> Option<Self> {
        let key = std::env::var("VAPID_PRIVATE_KEY")
            .ok()
            .filter(|k| !k.is_empty())?;
        let subject = std::env::var("VAPID_SUBJECT")
            .ok()
            .filter(|s| !s.is_empty())?;
        Self::new(&key, subject)
    }

    /// From a raw P-256 private key (base64url) and a contact subject.
    pub fn new(key: &str, subject: String) -> Option<Self> {
        let signer = match VapidSignatureBuilder::from_base64_no_sub(key.trim(), URL_SAFE_NO_PAD) {
            Ok(s) => s,
            Err(err) => {
                tracing::error!(
                    "VAPID_PRIVATE_KEY is not a usable key, push is off: {}",
                    err
                );
                return None;
            }
        };
        let client = match IsahcWebPushClient::new() {
            Ok(c) => c,
            Err(err) => {
                tracing::error!("Could not start the push client, push is off: {}", err);
                return None;
            }
        };
        let public_key = B64URL.encode(signer.get_public_key());
        Some(Self {
            client,
            signer,
            subject,
            public_key,
            sending: Semaphore::new(MAX_SENDING),
        })
    }

    /// For `PushManager.subscribe({ applicationServerKey })`.
    pub fn public_key(&self) -> &str {
        &self.public_key
    }

    pub async fn send(&self, target: &PushTarget, payload: &[u8]) -> Delivery {
        let info = SubscriptionInfo {
            endpoint: target.endpoint.clone(),
            keys: SubscriptionKeys {
                p256dh: target.p256dh.clone(),
                auth: target.auth.clone(),
            },
        };

        let mut signature = self.signer.clone().add_sub_info(&info);
        signature.add_claim("sub", self.subject.as_str());
        let signature = match signature.build() {
            Ok(s) => s,
            Err(err) => return Delivery::Failed(err.to_string()),
        };

        let mut message = WebPushMessageBuilder::new(&info);
        message.set_payload(ContentEncoding::Aes128Gcm, payload);
        message.set_vapid_signature(signature);
        // A trip change is still worth knowing a day later, not a week.
        message.set_ttl(24 * 60 * 60);
        message.set_urgency(Urgency::Normal);
        let message = match message.build() {
            Ok(m) => m,
            Err(err) => return Delivery::Failed(err.to_string()),
        };

        let Ok(_permit) = self.sending.acquire().await else {
            return Delivery::Failed("push is shutting down".into());
        };
        match tokio::time::timeout(SEND_TIMEOUT, self.client.send(message)).await {
            Ok(Ok(())) => Delivery::Sent,
            Ok(Err(WebPushError::EndpointNotValid | WebPushError::EndpointNotFound)) => {
                Delivery::Gone
            }
            Ok(Err(err)) => Delivery::Failed(err.to_string()),
            Err(_) => Delivery::Failed("timed out".into()),
        }
    }
}

/// Whether `endpoint` is a push service's URL: https, the default port, no
/// credentials, and a host from `PUSH_HOSTS`.
pub fn is_push_endpoint(endpoint: &str) -> bool {
    if endpoint.len() > 2048 {
        return false;
    }
    let Ok(uri) = endpoint.parse::<Uri>() else {
        return false;
    };
    let Some(authority) = uri.authority() else {
        return false;
    };
    if uri.scheme_str() != Some("https")
        || authority.port().is_some()
        || authority.as_str().contains('@')
    {
        return false;
    }
    let host = authority.host().to_ascii_lowercase();
    PUSH_HOSTS
        .iter()
        .any(|allowed| match allowed.strip_prefix('.') {
            Some(domain) => host.ends_with(allowed) && host.len() > domain.len() + 1,
            None => host == *allowed,
        })
}

/// Whether the browser's keys are the shapes the encryption needs: an
/// uncompressed P-256 point and a 16-byte secret. Anything else would fail
/// on every push, forever.
pub fn are_push_keys(p256dh: &str, auth: &str) -> bool {
    let point = B64URL.decode(p256dh.trim_end_matches('='));
    let secret = B64URL.decode(auth.trim_end_matches('='));
    matches!((point, secret), (Ok(p), Ok(a)) if p.len() == 65 && p[0] == 4 && a.len() == 16)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_push_services_are_endpoints() {
        for ok in [
            "https://fcm.googleapis.com/fcm/send/abc:def",
            "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
            "https://web.push.apple.com/QGuQ",
            "https://wns2-db5p.notify.windows.com/w/?token=x",
        ] {
            assert!(is_push_endpoint(ok), "{ok}");
        }
        for bad in [
            "http://fcm.googleapis.com/fcm/send/x",
            "https://fcm.googleapis.com:8443/fcm/send/x",
            "https://user@fcm.googleapis.com/fcm/send/x",
            "https://fcm.googleapis.com.evil.example/x",
            "https://evilpush.apple.com/x",
            "https://push.apple.com/x",
            "https://192.168.1.10/admin",
            "https://localhost/x",
            "not a url",
        ] {
            assert!(!is_push_endpoint(bad), "{bad}");
        }
    }

    #[test]
    fn keys_must_have_the_right_shape() {
        let point = B64URL.encode([4u8; 65]);
        let secret = B64URL.encode([7u8; 16]);
        assert!(are_push_keys(&point, &secret));
        assert!(!are_push_keys(&B64URL.encode([4u8; 33]), &secret));
        assert!(!are_push_keys(&B64URL.encode([2u8; 65]), &secret));
        assert!(!are_push_keys(&point, &B64URL.encode([7u8; 8])));
        assert!(!are_push_keys("k", "a"));
    }
}
