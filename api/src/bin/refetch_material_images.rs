//! Queue mirrored catalogue photos for a fresh download.
//!
//! The original bytes are not kept, so a photo that was stored badly (for
//! example transparency turned black) can only be repaired by fetching it
//! again. This marks the chosen `material_images` rows pending and deletes
//! their files; the running mirror job does the downloading. Nothing outside
//! `material_images` is touched. Without `--yes` it only prints the plan.
//!
//! Usage: refetch_material_images [--transparent-sources] [--brand NAME]... [--yes]

use anyhow::Context;
use paddlemate_api::query::materials::images::{RefetchFilter, requeue, select_refetch};
use sqlx::PgPool;

const USAGE: &str =
    "usage: refetch_material_images [--transparent-sources] [--brand NAME]... [--yes]";

fn parse_args(args: impl Iterator<Item = String>) -> Result<(RefetchFilter, bool), String> {
    let mut filter = RefetchFilter::default();
    let mut yes = false;
    let mut args = args;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--transparent-sources" => filter.transparent_sources = true,
            "--brand" => filter
                .brands
                .push(args.next().ok_or("--brand needs a name")?),
            "--yes" => yes = true,
            other => return Err(format!("unknown option {other}")),
        }
    }
    if filter.is_empty() {
        return Err("choose --transparent-sources and/or --brand".into());
    }
    Ok((filter, yes))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let (filter, yes) = match parse_args(std::env::args().skip(1)) {
        Ok(parsed) => parsed,
        Err(message) => {
            eprintln!("{message}\n{USAGE}");
            std::process::exit(2);
        }
    };
    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let pool = PgPool::connect(&database_url).await?;

    let rows = select_refetch(&pool, &filter).await?;
    println!("{} fetched photo(s) match {filter:?}", rows.len());
    for row in rows.iter().take(10) {
        println!("  #{} {}", row.id, row.source_url);
    }
    if rows.len() > 10 {
        println!("  ... and {} more", rows.len() - 10);
    }
    if !yes {
        println!("Dry run. Add --yes to mark them pending and delete their files.");
        return Ok(());
    }
    let ids: Vec<i64> = rows.iter().map(|r| r.id).collect();
    let done = requeue(&pool, &ids).await?;
    println!("Requeued {done} photo(s); the running mirror job fetches them anew.");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Result<(RefetchFilter, bool), String> {
        parse_args(args.iter().map(|s| s.to_string()))
    }

    #[test]
    fn needs_a_selection() {
        assert!(parse(&[]).is_err());
        assert!(parse(&["--yes"]).is_err());
        assert!(parse(&["--brand"]).is_err());
        assert!(parse(&["--nope"]).is_err());
    }

    #[test]
    fn reads_options() {
        let (f, yes) = parse(&["--transparent-sources", "--brand", "Dagger"]).unwrap();
        assert!(f.transparent_sources && !yes);
        assert_eq!(f.brands, ["Dagger"]);
        assert!(parse(&["--transparent-sources", "--yes"]).unwrap().1);
    }
}
