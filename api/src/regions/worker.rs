use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tokio::sync::Notify;

use super::derive::derive_for_location;
use crate::overpass::{FETCH_LOCK, lock_background};

/// Idle time between worker cycles; the wake Notify cuts it short.
const WORKER_INTERVAL: Duration = Duration::from_secs(30 * 60);

/// Background worker: fill regions and country for sections where they are
/// empty. Runs a cycle on start, then whenever `wake` is notified (a section
/// was created) and at a slow interval as a catch-up. Hand-edited values are
/// never touched - each field is only written while still empty.
pub fn run_worker(pool: PgPool, wake: Arc<Notify>) {
    tokio::spawn(async move {
        loop {
            if let Err(err) = run_cycle(&pool).await {
                tracing::error!("Region worker cycle failed: {err}");
            }
            tokio::select! {
                _ = wake.notified() => {}
                _ = tokio::time::sleep(WORKER_INTERVAL) => {}
            }
        }
    });
}

async fn run_cycle(pool: &PgPool) -> anyhow::Result<()> {
    // Newest first: a freshly created section gets its regions right after
    // the wake even when a backlog of older sections is still queued.
    let sections = sqlx::query!(
        r#"SELECT id, name, ST_AsGeoJSON(location) AS "location!"
           FROM water_sections
           WHERE regions = '{}' OR country IS NULL OR country = ''
           ORDER BY id DESC"#
    )
    .fetch_all(pool)
    .await?;

    for section in sections {
        let location: serde_json::Value = match serde_json::from_str(&section.location) {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!("Section {} has bad geometry: {err}", section.id);
                continue;
            }
        };
        let derived = {
            let _guard = lock_background(&FETCH_LOCK).await;
            derive_for_location(&location).await
        };
        let names = derived.names();
        if names.is_empty() && derived.country.is_none() {
            continue;
        }
        sqlx::query!(
            "UPDATE water_sections
             SET regions = CASE WHEN regions = '{}' THEN $1 ELSE regions END,
                 country = COALESCE(NULLIF(country, ''), $2),
                 updated_at = NOW()
             WHERE id = $3",
            &names,
            derived.country.as_deref(),
            section.id
        )
        .execute(pool)
        .await?;
        tracing::info!(
            "Derived section {} ({}): regions [{}], country {}",
            section.id,
            section.name,
            names.join(", "),
            derived.country.as_deref().unwrap_or("-")
        );
    }
    Ok(())
}
