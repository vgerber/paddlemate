//! Typed settings, read once at startup from the environment (and `.env`).
//! The variables are documented in AGENTS.md.

use std::path::PathBuf;

use crate::layers::limit::{Rates, TrustedProxies};

/// Where uploads go when MEDIA_DIR is unset.
pub const DEFAULT_MEDIA_DIR: &str = "media";
/// The API prefix when BASE_URL is unset.
pub const DEFAULT_BASE_URL: &str = "/api/v1";

/// Public fallback instances, used when OVERPASS_URLS is not set.
const PUBLIC_OVERPASS_URLS: [&str; 3] = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
];

#[derive(Clone, Debug)]
pub struct KeycloakSettings {
    pub url: String,
    pub realm: String,
    pub audience: String,
    pub client_id: String,
    pub client_secret: String,
    /// Shown in the OpenAPI document as the password flow's token endpoint.
    pub token_url: String,
}

/// Web push keys; present only when both variables are set.
#[derive(Clone, Debug)]
pub struct VapidSettings {
    pub private_key: String,
    pub subject: String,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub keycloak: KeycloakSettings,
    pub port: String,
    pub base_url: String,
    pub run_migrations: bool,
    /// None allows any origin.
    pub cors_origins: Option<Vec<String>>,
    pub search_word_similarity_threshold: f64,
    pub rates: Rates,
    pub trusted_proxies: Option<TrustedProxies>,
    /// Raw TRUSTED_PROXIES, for the startup log.
    pub trusted_proxies_raw: Option<String>,
    pub media_dir: PathBuf,
    pub vapid: Option<VapidSettings>,
    pub disable_gauge_readers: bool,
    pub disable_material_mirror: bool,
}

/// One reader for every setting: the process environment, then `.env`.
pub fn var(name: &str) -> Option<String> {
    dotenvy::var(name).ok()
}

pub fn base_url() -> String {
    var("BASE_URL").unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
}

pub fn media_dir() -> PathBuf {
    PathBuf::from(var("MEDIA_DIR").unwrap_or_else(|| DEFAULT_MEDIA_DIR.to_string()))
}

/// A per-second rate; anything unparsable falls back to the default.
pub fn parse_rate(raw: Option<&str>, default: u64) -> u64 {
    raw.and_then(|raw| raw.trim().parse::<u64>().ok())
        .unwrap_or(default)
}

/// The similarity threshold, clamped to 0..=1; default 0.5.
pub fn parse_threshold(raw: Option<&str>) -> f64 {
    raw.and_then(|raw| raw.parse::<f64>().ok())
        .map(|value| value.clamp(0.0, 1.0))
        .unwrap_or(0.5)
}

/// Everything but the literal "false" runs migrations.
pub fn parse_run_migrations(raw: Option<&str>) -> bool {
    raw.map(|value| value != "false").unwrap_or(true)
}

/// A comma separated origin list; blank or unset means any origin (None).
/// Entries that are not valid header values are dropped.
pub fn parse_cors(raw: Option<&str>) -> Option<Vec<String>> {
    let raw = raw.filter(|raw| !raw.trim().is_empty())?;
    Some(
        raw.split(',')
            .map(str::trim)
            .filter(|origin| origin.parse::<axum::http::HeaderValue>().is_ok())
            .map(str::to_string)
            .collect(),
    )
}

/// A comma separated endpoint list; blank or unset gives the public instances.
pub fn parse_overpass_urls(raw: Option<&str>) -> Vec<String> {
    let configured: Vec<String> = raw
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    if configured.is_empty() {
        PUBLIC_OVERPASS_URLS.iter().map(|s| s.to_string()).collect()
    } else {
        configured
    }
}

