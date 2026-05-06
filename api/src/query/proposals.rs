use serde_json::Value;
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::proposal::{Proposal, ProposalEntityType, ProposalOperation, ProposalStatus};

fn parse_entity_type(s: &str) -> ProposalEntityType {
    match s {
        "waterway" => ProposalEntityType::Waterway,
        "water_section" => ProposalEntityType::WaterSection,
        _ => ProposalEntityType::Feature,
    }
}

fn parse_operation(s: &str) -> ProposalOperation {
    match s {
        "update" => ProposalOperation::Update,
        "delete" => ProposalOperation::Delete,
        _ => ProposalOperation::Create,
    }
}

fn parse_status(s: &str) -> ProposalStatus {
    match s {
        "approved" => ProposalStatus::Approved,
        "rejected" => ProposalStatus::Rejected,
        _ => ProposalStatus::Pending,
    }
}

fn row_to_proposal(row: &PgRow) -> Proposal {
    Proposal {
        id: row.get("id"),
        entity_type: parse_entity_type(&row.get::<String, _>("entity_type")),
        entity_id: row.get("entity_id"),
        operation: parse_operation(&row.get::<String, _>("operation")),
        proposed_data: row.get("proposed_data"),
        submitted_by: row.get("submitted_by"),
        status: parse_status(&row.get::<String, _>("status")),
        reviewed_by: row.get("reviewed_by"),
        review_note: row.get("review_note"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

const SELECT_PROPOSAL: &str = r#"
    SELECT id, entity_type, entity_id, operation, proposed_data, submitted_by,
           status, reviewed_by, review_note, created_at, updated_at
    FROM proposals
"#;

pub async fn insert_proposal(
    db: &PgPool,
    entity_type: &str,
    entity_id: Option<i64>,
    operation: &str,
    proposed_data: Value,
    submitted_by: &str,
) -> Result<Proposal, sqlx::Error> {
    let row = sqlx::query(
        r#"
        INSERT INTO proposals (entity_type, entity_id, operation, proposed_data, submitted_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, entity_type, entity_id, operation, proposed_data, submitted_by,
                  status, reviewed_by, review_note, created_at, updated_at
        "#,
    )
    .bind(entity_type)
    .bind(entity_id)
    .bind(operation)
    .bind(proposed_data)
    .bind(submitted_by)
    .fetch_one(db)
    .await?;

    Ok(row_to_proposal(&row))
}

pub async fn get_proposal(db: &PgPool, proposal_id: i64) -> Result<Option<Proposal>, sqlx::Error> {
    let row = sqlx::query(&format!("{} WHERE id = $1", SELECT_PROPOSAL))
        .bind(proposal_id)
        .fetch_optional(db)
        .await?;

    Ok(row.as_ref().map(row_to_proposal))
}

/// List proposals where entity_type is 'waterway' or 'water_section'.
/// Optionally filter by status and/or entity_type.
pub async fn list_waterway_proposals(
    db: &PgPool,
    status: Option<&str>,
    entity_type: Option<&str>,
) -> Result<Vec<Proposal>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "{} WHERE entity_type IN ('waterway', 'water_section')
         AND ($1::text IS NULL OR entity_type = $1)
         AND ($2::text IS NULL OR status = $2)
         ORDER BY created_at DESC",
        SELECT_PROPOSAL
    ))
    .bind(entity_type)
    .bind(status)
    .fetch_all(db)
    .await?;

    Ok(rows.iter().map(row_to_proposal).collect())
}

/// List feature proposals scoped to a specific waterway via section membership.
pub async fn list_feature_proposals(
    db: &PgPool,
    waterway_id: i64,
    status: Option<&str>,
) -> Result<Vec<Proposal>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "{} WHERE entity_type = 'feature'
         AND (
             (entity_id IS NOT NULL AND entity_id IN (
                 SELECT f.id FROM features f
                 JOIN water_sections s ON s.id = f.section_id
                 WHERE s.waterway_id = $1
             ))
             OR
             (entity_id IS NULL AND (proposed_data->>'section_id')::bigint IN (
                 SELECT id FROM water_sections WHERE waterway_id = $1
             ))
         )
         AND ($2::text IS NULL OR status = $2)
         ORDER BY created_at DESC",
        SELECT_PROPOSAL
    ))
    .bind(waterway_id)
    .bind(status)
    .fetch_all(db)
    .await?;

    Ok(rows.iter().map(row_to_proposal).collect())
}

