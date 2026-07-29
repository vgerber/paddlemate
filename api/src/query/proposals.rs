use serde_json::{Value, json};
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::{
    feature::CreateFeatureBody,
    lang::{DEFAULT_LANG_CODE, normalize_lang_code},
    proposal::{
        ListProposalsFilters, Proposal, ProposalEntityType, ProposalOperation, ProposalStatus,
    },
    water_section::CreateSectionBody,
};
use crate::query::{features, gauges, sections};

/// Proposals submitted before language tags were normalized at the API
/// boundary still hold whatever the client sent. Approving one must not fail on
/// that, so the tag is normalized here and an unusable one falls back to the
/// default rather than blocking the reviewer.
fn normalize_stored_feature_lang_code(body: &mut CreateFeatureBody, proposal_id: i64) {
    if body.normalize_lang_code().is_err() {
        tracing::warn!(
            "Proposal {} carries an invalid lang_code {:?}; storing it as {}",
            proposal_id,
            body.lang_code,
            DEFAULT_LANG_CODE
        );
        body.lang_code = Some(DEFAULT_LANG_CODE.to_string());
    }
}

/// Same for a section bundle, covering its translations and bundled features.
fn normalize_stored_lang_codes(body: &mut CreateSectionBody, proposal_id: i64) {
    for translation in &mut body.translations {
        if let Ok(code) = normalize_lang_code(&translation.lang_code) {
            translation.lang_code = code;
        } else {
            tracing::warn!(
                "Proposal {} carries an invalid lang_code {:?}; storing it as {}",
                proposal_id,
                translation.lang_code,
                DEFAULT_LANG_CODE
            );
            translation.lang_code = DEFAULT_LANG_CODE.to_string();
        }
    }
    for feature in &mut body.features {
        normalize_stored_feature_lang_code(feature, proposal_id);
    }
}

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

