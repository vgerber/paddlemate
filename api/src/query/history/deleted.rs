use sqlx::{PgPool, Row};

use super::read::user;
use crate::models::history::DeletedFeature;

/// One page of a section's deleted features, newest deletion first, and the
/// total. Found through the waterway and section ids in the history rows, so
/// it works after the section itself was deleted and finds nothing under
/// another parent. Name and type are the last value any step gave them.
pub async fn list_deleted_features(
    pool: &PgPool,
    waterway_id: i64,
    section_id: i64,
    page: i64,
    per_page: i64,
) -> Result<(Vec<DeletedFeature>, i64), sqlx::Error> {
    let total: i64 = sqlx::query(
        "SELECT count(*) FROM entity_history d \
         WHERE d.entity_kind = 'feature' AND d.kind = 'deleted' \
           AND d.waterway_id = $1 AND d.section_id = $2",
    )
    .bind(waterway_id)
    .bind(section_id)
    .fetch_one(pool)
    .await?
    .get(0);

    let rows = sqlx::query(
        "SELECT d.entity_id, d.at, d.proposal_id, \
                au.id AS actor_user_id, au.username AS actor_name, \
                ru.id AS reviewer_user_id, ru.username AS reviewer_name, \
                (SELECT c->>'after' FROM entity_history h, jsonb_array_elements(h.changes) c \
                  WHERE h.entity_kind = 'feature' AND h.entity_id = d.entity_id \
                    AND h.waterway_id = d.waterway_id AND h.section_id = d.section_id \
                    AND c->>'field' = 'name' \
                  ORDER BY h.at DESC, h.id DESC LIMIT 1) AS name, \
                (SELECT c->>'after' FROM entity_history h, jsonb_array_elements(h.changes) c \
                  WHERE h.entity_kind = 'feature' AND h.entity_id = d.entity_id \
                    AND h.waterway_id = d.waterway_id AND h.section_id = d.section_id \
                    AND c->>'field' = 'feature_type' \
                  ORDER BY h.at DESC, h.id DESC LIMIT 1) AS feature_type \
         FROM entity_history d \
         LEFT JOIN users au ON au.id = d.actor_id \
         LEFT JOIN users ru ON ru.id = d.reviewer_id \
         WHERE d.entity_kind = 'feature' AND d.kind = 'deleted' \
           AND d.waterway_id = $1 AND d.section_id = $2 \
         ORDER BY d.at DESC, d.id DESC \
         LIMIT $3 OFFSET $4",
    )
    .bind(waterway_id)
    .bind(section_id)
    .bind(per_page)
    .bind((page - 1) * per_page)
    .fetch_all(pool)
    .await?;

    let items = rows
        .iter()
        .map(|r| DeletedFeature {
            feature_id: r.get("entity_id"),
            name: r.get("name"),
            feature_type: r.get("feature_type"),
            deleted_at: r.get("at"),
            deleted_by: user(r, "actor_user_id", "actor_name"),
            proposal_id: r.get("proposal_id"),
            reviewer: user(r, "reviewer_user_id", "reviewer_name"),
        })
        .collect();
    Ok((items, total))
}
