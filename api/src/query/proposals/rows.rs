use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::proposal::{Proposal, ProposalEntityType, ProposalOperation, ProposalStatus};

pub(super) fn parse_entity_type(s: &str) -> ProposalEntityType {
    match s {
        "waterway" => ProposalEntityType::Waterway,
        "water_section" => ProposalEntityType::WaterSection,
        "material" => ProposalEntityType::Material,
        "material_photo" => ProposalEntityType::MaterialPhoto,
        _ => ProposalEntityType::Feature,
    }
}

pub(super) fn parse_operation(s: &str) -> ProposalOperation {
    match s {
        "update" => ProposalOperation::Update,
        "delete" => ProposalOperation::Delete,
        _ => ProposalOperation::Create,
    }
}

pub(super) fn parse_status(s: &str) -> ProposalStatus {
    match s {
        "approved" => ProposalStatus::Approved,
        "rejected" => ProposalStatus::Rejected,
        _ => ProposalStatus::Pending,
    }
}

/// Parse a row that contains only base proposal columns (no vote aggregates).
/// Used for INSERT/UPDATE RETURNING results where subqueries are not possible.
pub(super) fn row_to_proposal(row: &PgRow) -> Proposal {
    Proposal {
        id: row.get("id"),
        entity_type: parse_entity_type(&row.get::<String, _>("entity_type")),
        entity_id: row.get("entity_id"),
        operation: parse_operation(&row.get::<String, _>("operation")),
        proposed_data: row.get("proposed_data"),
        original_data: row.get("original_data"),
        submitted_by: row.get("submitted_by"),
        // The listing queries join the names in (`row_to_proposal_full`);
        // RETURNING rows get them from `with_names`.
        submitted_by_name: None,
        status: parse_status(&row.get::<String, _>("status")),
        reviewed_by: row.get("reviewed_by"),
        reviewed_by_name: None,
        review_note: row.get("review_note"),
        submitter_note: row.get("submitter_note"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        upvotes: 0,
        downvotes: 0,
        user_vote: None,
    }
}

/// Fill in the usernames of a proposal built from a RETURNING row.
pub(super) async fn with_names(db: &PgPool, mut p: Proposal) -> Result<Proposal, sqlx::Error> {
    let row = sqlx::query(
        "SELECT (SELECT username FROM users WHERE id = $1) AS submitted, \
                (SELECT username FROM users WHERE id = $2) AS reviewed",
    )
    .bind(&p.submitted_by)
    .bind(p.reviewed_by.as_deref())
    .fetch_one(db)
    .await?;
    p.submitted_by_name = row.get("submitted");
    p.reviewed_by_name = row.get("reviewed");
    Ok(p)
}

/// Parse a row that includes vote aggregate columns (upvotes, downvotes, user_vote).
pub(super) fn row_to_proposal_full(row: &PgRow) -> Proposal {
    let mut p = row_to_proposal(row);
    p.upvotes = row.get("upvotes");
    p.downvotes = row.get("downvotes");
    p.user_vote = row.get("user_vote");
    p.submitted_by_name = row.get("submitted_by_name");
    p.reviewed_by_name = row.get("reviewed_by_name");
    p
}

/// Base column list used in RETURNING clauses (no aggregates).
pub(super) const RETURNING_COLS: &str = "id, entity_type, entity_id, operation, proposed_data, submitted_by, \
    original_data, status, reviewed_by, review_note, submitter_note, created_at, updated_at";