/// Parse a row that contains only base proposal columns (no vote aggregates).
/// Used for INSERT/UPDATE RETURNING results where subqueries are not possible.
fn row_to_proposal(row: &PgRow) -> Proposal {
    Proposal {
        id: row.get("id"),
        entity_type: parse_entity_type(&row.get::<String, _>("entity_type")),
        entity_id: row.get("entity_id"),
        operation: parse_operation(&row.get::<String, _>("operation")),
        proposed_data: row.get("proposed_data"),
        original_data: row.get("original_data"),
        submitted_by: row.get("submitted_by"),
        status: parse_status(&row.get::<String, _>("status")),
        reviewed_by: row.get("reviewed_by"),
        review_note: row.get("review_note"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        upvotes: 0,
        downvotes: 0,
        user_vote: None,
    }
}

/// Parse a row that includes vote aggregate columns (upvotes, downvotes, user_vote).
fn row_to_proposal_full(row: &PgRow) -> Proposal {
    let mut p = row_to_proposal(row);
    p.upvotes = row.get("upvotes");
    p.downvotes = row.get("downvotes");
    p.user_vote = row.get("user_vote");
    p
}

/// Base column list used in RETURNING clauses (no aggregates).
const RETURNING_COLS: &str = "id, entity_type, entity_id, operation, proposed_data, submitted_by, \
    original_data, status, reviewed_by, review_note, created_at, updated_at";

/// Snapshot the current state of an entity row as JSON, for use as original_data.
/// Returns None if the entity doesn't exist or the entity_type is unrecognised.
async fn snapshot_entity(
    db: &PgPool,
    entity_type: &str,
    entity_id: i64,
) -> Result<Option<Value>, sqlx::Error> {
    match entity_type {
        "waterway" => {
            let row = sqlx::query(
                "SELECT id, waterway_type::text, name, description FROM waterways WHERE id = $1",
            )
            .bind(entity_id)
            .fetch_optional(db)
            .await?;

            Ok(row.map(|r| {
                json!({
                    "id": r.get::<i64, _>("id"),
                    "waterway_type": r.get::<String, _>("waterway_type"),
                    "name": r.get::<String, _>("name"),
                    "description": r.get::<Option<String>, _>("description"),
                })
            }))
        }

        "water_section" => {
            let row = sqlx::query(
                r#"SELECT id, waterway_id, name, description, region, country,
                          river_km_start, river_km_end,
                          ST_AsGeoJSON(location) AS location_geojson
                   FROM water_sections WHERE id = $1"#,
            )
            .bind(entity_id)
            .fetch_optional(db)
            .await?;

            Ok(row.map(|r| {
                let loc: Option<String> = r.get("location_geojson");
                let location: Value = loc
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or(Value::Null);
                json!({
                    "id": r.get::<i64, _>("id"),
                    "waterway_id": r.get::<i64, _>("waterway_id"),
                    "name": r.get::<String, _>("name"),
                    "description": r.get::<Option<String>, _>("description"),
                    "region": r.get::<Option<String>, _>("region"),
                    "country": r.get::<Option<String>, _>("country"),
                    "river_km_start": r.get::<Option<f64>, _>("river_km_start"),
                    "river_km_end": r.get::<Option<f64>, _>("river_km_end"),
                    "location": location,
                })
            }))
        }

        "feature" => {
            let row = sqlx::query(
                r#"SELECT id, section_id, feature_type::text, metadata,
                          ST_AsGeoJSON(location) AS location_geojson
                   FROM features WHERE id = $1"#,
            )
            .bind(entity_id)
            .fetch_optional(db)
            .await?;

            Ok(row.map(|r| {
                let loc: Option<String> = r.get("location_geojson");
                let location: Value = loc
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or(Value::Null);
                json!({
                    "id": r.get::<i64, _>("id"),
                    "section_id": r.get::<i64, _>("section_id"),
                    "feature_type": r.get::<String, _>("feature_type"),
                    "metadata": r.get::<Value, _>("metadata"),
                    "location": location,
                })
            }))
        }

        _ => Ok(None),
    }
}

/// Insert a new proposal.
/// For update/delete operations the current entity state is automatically snapshotted
/// into original_data so reviewers can see what changed.
pub async fn insert_proposal(
    db: &PgPool,
    entity_type: &str,
    entity_id: Option<i64>,
    operation: &str,
    proposed_data: Value,
    submitted_by: &str,
) -> Result<Proposal, sqlx::Error> {
    let original_data = if matches!(operation, "update" | "delete") {
        if let Some(eid) = entity_id {
            snapshot_entity(db, entity_type, eid).await?
        } else {
            None
        }
    } else {
        None
    };

    let row = sqlx::query(&format!(
        r#"INSERT INTO proposals (entity_type, entity_id, operation, proposed_data, original_data, submitted_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING {RETURNING_COLS}"#,
    ))
    .bind(entity_type)
    .bind(entity_id)
    .bind(operation)
    .bind(proposed_data)
    .bind(original_data)
    .bind(submitted_by)
    .fetch_one(db)
    .await?;

    Ok(row_to_proposal(&row))
}

/// List proposals with wide filtering support.
/// Visibility (auth-based) filtering must be applied by the caller before invoking this:
///   - unauthenticated: set filters.status = Some("pending")
///   - non-admin auth: set filters.submitted_by = Some(viewer_user_id)
///   - admin: leave unrestricted
pub async fn list_proposals(
    db: &PgPool,
    filters: ListProposalsFilters,
    viewer_user_id: Option<&str>,
) -> Result<Vec<Proposal>, sqlx::Error> {
    let rows = sqlx::query(
        r#"SELECT p.id, p.entity_type, p.entity_id, p.operation, p.proposed_data,
                  p.submitted_by, p.original_data, p.status, p.reviewed_by, p.review_note,
                  p.created_at, p.updated_at,
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
           WHERE ($2::text   IS NULL OR p.status       = $2)
             AND ($3::text   IS NULL OR p.entity_type  = $3)
             AND ($4::text   IS NULL OR p.operation    = $4)
             AND ($5::text   IS NULL OR p.submitted_by = $5)
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
           ORDER BY p.created_at DESC"#,
    )
    .bind(viewer_user_id)
    .bind(filters.status.as_deref())
    .bind(filters.entity_type.as_deref())
    .bind(filters.operation.as_deref())
    .bind(filters.submitted_by.as_deref())
    .bind(filters.feature_id)
    .bind(filters.section_id)
    .bind(filters.waterway_id)
    .fetch_all(db)
    .await?;

    Ok(rows.iter().map(row_to_proposal_full).collect())
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
                  p.created_at, p.updated_at,
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
           WHERE p.id = $2"#,
    )
    .bind(viewer_user_id)
    .bind(proposal_id)
    .fetch_optional(db)
    .await?;

    Ok(row.as_ref().map(row_to_proposal_full))
}

