//! The stored event and the rules for what may go into it.
//!
//! Analytics is anonymous by construction: an event has no field that can
//! hold an address, raw user agent, token, user id or free text. The user
//! agent is reduced in memory to two coarse families, `browser` and `os`. `query` keeps
//! only closed-set feature choices, and a value outside the set is stored
//! as "other", never as the text that was sent.

use std::collections::BTreeMap;

use crate::query::materials::MAX_COMPARE_IDS;

use serde::{Serialize, de::DeserializeOwned};

use crate::models::material::{
    MaterialCategory, MaterialConstruction, MaterialDiscipline, MaterialSort, MaterialUse,
};

/// Stored when a feature parameter holds something outside its enum.
pub const OTHER: &str = "other";

#[derive(Debug, Serialize)]
pub struct Event {
    pub ts: String,
    pub route: String,
    pub method: String,
    pub status: u16,
    pub latency_ms: u32,
    pub client: &'static str,
    pub browser: &'static str,
    pub os: &'static str,
    pub query: BTreeMap<String, String>,
    pub bytes: u32,
}

/// Browser or client family from a small fixed match, never the raw header
/// and no version. A short match instead of a UA-parsing crate: two coarse
/// columns do not justify a crate and its regex data set.
pub fn browser(ua: &str) -> &'static str {
    let ua = ua.to_ascii_lowercase();
    let has = |needles: &[&str]| needles.iter().any(|n| ua.contains(n));
    if ua.starts_with("curl/") {
        "curl"
    } else if has(&["python", "aiohttp", "httpx"]) {
        "python"
    } else if has(&["okhttp", "cfnetwork", "dart/"]) {
        "app"
    } else if has(&["edg/", "edga/", "edgios/"]) {
        "edge"
    } else if has(&["samsungbrowser"]) {
        "samsung"
    } else if has(&["firefox/", "fxios/"]) {
        "firefox"
    } else if has(&["chrome/", "crios/", "chromium/"]) {
        "chrome"
    } else if has(&["safari/"]) {
        "safari"
    } else if ua.starts_with("mozilla/") {
        "other_browser"
    } else {
        "other"
    }
}

/// Operating system family, same rules as `browser`.
pub fn os(ua: &str) -> &'static str {
    let ua = ua.to_ascii_lowercase();
    let has = |needles: &[&str]| needles.iter().any(|n| ua.contains(n));
    if has(&["android"]) {
        "android"
    } else if has(&["iphone", "ipad", "ipod", "cfnetwork"]) {
        "ios"
    } else if has(&["windows"]) {
        "windows"
    } else if has(&["macintosh", "mac os x"]) {
        "macos"
    } else if has(&["linux", "x11"]) {
        "linux"
    } else {
        "other"
    }
}

/// `value` when it parses as `T` (an exact variant name, so it is one of a
/// few known words), else "other". The enums themselves are the allowlist, so
/// it cannot drift from the API.
fn known<T: DeserializeOwned>(value: &str) -> String {
    match serde_json::from_value::<T>(serde_json::Value::String(value.to_string())) {
        Ok(_) => value.to_string(),
        Err(_) => OTHER.to_string(),
    }
}

/// How many entries a comparison asks for, never which: "1" up to the
/// comparison limit, else "other".
fn compare_count(value: &str) -> String {
    let n = value.split(',').filter(|id| !id.trim().is_empty()).count();
    if (1..=MAX_COMPARE_IDS).contains(&n) {
        n.to_string()
    } else {
        OTHER.to_string()
    }
}

/// The feature parameters of a query string and their normalised values;
/// every other key is dropped. The first occurrence of a key wins.
pub fn allowed_query(raw: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let Ok(url) = reqwest::Url::parse(&format!("http://x/?{raw}")) else {
        return out;
    };
    for (key, value) in url.query_pairs() {
        if out.contains_key(key.as_ref()) {
            continue;
        }
        let value = match key.as_ref() {
            "category" => known::<MaterialCategory>(&value),
            "discipline" => known::<MaterialDiscipline>(&value),
            "use" => known::<MaterialUse>(&value),
            "construction" => known::<MaterialConstruction>(&value),
            "sort" => known::<MaterialSort>(&value),
            "ids" => compare_count(&value),
            _ => continue,
        };
        out.insert(key.into_owned(), value);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_feature_keys_survive() {
        let q = allowed_query("q=weser&token=secret&user_id=4&page=2&category=kayak&sort=newest");
        let keys: Vec<&str> = q.keys().map(String::as_str).collect();
        assert_eq!(keys, ["category", "sort"]);
    }

    #[test]
    fn a_comparison_records_its_size_not_its_ids() {
        assert_eq!(allowed_query("ids=10024,10347,9851")["ids"], "3");
        assert_eq!(allowed_query("ids=10024")["ids"], "1");
        assert_eq!(allowed_query("ids=")["ids"], OTHER);
        assert_eq!(allowed_query("ids=1,2,3,4,5,6,7,8,9")["ids"], OTHER);
    }

    #[test]
    fn known_values_are_kept_and_unknown_become_other() {
        let q = allowed_query(
            "category=sup&discipline=half_slice&use=racing&construction=Zebra&sort=x",
        );
        assert_eq!(q["use"], "racing");
        assert_eq!(allowed_query("use=Bob")["use"], OTHER);
        assert_eq!(q["category"], "sup");
        assert_eq!(q["discipline"], "half_slice");
        assert_eq!(q["construction"], OTHER);
        assert_eq!(q["sort"], OTHER);
    }

    #[test]
    fn free_text_in_a_feature_key_leaves_no_trace() {
        let q = allowed_query("category=SomeName&discipline=%C3%A4%20Some%20Name");
        let json = serde_json::to_string(&q).unwrap();
        assert!(!json.contains("Some"), "{json}");
    }

    #[test]
    fn user_agents_map_to_coarse_families() {
        let chrome_android = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
        assert_eq!(
            (browser(chrome_android), os(chrome_android)),
            ("chrome", "android")
        );
        let safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile Safari/604.1";
        assert_eq!((browser(safari), os(safari)), ("safari", "ios"));
        let edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36 Edg/120.0";
        assert_eq!((browser(edge), os(edge)), ("edge", "windows"));
        let ff = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";
        assert_eq!((browser(ff), os(ff)), ("firefox", "linux"));
        assert_eq!(browser("curl/8.5.0"), "curl");
        assert_eq!(browser("python-requests/2.31"), "python");
        assert_eq!(browser("okhttp/4"), "app");
    }

    #[test]
    fn unknown_agents_are_other() {
        for ua in ["SomeScanner/1.0 secret-id-123", ""] {
            assert_eq!((browser(ua), os(ua)), ("other", "other"));
        }
    }

    #[test]
    fn garbage_queries_are_empty() {
        assert!(allowed_query("").is_empty());
        assert!(allowed_query("q=&page=%20").is_empty());
    }
}