/// Get a specific feature proposal, verified to belong to the given waterway.
pub async fn get_feature_proposal(
    db: &PgPool,
    proposal_id: i64,
    waterway_id: i64,
) -> Result<Option<Proposal>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "{} WHERE id = $1 AND entity_type = 'feature'
         AND (
             (entity_id IS NOT NULL AND entity_id IN (
                 SELECT f.id FROM features f
                 JOIN water_sections s ON s.id = f.section_id
                 WHERE s.waterway_id = $2
             ))
             OR
             (entity_id IS NULL AND (proposed_data->>'section_id')::bigint IN (
                 SELECT id FROM water_sections WHERE waterway_id = $2
             ))
         )",
        SELECT_PROPOSAL
    ))
    .bind(proposal_id)
    .bind(waterway_id)
    .fetch_optional(db)
    .await?;

    Ok(row.as_ref().map(row_to_proposal))
}

/// List all proposals submitted by a specific user.
pub async fn list_my_proposals(db: &PgPool, user_id: &str) -> Result<Vec<Proposal>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "{} WHERE submitted_by = $1 ORDER BY created_at DESC",
        SELECT_PROPOSAL
    ))
    .bind(user_id)
    .fetch_all(db)
    .await?;

    Ok(rows.iter().map(row_to_proposal).collect())
}

/// Review a proposal: approve or reject it.
/// Approving applies the change to the live table within the same transaction.
/// Returns None if the proposal does not exist or is not pending.
pub async fn review_proposal(
    db: &PgPool,
    proposal_id: i64,
    reviewer_id: &str,
    new_status: &ProposalStatus,
    review_note: Option<&str>,
) -> Result<Option<Proposal>, sqlx::Error> {
    let status_str = match new_status {
        ProposalStatus::Approved => "approved",
        ProposalStatus::Rejected => "rejected",
        ProposalStatus::Pending => return Ok(None),
    };

    let mut tx = db.begin().await?;

    let row = sqlx::query(&format!(
        "{} WHERE id = $1 AND status = 'pending' FOR UPDATE",
        SELECT_PROPOSAL
    ))
    .bind(proposal_id)
    .fetch_optional(&mut *tx)
    .await?;

    let row = match row {
        Some(r) => r,
        None => return Ok(None),
    };

    let proposal = row_to_proposal(&row);

    if matches!(new_status, ProposalStatus::Approved) {
        apply_proposal(&mut tx, &proposal).await?;
    }

    let updated_row = sqlx::query(
        r#"
        UPDATE proposals
        SET status = $2, reviewed_by = $3, review_note = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING id, entity_type, entity_id, operation, proposed_data, submitted_by,
                  status, reviewed_by, review_note, created_at, updated_at
        "#,
    )
    .bind(proposal_id)
    .bind(status_str)
    .bind(reviewer_id)
    .bind(review_note)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Some(row_to_proposal(&updated_row)))
}

