use moka::future::Cache;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub struct AdminToken {
    pub token: String,
    pub expires_at: std::time::Instant,
}

#[derive(Clone, Debug)]
pub struct KeycloakState {
    pub url: String,
    pub realm: String,
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Clone)]
pub struct AppState {
    pub pg_pool: sqlx::PgPool,
    pub keycloak_config: KeycloakState,
    pub admin_token_cache: Arc<RwLock<Option<AdminToken>>>,
    pub username_cache: Cache<String, String>,
    /// Signalled after a gauge is linked so the poll supervisor reconciles at
    /// once instead of waiting for its next tick.
    pub gauge_wake: Arc<tokio::sync::Notify>,
    /// Signalled after a section is created so the region worker derives its
    /// regions at once instead of waiting for its next cycle.
    pub region_wake: Arc<tokio::sync::Notify>,
    /// Trip changes as they commit, fed by the NOTIFY listener; every open
    /// live stream subscribes.
    pub live_events: tokio::sync::broadcast::Sender<crate::models::notification::LiveEvent>,
    /// Web push, when VAPID keys are configured.
    pub push: Option<Arc<crate::notify::push::PushService>>,
    /// Who holds how many live streams, to cap them per user.
    pub live_streams: Arc<crate::notify::LiveStreams>,
}
