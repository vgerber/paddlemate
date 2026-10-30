use sqlx::{PgPool, Row};

use super::rows::row_to_proposal_full;
use crate::models::proposal::{ListProposalsFilters, Proposal};

/// List proposals with wide filtering support.
/// Visibility (auth-based) filtering must be applied by the caller before invoking this:
///   - unauthenticated: set filters.status = Some("pending")
///   - non-admin auth: set filters.visible_to = Some(viewer_user_id)
///   - admin: leave unrestricted
///
/// Returns one page and the total across all pages.
pub async fn list_proposals(
    db: &PgPool,
    filters: ListProposalsFilters,
    viewer_user_id: Option<&str>,
) -> Result<(Vec<Proposal>, i64), sqlx::Error> {
    let page = filters.page;
    let (items, total) = list_proposals_page(db, &filters, viewer_user_id).await?;
    if items.is_empty() && page > 1 {
        // Past the last page the window count has no row to ride on.
        let first = ListProposalsFilters {
            page: 1,
            per_page: 1,
            ..filters
        };
        let (_, total) = list_proposals_page(db, &first, viewer_user_id).await?;
        return Ok((items, total));
    }
    Ok((items, total))
}

async fn list_proposals_page(
    db: &PgPool,
    filters: &ListProposalsFilters,
    viewer_user_id: Option<&str>,
) -> Result<(Vec<Proposal>, i64), sqlx::Error> {
    let rows = sqlx::query(
        r#"SELECT COUNT(*) OVER() AS total_count, p.id, p.entity_type, p.entity_id, p.operation, p.proposed_data,
                  p.submitted_by, p.original_data, p.status, p.reviewed_by, p.review_note,
                  p.submitter_note,
                  p.created_at, p.updated_at,
                  su.username AS submitted_by_name, ru.username AS reviewed_by_name,
                  COALESCE((
                      SELECT SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END)::bigint
                      FROM proposal_votes v WHERE v.proposal_id = p.id
                  ), 0) AS upvotes,
                  COALESCE((
                      SELECT SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END)::bigint
                      FROM proposal_votes v WHERE v.proposal_id = p.id
                  ), 0) AS downvotes,
                  (SELECT v.vote FROM proposal_votes v
                   WHERE v.proposal_id = p.id AND v.user_id = $1) AS user_vote
           FROM proposals p
           LEFT JOIN users su ON su.id = p.submitted_by
           LEFT JOIN users ru ON ru.id = p.reviewed_by
           WHERE ($2::text   IS NULL OR p.status       = $2)
             AND ($3::text   IS NULL OR p.entity_type  = $3)
             AND ($4::text   IS NULL OR p.operation    = $4)
             AND ($5::text   IS NULL OR p.submitted_by = $5)
             AND ($11::text  IS NULL OR p.status = 'pending' OR p.submitted_by = $11)
             AND ($6::bigint IS NULL OR (
                     p.entity_type = 'feature' AND p.entity_id = $6
                 ))
             AND ($7::bigint IS NULL OR (
                     (p.entity_type = 'water_section' AND p.entity_id = $7)
                     OR (p.entity_type = 'feature'
                         AND p.entity_id IN (SELECT id FROM features WHERE section_id = $7))
                     OR (p.entity_type = 'feature'
                         AND p.entity_id IS NULL
                         AND (p.proposed_data->>'section_id')::bigint = $7)
                 ))
             AND ($8::bigint IS NULL OR (
                     (p.entity_type = 'waterway' AND p.entity_id = $8)
                     OR (p.entity_type = 'water_section'
                         AND p.entity_id IN (
                             SELECT id FROM water_sections WHERE waterway_id = $8))
                     OR (p.entity_type = 'water_section'
                         AND p.entity_id IS NULL
                         AND (p.proposed_data->>'waterway_id')::bigint = $8)
                     OR (p.entity_type = 'feature'
                         AND p.entity_id IN (
                             SELECT f.id FROM features f
                             JOIN water_sections s ON s.id = f.section_id
                             WHERE s.waterway_id = $8))
                     OR (p.entity_type = 'feature'
                         AND p.entity_id IS NULL
                         AND (p.proposed_data->>'section_id')::bigint IN (
                             SELECT id FROM water_sections WHERE waterway_id = $8))
                 ))
           ORDER BY p.created_at DESC, p.id DESC
           LIMIT $9 OFFSET $10"#,
    )
    .bind(viewer_user_id)
    .bind(filters.status.as_deref())
    .bind(filters.entity_type.as_deref())
    .bind(filters.operation.as_deref())
    .bind(filters.submitted_by.as_deref())
    .bind(filters.feature_id)
    .bind(filters.section_id)
    .bind(filters.waterway_id)
    .bind(filters.per_page)
    .bind((filters.page - 1) * filters.per_page)
    .bind(filters.visible_to.as_deref())
    .fetch_all(db)
    .await?;

    let total = rows.first().map_or(0, |r| r.get::<i64, _>("total_count"));
    Ok((rows.iter().map(row_to_proposal_full).collect(), total))
}

/// Fetch a single proposal by ID including vote counts.
/// Visibility enforcement (status / ownership) is handled by the route handler.
pub async fn get_proposal(
    db: &PgPool,
    proposal_id: i64,
    viewer_user_id: Option<&str>,
) -> Result<Option<Proposal>, sqlx::Error> {
    let row = sqlx::query(
        r#"SELECT p.id, p.entity_type, p.entity_id, p.operation, p.proposed_data,
                  p.submitted_by, p.original_data, p.status, p.reviewed_by, p.review_note,
                  p.submitter_note,
                  p.created_at, p.updated_at,
                  su.username AS submitted_by_name, ru.username AS reviewed_by_name,
                  COALESCE((
                      SELECT SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END)::bigint
                      FROM proposal_votes v WHERE v.proposal_id = p.id
                  ), 0) AS upvotes,
                  COALESCE((
                      SELECT SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END)::bigint
                      FROM proposal_votes v WHERE v.proposal_id = p.id
                  ), 0) AS downvotes,
                  (SELECT v.vote FROM proposal_votes v
                   WHERE v.proposal_id = p.id AND v.user_id = $1) AS user_vote
           FROM proposals p
           LEFT JOIN users su ON su.id = p.submitted_by
           LEFT JOIN users ru ON ru.id = p.reviewed_by
           WHERE p.id = $2"#,
    )
    .bind(viewer_user_id)
    .bind(proposal_id)
    .fetch_optional(db)
    .await?;

    Ok(row.as_ref().map(row_to_proposal_full))
}