/// Both variables must be non-empty, or push is off.
pub fn parse_vapid(key: Option<String>, subject: Option<String>) -> Option<VapidSettings> {
    Some(VapidSettings {
        private_key: key.filter(|k| !k.is_empty())?,
        subject: subject.filter(|s| !s.is_empty())?,
    })
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        Self::from_lookup(var)
    }

    /// Builds the settings from any name lookup, so tests need no environment.
    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        let required = |name: &str| get(name).ok_or_else(|| format!("{name} not set"));
        let rate = |name: &str, default: u64| parse_rate(get(name).as_deref(), default);

        let trusted_proxies_raw = get("TRUSTED_PROXIES").filter(|raw| !raw.trim().is_empty());
        let trusted_proxies = match &trusted_proxies_raw {
            Some(raw) => Some(
                TrustedProxies::parse(raw)
                    .map_err(|_| "TRUSTED_PROXIES must be a CIDR list".to_string())?,
            ),
            None => None,
        };

        Ok(Self {
            database_url: required("DATABASE_URL")?,
            keycloak: KeycloakSettings {
                url: required("KEYCLOAK_URL")?,
                realm: required("KEYCLOAK_REALM")?,
                audience: required("KEYCLOAK_AUDIENCE")?,
                client_id: required("KEYCLOAK_CLIENT_ID")?,
                client_secret: required("KEYCLOAK_CLIENT_SECRET")?,
                token_url: get("KEYCLOAK_TOKEN_URL").unwrap_or_else(|| {
                    "https://auth.example.com/realms/myrealm/protocol/openid-connect/token"
                        .to_string()
                }),
            },
            port: get("PORT").unwrap_or_else(|| "3000".to_string()),
            base_url: get("BASE_URL").unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            run_migrations: parse_run_migrations(get("RUN_MIGRATIONS").as_deref()),
            cors_origins: parse_cors(get("CORS_ALLOWED_ORIGINS").as_deref()),
            search_word_similarity_threshold: parse_threshold(
                get("SEARCH_WORD_SIMILARITY_THRESHOLD").as_deref(),
            ),
            rates: Rates {
                reads: rate("RATE_LIMIT_PER_SECOND", 20),
                writes: rate("WRITE_RATE_LIMIT_PER_SECOND", 1),
                expensive: rate("EXPENSIVE_RATE_LIMIT_PER_SECOND", 2),
            },
            trusted_proxies,
            trusted_proxies_raw,
            media_dir: PathBuf::from(
                get("MEDIA_DIR").unwrap_or_else(|| DEFAULT_MEDIA_DIR.to_string()),
            ),
            vapid: parse_vapid(get("VAPID_PRIVATE_KEY"), get("VAPID_SUBJECT")),
            disable_gauge_readers: get("DISABLE_GAUGE_READERS").as_deref() == Some("true"),
            disable_material_mirror: get("DISABLE_MATERIAL_MIRROR").as_deref() == Some("true"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn lookup(extra: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let mut map: HashMap<String, String> = [
            ("DATABASE_URL", "postgres://x"),
            ("KEYCLOAK_URL", "http://kc"),
            ("KEYCLOAK_REALM", "r"),
            ("KEYCLOAK_AUDIENCE", "a"),
            ("KEYCLOAK_CLIENT_ID", "c"),
            ("KEYCLOAK_CLIENT_SECRET", "s"),
        ]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
        for (k, v) in extra {
            map.insert(k.to_string(), v.to_string());
        }
        move |name| map.get(name).cloned()
    }

    #[test]
    fn defaults_match_the_documented_table() {
        let config = Config::from_lookup(lookup(&[])).unwrap();
        assert_eq!(config.port, "3000");
        assert_eq!(config.base_url, "/api/v1");
        assert!(config.run_migrations);
        assert!(config.cors_origins.is_none());
        assert_eq!(config.search_word_similarity_threshold, 0.5);
        assert_eq!(
            (
                config.rates.reads,
                config.rates.writes,
                config.rates.expensive
            ),
            (20, 1, 2)
        );
        assert!(config.trusted_proxies.is_none());
        assert_eq!(config.media_dir, PathBuf::from("media"));
        assert!(config.vapid.is_none());
        assert!(!config.disable_gauge_readers);
        assert!(!config.disable_material_mirror);
    }

    #[test]
    fn missing_required_names_the_variable() {
        let err = Config::from_lookup(|_| None).unwrap_err();
        assert_eq!(err, "DATABASE_URL not set");
    }

    #[test]
    fn bad_trusted_proxies_is_an_error() {
        let result = Config::from_lookup(lookup(&[("TRUSTED_PROXIES", "nonsense")]));
        assert!(result.is_err());
    }

    #[test]
    fn rate_falls_back_on_garbage() {
        assert_eq!(parse_rate(Some(" 7 "), 20), 7);
        assert_eq!(parse_rate(Some("0"), 20), 0);
        assert_eq!(parse_rate(Some("many"), 20), 20);
        assert_eq!(parse_rate(None, 20), 20);
    }

    #[test]
    fn threshold_is_clamped() {
        assert_eq!(parse_threshold(Some("2")), 1.0);
        assert_eq!(parse_threshold(Some("-1")), 0.0);
        assert_eq!(parse_threshold(Some("0.3")), 0.3);
        assert_eq!(parse_threshold(Some("x")), 0.5);
        assert_eq!(parse_threshold(None), 0.5);
    }

    #[test]
    fn only_false_skips_migrations() {
        assert!(!parse_run_migrations(Some("false")));
        assert!(parse_run_migrations(Some("0")));
        assert!(parse_run_migrations(None));
    }

    #[test]
    fn cors_blank_means_any() {
        assert!(parse_cors(None).is_none());
        assert!(parse_cors(Some("  ")).is_none());
        let list = parse_cors(Some("https://a.test, https://b.test")).unwrap();
        assert_eq!(list, vec!["https://a.test", "https://b.test"]);
    }

    #[test]
    fn overpass_urls_fall_back_to_public() {
        assert_eq!(parse_overpass_urls(None).len(), 3);
        assert_eq!(parse_overpass_urls(Some(" , ")).len(), 3);
        assert_eq!(
            parse_overpass_urls(Some("http://a, http://b")),
            vec!["http://a", "http://b"]
        );
    }

    #[test]
    fn vapid_needs_both() {
        assert!(parse_vapid(Some("k".into()), None).is_none());
        assert!(parse_vapid(Some("".into()), Some("mailto:a".into())).is_none());
        assert!(parse_vapid(Some("k".into()), Some("mailto:a".into())).is_some());
    }
}
