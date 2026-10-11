use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use super::Scope;
use crate::models::history::{
    Contributor, HistoryChange, HistorySource, HistoryStep, HistoryUser, SourceEntries, StepKind,
    WaterwaySources,
};

/// Most sources or contributors the sources view lists.
const MAX_LISTED: i64 = 200;

fn user(row: &PgRow, id_col: &str, name_col: &str) -> Option<HistoryUser> {
    let username: Option<String> = row.get(name_col);
    let user_id: Option<String> = row.get(id_col);
    Some(HistoryUser {
        user_id: user_id?,
        username: username?,
    })
}

fn source(row: &PgRow) -> HistorySource {
    HistorySource {
        id: row.get("source_id"),
        name: row.get("source_name"),
        short_name: row.get("source_short_name"),
        website: row.get("source_website"),
        license_name: row.get("source_license_name"),
        license_url: row.get("source_license_url"),
    }
}

fn step(row: &PgRow) -> HistoryStep {
    let changes: serde_json::Value = row.get("changes");
    HistoryStep {
        id: row.get("id"),
        at: row.get("at"),
        kind: StepKind::from_db(&row.get::<String, _>("kind")),
        actor: user(row, "actor_user_id", "actor_name"),
        source: row
            .get::<Option<String>, _>("source_id")
            .is_some()
            .then(|| source(row)),
        proposal_id: row.get("proposal_id"),
        proposal_note: row.get("proposal_note"),
        reviewer: user(row, "reviewer_user_id", "reviewer_name"),
        changes: serde_json::from_value::<Vec<HistoryChange>>(changes).unwrap_or_default(),
    }
}

/// Whether the entity has any recorded step, found through its parents.
pub async fn entity_has_steps(pool: &PgPool, scope: &Scope) -> Result<bool, sqlx::Error> {
    let row = sqlx::query(
        "SELECT EXISTS (SELECT 1 FROM entity_history \
         WHERE entity_kind = $1 AND entity_id = $2 AND waterway_id = $3 \
           AND section_id IS NOT DISTINCT FROM $4)",
    )
    .bind(scope.kind.as_str())
    .bind(scope.id)
    .bind(scope.waterway_id)
    .bind(scope.section_id)
    .fetch_one(pool)
    .await?;
    Ok(row.get(0))
}

/// One page of the entity's steps, oldest first, and the total count. The
/// lookup is by the entity and all its parents, so an id reached through
/// another parent's path finds nothing.
pub async fn list_steps(
    pool: &PgPool,
    scope: &Scope,
    page: i64,
    per_page: i64,
) -> Result<(Vec<HistoryStep>, i64), sqlx::Error> {
    let total: i64 = sqlx::query(
        "SELECT count(*) FROM entity_history \
         WHERE entity_kind = $1 AND entity_id = $2 AND waterway_id = $3 \
           AND section_id IS NOT DISTINCT FROM $4",
    )
    .bind(scope.kind.as_str())
    .bind(scope.id)
    .bind(scope.waterway_id)
    .bind(scope.section_id)
    .fetch_one(pool)
    .await?
    .get(0);

    let rows = sqlx::query(
        "SELECT h.id, h.at, h.kind, h.proposal_id, h.changes, \
                au.id AS actor_user_id, au.username AS actor_name, \
                ru.id AS reviewer_user_id, ru.username AS reviewer_name, \
                s.id AS source_id, s.name AS source_name, \
                COALESCE(s.short_name, s.name) AS source_short_name, \
                s.website AS source_website, s.license_name AS source_license_name, \
                s.license_url AS source_license_url, pr.submitter_note AS proposal_note \
         FROM entity_history h \
         LEFT JOIN users au ON au.id = h.actor_id \
         LEFT JOIN users ru ON ru.id = h.reviewer_id \
         LEFT JOIN sources s ON s.id = h.source_id \
         LEFT JOIN proposals pr ON pr.id = h.proposal_id \
         WHERE h.entity_kind = $1 AND h.entity_id = $2 AND h.waterway_id = $3 \
           AND h.section_id IS NOT DISTINCT FROM $4 \
         ORDER BY h.at, h.id \
         LIMIT $5 OFFSET $6",
    )
    .bind(scope.kind.as_str())
    .bind(scope.id)
    .bind(scope.waterway_id)
    .bind(scope.section_id)
    .bind(per_page)
    .bind((page - 1) * per_page)
    .fetch_all(pool)
    .await?;

    Ok((rows.iter().map(step).collect(), total))
}

/// Every source and contributor named by a river's history, including its
/// sections' and features' (and those since deleted). With `section_id`
/// only that section's own and its features' steps count; the section is
/// matched together with the waterway, so another river's section finds
/// nothing.
pub async fn list_waterway_sources(
    pool: &PgPool,
    waterway_id: i64,
    section_id: Option<i64>,
) -> Result<WaterwaySources, sqlx::Error> {
    let source_rows = sqlx::query(
        "SELECT s.id AS source_id, s.name AS source_name, \
                COALESCE(s.short_name, s.name) AS source_short_name, \
                s.website AS source_website, s.license_name AS source_license_name, \
                s.license_url AS source_license_url, count(*) AS entries \
         FROM entity_history h JOIN sources s ON s.id = h.source_id \
         WHERE h.waterway_id = $1 AND ($3::bigint IS NULL OR h.section_id = $3) \
         GROUP BY s.id \
         ORDER BY count(*) DESC, s.name \
         LIMIT $2",
    )
    .bind(waterway_id)
    .bind(MAX_LISTED)
    .bind(section_id)
    .fetch_all(pool)
    .await?;

    let contributor_rows = sqlx::query(
        "SELECT u.id AS user_id, u.username, count(*) AS steps, max(h.at) AS last_at \
         FROM entity_history h JOIN users u ON u.id = h.actor_id \
         WHERE h.waterway_id = $1 AND ($3::bigint IS NULL OR h.section_id = $3) \
         GROUP BY u.id, u.username \
         ORDER BY count(*) DESC, max(h.at) DESC, u.username \
         LIMIT $2",
    )
    .bind(waterway_id)
    .bind(MAX_LISTED)
    .bind(section_id)
    .fetch_all(pool)
    .await?;

    Ok(WaterwaySources {
        sources: source_rows
            .iter()
            .map(|r| SourceEntries {
                source: source(r),
                entries: r.get("entries"),
            })
            .collect(),
        contributors: contributor_rows
            .iter()
            .map(|r| Contributor {
                user: HistoryUser {
                    user_id: r.get("user_id"),
                    username: r.get("username"),
                },
                steps: r.get("steps"),
                last_at: r.get::<DateTime<Utc>, _>("last_at"),
            })
            .collect(),
    })
}
