//! Reading the Rivermap snapshot and the small value conversions the loader uses.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;
use river_gauge::{RivermapReadingsRange, RivermapSectionBundle, RivermapSource, RivermapStation};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
pub struct RivermapSnapshot {
    pub sources: Vec<RivermapSource>,
    pub stations: Vec<RivermapStation>,
    pub sections: RivermapSectionBundle,
    pub readings: HashMap<String, RivermapReadingsRange>,
}

pub const STEPS: &[&str] = &["sources", "stations", "sections", "readings"];

pub fn default_snapshot_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/rivermap_snapshot.json")
}

pub fn read_snapshot(path: &Path) -> anyhow::Result<RivermapSnapshot> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("reading snapshot from {}", path.display()))?;
    serde_json::from_str(&raw).context("parsing snapshot JSON")
}

/// Parses a comma separated `--only` list; every entry must be a known step.
pub fn parse_steps(list: &str) -> anyhow::Result<Vec<String>> {
    let steps: Vec<String> = list.split(',').map(|s| s.trim().to_lowercase()).collect();
    for step in &steps {
        if !STEPS.contains(&step.as_str()) {
            anyhow::bail!(
                "unknown step '{step}', expected one of {}",
                STEPS.join(", ")
            );
        }
    }
    Ok(steps)
}

pub fn preferred_name(map: &serde_json::Map<String, Value>) -> Option<String> {
    ["en", "de", "fr", "it", "es"]
        .iter()
        .find_map(|lang| map.get(*lang).and_then(|v| v.as_str()).map(String::from))
        .or_else(|| {
            map.values()
                .next()
                .and_then(|v| v.as_str())
                .map(String::from)
        })
}

pub fn latlng_to_f64(arr: &[Value]) -> (Option<f64>, Option<f64>) {
    if arr.len() == 2 {
        let lat = arr[0].as_f64().map(|v| v / 1_000_000.0);
        let lon = arr[1].as_f64().map(|v| v / 1_000_000.0);
        (lat, lon)
    } else {
        (None, None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn steps_are_validated_and_lowercased() {
        assert_eq!(
            parse_steps("Sources, stations").unwrap(),
            ["sources", "stations"]
        );
        assert!(parse_steps("sources,bogus").is_err());
    }

    #[test]
    fn name_prefers_english_then_any() {
        let map = json!({"de": "Inn", "en": "Inn river"});
        assert_eq!(
            preferred_name(map.as_object().unwrap()).as_deref(),
            Some("Inn river")
        );
        let map = json!({"xx": "Other"});
        assert_eq!(
            preferred_name(map.as_object().unwrap()).as_deref(),
            Some("Other")
        );
        assert_eq!(preferred_name(&serde_json::Map::new()), None);
    }

    #[test]
    fn latlng_is_scaled_from_micro_degrees() {
        let pair = [json!(47_500_000), json!(11_250_000)];
        assert_eq!(latlng_to_f64(&pair), (Some(47.5), Some(11.25)));
        assert_eq!(latlng_to_f64(&pair[..1]), (None, None));
    }
}
