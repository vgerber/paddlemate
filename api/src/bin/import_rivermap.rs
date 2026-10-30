use std::path::PathBuf;

use anyhow::Context;
use paddlemate_api::importers::rivermap::{load, parse};
use sqlx::PgPool;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;

    let mut snapshot_path = parse::default_snapshot_path();
    // Which import steps to run. The full set rewrites waterways, sections and
    // features too, so a targeted fix (e.g. re-linking gauges to their source)
    // can restrict itself with --only sources,stations.
    let mut only: Option<Vec<String>> = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--snapshot" => {
                snapshot_path = PathBuf::from(
                    args.next()
                        .ok_or_else(|| anyhow::anyhow!("--snapshot requires a path"))?,
                );
            }
            "--only" => {
                let list = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--only requires a comma separated list"))?;
                only = Some(parse::parse_steps(&list)?);
            }
            "--help" | "-h" => {
                println!(
                    "Usage: import_rivermap [--snapshot PATH] [--only {}]\n\n\
                     Default snapshot: {}\n\
                     Without --only every step runs, which also rewrites waterways,\n\
                     sections and features from the snapshot.",
                    parse::STEPS.join(","),
                    snapshot_path.display()
                );
                return Ok(());
            }
            other => anyhow::bail!("unknown argument: {other}"),
        }
    }

    let snapshot = parse::read_snapshot(&snapshot_path)?;
    let pool = PgPool::connect(&database_url).await?;
    load::run(&pool, &snapshot, only.as_deref()).await?;

    println!(
        "Import complete ({})",
        match &only {
            Some(steps) => steps.join(", "),
            None => "all steps".to_string(),
        }
    );

    Ok(())
}
