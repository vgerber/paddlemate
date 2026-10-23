use std::time::Duration;

use sqlx::PgPool;

/// How long the history of a deleted entity is kept after its delete.
pub const KEEP_DELETED_DAYS: i32 = 365;

/// Entities purged per statement, so one pass never holds a long lock.
const BATCH: i64 = 200;

/// Upper bound for one daily pass.
const PASS_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Deletes the whole history of every entity whose `deleted` step is older
/// than `days`, a batch of entities at a time (never part of one entity, or
/// the rest would lose the step that marks it). Returns the rows removed.
/// Children deleted with a section or river have a step of their own.
pub async fn purge_deleted(pool: &PgPool, days: i32) -> Result<u64, sqlx::Error> {
    let mut total = 0;
    loop {
        let r = sqlx::query(
            "WITH gone AS ( \
                 SELECT DISTINCT entity_kind, entity_id FROM entity_history \
                 WHERE kind = 'deleted' AND at < NOW() - make_interval(days => $1) \
                 LIMIT $2) \
             DELETE FROM entity_history h USING gone g \
             WHERE h.entity_kind = g.entity_kind AND h.entity_id = g.entity_id",
        )
        .bind(days)
        .bind(BATCH)
        .execute(pool)
        .await?;
        if r.rows_affected() == 0 {
            return Ok(total);
        }
        total += r.rows_affected();
    }
}

/// Purges expired history once a day, for the life of the server.
pub async fn run_pruner(pool: PgPool) {
    let mut daily = tokio::time::interval(Duration::from_secs(24 * 60 * 60));
    loop {
        daily.tick().await;
        match tokio::time::timeout(PASS_TIMEOUT, purge_deleted(&pool, KEEP_DELETED_DAYS)).await {
            Ok(Ok(0)) => {}
            Ok(Ok(n)) => tracing::info!(
                "Purged {} history steps of entities deleted over {} days ago",
                n,
                KEEP_DELETED_DAYS
            ),
            Ok(Err(err)) => tracing::warn!("Could not purge deleted history: {}", err),
            Err(_) => tracing::warn!("Purging deleted history timed out"),
        }
    }
}