/// Apply the proposed change to the live table within an open transaction.
async fn apply_proposal(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    proposal: &Proposal,
) -> Result<(), sqlx::Error> {
    let data = &proposal.proposed_data;

    match (&proposal.entity_type, &proposal.operation) {
        (ProposalEntityType::Waterway, ProposalOperation::Create) => {
            sqlx::query(
                "INSERT INTO waterways (waterway_type, name, description) VALUES ('river', $1, $2)",
            )
            .bind(data["name"].as_str().unwrap_or_default())
            .bind(data["description"].as_str())
            .execute(&mut **tx)
            .await?;
        }

        (ProposalEntityType::Waterway, ProposalOperation::Update) => {
            if let Some(id) = proposal.entity_id {
                sqlx::query(
                    "UPDATE waterways SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3",
                )
                .bind(data["name"].as_str())
                .bind(data["description"].as_str())
                .bind(id)
                .execute(&mut **tx)
                .await?;
            }
        }

        (ProposalEntityType::Waterway, ProposalOperation::Delete) => {
            if let Some(id) = proposal.entity_id {
                sqlx::query("DELETE FROM waterways WHERE id = $1")
                    .bind(id)
                    .execute(&mut **tx)
                    .await?;
            }
        }

        (ProposalEntityType::WaterSection, ProposalOperation::Create) => {
            let waterway_id = data["waterway_id"].as_i64();
            let location = serde_json::to_string(&data["location"])
                .map_err(|e| sqlx::Error::Decode(e.into()))?;
            sqlx::query(
                "INSERT INTO water_sections (waterway_id, name, description, location) VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4))",
            )
            .bind(waterway_id)
            .bind(data["name"].as_str().unwrap_or_default())
            .bind(data["description"].as_str())
            .bind(&location)
            .execute(&mut **tx)
            .await?;
        }

        (ProposalEntityType::WaterSection, ProposalOperation::Update) => {
            if let Some(id) = proposal.entity_id {
                let location = match &data["location"] {
                    Value::Null | Value::Object(_) if data["location"].is_null() => None,
                    v if !v.is_null() => Some(
                        serde_json::to_string(v)
                            .map_err(|e| sqlx::Error::Decode(e.into()))?,
                    ),
                    _ => None,
                };
                sqlx::query(
                    r#"UPDATE water_sections
                       SET name = COALESCE($1, name),
                           description = COALESCE($2, description),
                           location = COALESCE(ST_GeomFromGeoJSON($3), location),
                           updated_at = NOW()
                       WHERE id = $4"#,
                )
                .bind(data["name"].as_str())
                .bind(data["description"].as_str())
                .bind(location.as_deref())
                .bind(id)
                .execute(&mut **tx)
                .await?;
            }
        }

        (ProposalEntityType::WaterSection, ProposalOperation::Delete) => {
            if let Some(id) = proposal.entity_id {
                sqlx::query("DELETE FROM water_sections WHERE id = $1")
                    .bind(id)
                    .execute(&mut **tx)
                    .await?;
            }
        }

        (ProposalEntityType::Feature, ProposalOperation::Create) => {
            let section_id = data["section_id"].as_i64();
            let feature_type = data["feature_type"].as_str().unwrap_or_default();
            let metadata = data.get("metadata").cloned().unwrap_or(Value::Object(serde_json::Map::new()));
            let location = serde_json::to_string(&data["location"])
                .map_err(|e| sqlx::Error::Decode(e.into()))?;
            sqlx::query(
                r#"INSERT INTO features (section_id, feature_type, metadata, location, created_by)
                   VALUES ($1, $2::feature_type, $3, ST_GeomFromGeoJSON($4), $5)"#,
            )
            .bind(section_id)
            .bind(feature_type)
            .bind(metadata)
            .bind(&location)
            .bind(&proposal.submitted_by)
            .execute(&mut **tx)
            .await?;
        }

        (ProposalEntityType::Feature, ProposalOperation::Update) => {
            if let Some(id) = proposal.entity_id {
                let feature_type = data["feature_type"].as_str();
                let location = if data["location"].is_null() {
                    None
                } else {
                    Some(
                        serde_json::to_string(&data["location"])
                            .map_err(|e| sqlx::Error::Decode(e.into()))?,
                    )
                };
                let metadata = if data["metadata"].is_null() {
                    None
                } else {
                    data.get("metadata").cloned()
                };
                sqlx::query(
                    r#"UPDATE features
                       SET feature_type = COALESCE($1::feature_type, feature_type),
                           metadata = COALESCE($2, metadata),
                           location = COALESCE(ST_GeomFromGeoJSON($3), location),
                           updated_at = NOW()
                       WHERE id = $4"#,
                )
                .bind(feature_type)
                .bind(metadata)
                .bind(location.as_deref())
                .bind(id)
                .execute(&mut **tx)
                .await?;
            }
        }

        (ProposalEntityType::Feature, ProposalOperation::Delete) => {
            if let Some(id) = proposal.entity_id {
                sqlx::query("DELETE FROM features WHERE id = $1")
                    .bind(id)
                    .execute(&mut **tx)
                    .await?;
            }
        }
    }

    Ok(())
}
