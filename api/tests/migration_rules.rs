//! Rules the migration files must follow, checked by `cargo test` so they run
//! locally and in CI without a separate tool.

use std::fs;

/// The `*_name_trgm` indexes are expression indexes on `public.search_key`.
/// Redefining that function does not rebuild them: existing entries keep the
/// old normalization while new rows get the new one, and searches quietly
/// return wrong results. So a migration that changes `search_key` must
/// `REINDEX` in the same migration.
///
/// Nothing else can catch this - a CI database builds its indexes from the
/// current function every run, so it always looks healthy.
fn violations(migrations: &[(String, String)]) -> Vec<String> {
    let mut sorted: Vec<_> = migrations.iter().collect();
    sorted.sort_by_key(|(name, _)| name.clone());

    let mut seen_definition = false;
    let mut violating = Vec::new();
    for (name, sql) in sorted {
        let sql = sql.to_lowercase();
        let defines = sql
            .split_whitespace()
            .collect::<Vec<_>>()
            .windows(2)
            .any(|w| {
                w[0] == "function" && w[1].trim_start_matches("public.").starts_with("search_key")
            });
        if !defines {
            continue;
        }
        // The migration that introduces the function has no indexes to
        // rebuild yet; every later redefinition must rebuild them.
        if seen_definition && !sql.contains("reindex") {
            violating.push(name.clone());
        }
        seen_definition = true;
    }
    violating
}

fn read_migrations() -> Vec<(String, String)> {
    fs::read_dir("migrations")
        .expect("tests run from the crate root, where migrations/ lives")
        .map(|entry| entry.expect("readable directory entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "sql"))
        .map(|path| {
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            let sql = fs::read_to_string(&path).expect("readable migration");
            (name, sql)
        })
        .collect()
}

#[test]
fn search_key_migrations_reindex_the_trigram_indexes() {
    let violating = violations(&read_migrations());
    assert!(
        violating.is_empty(),
        "these migrations change search_key without REINDEX, leaving the \
         *_name_trgm indexes on the old normalization: {violating:?}"
    );
}

#[test]
fn a_redefinition_without_reindex_is_caught() {
    let base = (
        "00001_base.sql".to_string(),
        "CREATE FUNCTION public.search_key(txt text) RETURNS text ...".to_string(),
    );
    let bad = (
        "00002_change.sql".to_string(),
        "CREATE OR REPLACE FUNCTION search_key(txt text) RETURNS text ...".to_string(),
    );
    let good = (
        "00002_change.sql".to_string(),
        "CREATE OR REPLACE FUNCTION search_key(txt text) RETURNS text ...;\n\
         REINDEX INDEX idx_waterways_name_trgm;"
            .to_string(),
    );
    let unrelated = (
        "00002_other.sql".to_string(),
        "ALTER TABLE gauges ADD COLUMN note text;".to_string(),
    );

    assert_eq!(
        violations(&[base.clone(), bad]),
        vec!["00002_change.sql".to_string()]
    );
    assert!(violations(&[base.clone(), good]).is_empty());
    assert!(violations(&[base.clone(), unrelated]).is_empty());
    // The introducing migration itself needs no REINDEX.
    assert!(violations(&[base]).is_empty());
}
