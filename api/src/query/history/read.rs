use chrono::{DateTime, Utc};
use sqlx::{
    PgPool, Postgres, Row,
    postgres::{PgArguments, PgRow},
    query::Query,
    types::Json,
};

use super::{EntityKind, Scope};
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

fn step(row: &PgRow) -> Result<HistoryStep, sqlx::Error> {
    let kind: String = row.try_get("kind")?;
    let kind = StepKind::parse(&kind)
        .ok_or_else(|| sqlx::Error::Decode(format!("unknown step kind {kind:?}").into()))?;
    let Json(changes): Json<Vec<HistoryChange>> = row.try_get("changes")?;
    Ok(HistoryStep {
        id: row.get("id"),
        at: row.get("at"),
        kind,
        actor: user(row, "actor_user_id", "actor_name"),
        source: row
            .get::<Option<String>, _>("source_id")
            .is_some()
            .then(|| source(row)),
        proposal_id: row.get("proposal_id"),
        proposal_note: row.get("proposal_note"),
        reviewer: user(row, "reviewer_user_id", "reviewer_name"),
        changes,
    })
}

/// Matches one entity through all its parents, binds `$1` to `$4`.
const SCOPE_WHERE: &str = "h.entity_kind = $1 AND h.entity_id = $2 AND h.waterway_id = $3 \
     AND h.section_id IS NOT DISTINCT FROM $4";

fn bind_scope<'q>(
    query: Query<'q, Postgres, PgArguments>,
    scope: &Scope,
) -> Query<'q, Postgres, PgArguments> {
    query
        .bind(scope.kind.as_str())
        .bind(scope.id)
        .bind(scope.waterway_id)
        .bind(scope.section_id)
}

/// Whether the entity is known: it has a recorded step (also after it was
/// deleted) or it still exists without one (made by a bulk import). Found
/// through its parents, so an id under another parent's path is unknown.
pub async fn is_known(pool: &PgPool, scope: &Scope) -> Result<bool, sqlx::Error> {
    let steps = bind_scope(
        sqlx::query(&format!(
            "SELECT EXISTS (SELECT 1 FROM entity_history h WHERE {SCOPE_WHERE})"
        )),
        scope,
    )
    .fetch_one(pool)
    .await?;
    if steps.get(0) {
        return Ok(true);
    }
    let live = match scope.kind {
        EntityKind::Waterway => {
            sqlx::query("SELECT EXISTS (SELECT 1 FROM waterways WHERE id = $1)").bind(scope.id)
        }
        EntityKind::Section => sqlx::query(
            "SELECT EXISTS (SELECT 1 FROM water_sections WHERE id = $1 AND waterway_id = $2)",
        )
        .bind(scope.id)
        .bind(scope.waterway_id),
        EntityKind::Feature => sqlx::query(
            "SELECT EXISTS (SELECT 1 FROM features f JOIN water_sections s ON s.id = f.section_id \
             WHERE f.id = $1 AND f.section_id = $2 AND s.waterway_id = $3)",
        )
        .bind(scope.id)
        .bind(scope.section_id)
        .bind(scope.waterway_id),
    };
    Ok(live.fetch_one(pool).await?.get(0))
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
    let total: i64 = bind_scope(
        sqlx::query(&format!(
            "SELECT count(*) FROM entity_history h WHERE {SCOPE_WHERE}"
        )),
        scope,
    )
    .fetch_one(pool)
    .await?
    .get(0);

    let rows = bind_scope(
        sqlx::query(&format!(
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
             WHERE {SCOPE_WHERE} \
             ORDER BY h.at, h.id \
             LIMIT $5 OFFSET $6"
        )),
        scope,
    )
    .bind(per_page)
    .bind((page - 1) * per_page)
    .fetch_all(pool)
    .await?;

    let steps = rows.iter().map(step).collect::<Result<_, _>>()?;
    Ok((steps, total))
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
