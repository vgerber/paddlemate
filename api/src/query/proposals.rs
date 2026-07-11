use serde_json::{Value, json};
use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::proposal::{
    ListProposalsFilters, Proposal, ProposalEntityType, ProposalOperation, ProposalStatus,
};

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

/// Insert a feature (plus optional localized name/description) described by
/// proposal JSON — used for standalone feature proposals and for features
/// bundled with a new-section proposal.
async fn insert_feature_from_data(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    section_id: i64,
    data: &Value,
    created_by: &str,
) -> Result<(), sqlx::Error> {
    let feature_type = data["feature_type"].as_str().unwrap_or_default();
    let metadata = data
        .get("metadata")
        .cloned()
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
    let location = serde_json::to_string(&data["location"])
        .map_err(|e| sqlx::Error::Decode(e.into()))?;
    let row = sqlx::query(
        r#"INSERT INTO features (section_id, feature_type, metadata, location, created_by)
           VALUES ($1, $2::feature_type, $3, ST_GeomFromGeoJSON($4), $5) RETURNING id"#,
    )
    .bind(section_id)
    .bind(feature_type)
    .bind(metadata)
    .bind(&location)
    .bind(created_by)
    .fetch_one(&mut **tx)
    .await?;
    let feature_id: i64 = row.get("id");

    let lang_code = data["lang_code"].as_str().unwrap_or("en");
    if let Some(name) = data["name"].as_str() {
        sqlx::query(
            "INSERT INTO feature_names (feature_id, lang_code, name) VALUES ($1, $2, $3) \
             ON CONFLICT (feature_id, lang_code) DO UPDATE SET name = EXCLUDED.name",
        )
        .bind(feature_id)
        .bind(lang_code)
        .bind(name)
        .execute(&mut **tx)
        .await?;
    }
    if let Some(description) = data["description"].as_str() {
        sqlx::query(
            "INSERT INTO feature_descriptions (feature_id, lang_code, description) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (feature_id, lang_code) DO UPDATE SET description = EXCLUDED.description",
        )
        .bind(feature_id)
        .bind(lang_code)
        .bind(description)
        .execute(&mut **tx)
        .await?;
    }

    // Gauge thresholds bundled with the feature
    if let Some(ranges) = data.get("water_ranges").and_then(|v| v.as_array()) {
        for range in ranges {
            let Some(series_id) = range["series_id"].as_i64() else {
                continue;
            };
            sqlx::query(
                r#"INSERT INTO feature_water_ranges
                   (feature_id, series_id, range_low, range_medium, range_high)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (feature_id, series_id)
                   DO UPDATE SET range_low    = EXCLUDED.range_low,
                                 range_medium = EXCLUDED.range_medium,
                                 range_high   = EXCLUDED.range_high,
                                 updated_at   = NOW()"#,
            )
            .bind(feature_id)
            .bind(series_id)
            .bind(range["range_low"].as_f64())
            .bind(range["range_medium"].as_f64())
            .bind(range["range_high"].as_f64())
            .execute(&mut **tx)
            .await?;
        }
    }
    Ok(())
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
            let waterway_id = data["waterway_id"].as_i64();
            let location = serde_json::to_string(&data["location"])
                .map_err(|e| sqlx::Error::Decode(e.into()))?;
            let row = sqlx::query(
                "INSERT INTO water_sections (waterway_id, name, description, region, country, location) \
                 VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6)) RETURNING id",
            )
            .bind(waterway_id)
            .bind(data["name"].as_str().unwrap_or_default())
            .bind(data["description"].as_str())
            .bind(data["region"].as_str())
            .bind(data["country"].as_str())
            .bind(&location)
            .fetch_one(&mut **tx)
            .await?;
            let section_id: i64 = row.get("id");

            // Localized names/descriptions bundled with the section proposal
            if let Some(translations) = data.get("translations").and_then(|v| v.as_array()) {
                for translation in translations {
                    let Some(lang_code) = translation["lang_code"].as_str() else {
                        continue;
                    };
                    if let Some(name) = translation["name"].as_str() {
                        sqlx::query(
                            "INSERT INTO section_names (section_id, lang_code, name) \
                             VALUES ($1, $2, $3) \
                             ON CONFLICT (section_id, lang_code) DO UPDATE SET name = EXCLUDED.name",
                        )
                        .bind(section_id)
                        .bind(lang_code)
                        .bind(name)
                        .execute(&mut **tx)
                        .await?;
                    }
                    if let Some(description) = translation["description"].as_str() {
                        sqlx::query(
                            "INSERT INTO section_descriptions (section_id, lang_code, description) \
                             VALUES ($1, $2, $3) \
                             ON CONFLICT (section_id, lang_code) DO UPDATE SET description = EXCLUDED.description",
                        )
                        .bind(section_id)
                        .bind(lang_code)
                        .bind(description)
                        .execute(&mut **tx)
                        .await?;
                    }
                }
            }

            // Features bundled with the section proposal
            if let Some(features) = data.get("features").and_then(|v| v.as_array()) {
                for feature in features {
                    insert_feature_from_data(tx, section_id, feature, &proposal.submitted_by)
                        .await?;
                }
            }
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
                           location    = COALESCE(ST_GeomFromGeoJSON($3), location),
                           updated_at  = NOW()
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
            if let Some(section_id) = data["section_id"].as_i64() {
                insert_feature_from_data(tx, section_id, data, &proposal.submitted_by).await?;
            }
        }

        (ProposalEntityType::Feature, ProposalOperation::Update) => {
            if let Some(id) = proposal.entity_id {
                // Apply water ranges if included in the delta
                if let Some(ranges) = data.get("water_ranges").and_then(|v| v.as_array()) {
                    for range in ranges {
                        sqlx::query(
                            r#"INSERT INTO feature_water_ranges
                               (feature_id, series_id, range_low, range_medium, range_high)
                               VALUES ($1, $2, $3, $4, $5)
                               ON CONFLICT (feature_id, series_id)
                               DO UPDATE SET range_low    = EXCLUDED.range_low,
                                             range_medium = EXCLUDED.range_medium,
                                             range_high   = EXCLUDED.range_high,
                                             updated_at   = NOW()"#,
                        )
                        .bind(id)
                        .bind(range["series_id"].as_i64())
                        .bind(range["range_low"].as_f64())
                        .bind(range["range_medium"].as_f64())
                        .bind(range["range_high"].as_f64())
                        .execute(&mut **tx)
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