/// Upsert a vote on a proposal. vote must be 1 or -1 (enforced by DB constraint).
pub async fn vote_proposal(
    db: &PgPool,
    proposal_id: i64,
    user_id: &str,
    vote: i16,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO proposal_votes (proposal_id, user_id, vote)
           VALUES ($1, $2, $3)
           ON CONFLICT (proposal_id, user_id)
           DO UPDATE SET vote = EXCLUDED.vote, created_at = NOW()"#,
    )
    .bind(proposal_id)
    .bind(user_id)
    .bind(vote)
    .execute(db)
    .await?;

    Ok(())
}

/// Remove a user's vote from a proposal.
pub async fn unvote_proposal(
    db: &PgPool,
    proposal_id: i64,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM proposal_votes WHERE proposal_id = $1 AND user_id = $2")
        .bind(proposal_id)
        .bind(user_id)
        .execute(db)
        .await?;

    Ok(())
}

/// Delete a proposal by ID. Existence, ownership and status checks are handled
/// by the route handler. Associated votes are removed via ON DELETE CASCADE.
/// Returns true if a row was removed.
pub async fn delete_proposal(db: &PgPool, proposal_id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM proposals WHERE id = $1")
        .bind(proposal_id)
        .execute(db)
        .await?;

    Ok(result.rows_affected() > 0)
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
        "SELECT {RETURNING_COLS} FROM proposals WHERE id = $1 AND status = 'pending' FOR UPDATE"
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

    let updated_row = sqlx::query(&format!(
        r#"UPDATE proposals
           SET status = $2, reviewed_by = $3, review_note = $4, updated_at = NOW()
           WHERE id = $1
           RETURNING {RETURNING_COLS}"#,
    ))
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
                    "UPDATE waterways \
                     SET name = COALESCE($1, name), \
                         description = COALESCE($2, description), \
                         updated_at = NOW() \
                     WHERE id = $3",
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
            let waterway_id = data["waterway_id"].as_i64().unwrap_or_default();
            let mut body: CreateSectionBody =
                serde_json::from_value(data.clone()).map_err(|e| sqlx::Error::Decode(e.into()))?;
            normalize_stored_lang_codes(&mut body, proposal.id);
            sections::create_section_bundle(tx, waterway_id, &body, &proposal.submitted_by).await?;
        }

        (ProposalEntityType::WaterSection, ProposalOperation::Update) => {
            if let Some(id) = proposal.entity_id {
                let location = if data["location"].is_null() {
                    None
                } else {
                    Some(
                        serde_json::to_string(&data["location"])
                            .map_err(|e| sqlx::Error::Decode(e.into()))?,
                    )
                };
                sqlx::query(
                    r#"UPDATE water_sections
                       SET name        = COALESCE($1, name),
                           description = COALESCE($2, description),
                           region      = COALESCE($3, region),
                           country     = COALESCE($4, country),
                           location    = COALESCE(ST_GeomFromGeoJSON($5), location),
                           updated_at  = NOW()
                       WHERE id = $6"#,
                )
                .bind(data["name"].as_str())
                .bind(data["description"].as_str())
                .bind(data["region"].as_str())
                .bind(data["country"].as_str())
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
            if let Some(section_id) = data["section_id"].as_i64() {
                let mut body: CreateFeatureBody = serde_json::from_value(data.clone())
                    .map_err(|e| sqlx::Error::Decode(e.into()))?;
                normalize_stored_feature_lang_code(&mut body, proposal.id);
                features::create_feature_bundle(tx, section_id, &body, &proposal.submitted_by)
                    .await?;
            }
        }

        (ProposalEntityType::Feature, ProposalOperation::Update) => {
            if let Some(id) = proposal.entity_id {
                // Apply water ranges if included in the delta
                if let Some(ranges) = data.get("water_ranges").and_then(|v| v.as_array()) {
                    for range in ranges {
                        let Some(series_id) = range["series_id"].as_i64() else {
                            continue;
                        };
                        gauges::upsert_feature_water_range_partial(
                            &mut **tx,
                            id,
                            series_id,
                            range["range_low"].as_f64(),
                            range["range_medium"].as_f64(),
                            range["range_high"].as_f64(),
                        )
                        .await?;
                    }
                }

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
                           metadata     = COALESCE($2, metadata),
                           location     = COALESCE(ST_GeomFromGeoJSON($3), location),
                           updated_at   = NOW()
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
