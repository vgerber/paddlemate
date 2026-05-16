use std::{collections::HashMap, fs, path::PathBuf};

use anyhow::Context;
use chrono::Utc;
use river_gauge::{RivermapReader, RivermapReadingsRange, RivermapSectionBundle, RivermapSource, RivermapStation};
use serde::Serialize;

#[derive(Serialize)]
struct RivermapSnapshot {
    fetched_at: String,
    sources: Vec<RivermapSource>,
    stations: Vec<RivermapStation>,
    sections: RivermapSectionBundle,
    readings: HashMap<String, RivermapReadingsRange>,
}

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn default_output() -> PathBuf {
    manifest_dir().join("../../scripts/rivermap_snapshot.json")
}

fn default_env_file() -> PathBuf {
    manifest_dir().join("../../scripts/.env.rivermap")
}

fn load_env_file(path: &PathBuf) -> anyhow::Result<()> {
    if path.exists() {
        dotenvy::from_filename(path)
            .with_context(|| format!("failed to load env file at {}", path.display()))?;
    }
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let mut output = default_output();
    let mut env_file = default_env_file();

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--output" => {
                let Some(path) = args.next() else {
                    anyhow::bail!("--output requires a path");
                };
                output = PathBuf::from(path);
            }
            "--env-file" => {
                let Some(path) = args.next() else {
                    anyhow::bail!("--env-file requires a path");
                };
                env_file = PathBuf::from(path);
            }
            "--help" | "-h" => {
                println!(
                    "Usage: fetch_rivermap_snapshot [--env-file PATH] [--output PATH]\n\nDefault env file: {}\nDefault output: {}",
                    env_file.display(),
                    output.display()
                );
                return Ok(());
            }
            other => anyhow::bail!("unknown argument: {other}"),
        }
    }

    load_env_file(&env_file)?;

    let reader = RivermapReader::default();
    let sources = reader.list_sources().await?;
    let stations = reader.list_stations_raw(Some("active"), Some("all")).await?;
    let sections = reader.list_sections().await?;
    let readings = reader.get_all_station_readings(Some(360), Some(360)).await?;

    let snapshot = RivermapSnapshot {
        fetched_at: Utc::now().to_rfc3339(),
        sources,
        stations,
        sections,
        readings,
    };

    let json = serde_json::to_string_pretty(&snapshot)?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&output, json + "\n")?;
    println!("Wrote {}", output.display());

    Ok(())
}