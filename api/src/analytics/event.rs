//! The stored event and the rules for what may go into it.
//!
//! Never stored: the address, user id, token, raw user agent, path
//! parameters, headers or bodies. `query` keeps only allowlisted keys.

use std::{borrow::Cow, collections::BTreeMap};

use serde::Serialize;

/// Query parameters that are kept, with the longest value stored.
pub const QUERY_ALLOWLIST: &[&str] = &["q", "category", "discipline", "page"];
const MAX_VALUE: usize = 64;

#[derive(Debug, Serialize)]
pub struct Event {
    pub ts: String,
    pub route: String,
    pub method: String,
    pub status: u16,
    pub latency_ms: u32,
    pub client: &'static str,
    pub caller: String,
    pub ua_family: &'static str,
    pub query: BTreeMap<String, String>,
    pub bytes: u32,
}

/// Allowlisted parameters only, each value cut to 64 characters; the first
/// occurrence of a key wins. Blank values are skipped.
pub fn allowed_query(raw: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for (key, value) in reqwest::Url::parse(&format!("http://x/?{raw}"))
        .map(|u| {
            u.query_pairs()
                .map(|(k, v): (Cow<str>, Cow<str>)| (k.into_owned(), v.into_owned()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
    {
        if !QUERY_ALLOWLIST.contains(&key.as_str()) || out.contains_key(&key) {
            continue;
        }
        let value: String = value.trim().chars().take(MAX_VALUE).collect();
        if !value.is_empty() {
            out.insert(key, value);
        }
    }
    out
}

/// A coarse family from a small allowlist, never the raw header.
pub fn ua_family(ua: &str) -> &'static str {
    let ua = ua.to_ascii_lowercase();
    if ua.starts_with("curl/") {
        "curl"
    } else if ["python", "aiohttp", "httpx"]
        .iter()
        .any(|p| ua.contains(p))
    {
        "python"
    } else if ["okhttp", "cfnetwork", "dart/"]
        .iter()
        .any(|p| ua.contains(p))
    {
        "app"
    } else if ua.starts_with("mozilla/") {
        "browser"
    } else {
        "other"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_allowlisted_keys_survive() {
        let q = allowed_query("q=weser&token=secret&user_id=4&page=2&category=river");
        let keys: Vec<&str> = q.keys().map(String::as_str).collect();
        assert_eq!(keys, ["category", "page", "q"]);
    }

    #[test]
    fn values_are_truncated_and_decoded() {
        let long = "a".repeat(200);
        let q = allowed_query(&format!("q={long}"));
        assert_eq!(q["q"].chars().count(), 64);
        assert_eq!(allowed_query("q=%C3%A4%20x")["q"], "\u{e4} x");
    }

    #[test]
    fn blank_and_garbage_queries_are_empty() {
        assert!(allowed_query("").is_empty());
        assert!(allowed_query("q=&page=%20").is_empty());
    }

    #[test]
    fn user_agents_map_to_a_family() {
        assert_eq!(ua_family("curl/8.5.0"), "curl");
        assert_eq!(ua_family("python-requests/2.31"), "python");
        assert_eq!(ua_family("Mozilla/5.0 (X11) Chrome/120"), "browser");
        assert_eq!(ua_family("okhttp/4"), "app");
        assert_eq!(ua_family("SomeScanner/1.0 secret-id-123"), "other");
        assert_eq!(ua_family(""), "other");
    }
}
