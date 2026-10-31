use sqlx::PgPool;

use super::normalize::{normalize_stored_feature_lang_code, normalize_stored_lang_codes};
use super::rows::{RETURNING_COLS, row_to_proposal, with_names};
use crate::models::{
    feature::CreateFeatureBody,
    lang::{DEFAULT_LANG_CODE, normalize_lang_code},
    proposal::{Proposal, ProposalEntityType, ProposalOperation, ProposalStatus},
    water_section::CreateSectionBody,
};
use crate::query::history::{self, EntityKind, Via};
use crate::query::{
    gauges, waterways,
    waterways::{features, sections},
};

/// Upsert a vote on a proposal. vote must be 1 or -1 (enforced by DB constraint).
pub async fn vote_proposal(
    db: &PgPool,
    proposal_id: i64,
    user_id: &str,
    vote: i16,
) -> Result<bool, sqlx::Error> {
    // The author and status guards sit in the statement, so a proposal
    // withdrawn or reviewed since the handler looked cannot take a vote.
    let done = sqlx::query(
        r#"INSERT INTO proposal_votes (proposal_id, user_id, vote)
           SELECT id, $2, $3 FROM proposals
           WHERE id = $1 AND status = 'pending' AND submitted_by <> $2
           ON CONFLICT (proposal_id, user_id)
           DO UPDATE SET vote = EXCLUDED.vote, created_at = NOW()"#,
    )
    .bind(proposal_id)
    .bind(user_id)
    .bind(vote)
    .execute(db)
    .await?;

    Ok(done.rows_affected() > 0)
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
        apply_proposal(&mut tx, &proposal, reviewer_id).await?;
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

    with_names(db, row_to_proposal(&updated_row))
        .await
        .map(Some)
}

/// Delete an entity an accepted proposal removes, and record it. Nothing
/// happens when it is already gone.
async fn delete_tracked(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    kind: EntityKind,
    id: i64,
    via: &Via<'_>,
) -> Result<(), sqlx::Error> {
    if let Some(scope) = history::scope_of(tx, kind, id).await? {
        history::tracked_delete(tx, &scope, via).await?;
    }
    Ok(())
}

/// Apply the proposed change to the live table within an open transaction,
/// writing the history step in the same transaction.
async fn apply_proposal(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    proposal: &Proposal,
    reviewer_id: &str,
) -> Result<(), sqlx::Error> {
    let data = &proposal.proposed_data;
    let via = Via::proposal(&proposal.submitted_by, proposal.id, reviewer_id);

    match (&proposal.entity_type, &proposal.operation) {
        (ProposalEntityType::Waterway, ProposalOperation::Create) => {
            waterways::insert_waterway(
                tx,
                data["name"].as_str().unwrap_or_default(),
                data["description"].as_str(),
                &via,
            )
            .await?;
        }

        (ProposalEntityType::Waterway, ProposalOperation::Update) => {
            if let Some(id) = proposal.entity_id {
                waterways::update_waterway_in(
                    tx,
                    id,
                    data["name"].as_str(),
                    data["description"].as_str(),
                    &via,
                )
                .await?;
            }
        }

        (ProposalEntityType::Waterway, ProposalOperation::Delete) => {
            if let Some(id) = proposal.entity_id {
                delete_tracked(tx, EntityKind::Waterway, id, &via).await?;
            }
        }

        (ProposalEntityType::WaterSection, ProposalOperation::Create) => {
            let waterway_id = data["waterway_id"].as_i64().unwrap_or_default();
            let mut body: CreateSectionBody =
                serde_json::from_value(data.clone()).map_err(|e| sqlx::Error::Decode(e.into()))?;
            normalize_stored_lang_codes(&mut body, proposal.id);
            sections::create_section_bundle(tx, waterway_id, &body, &via).await?;
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
                // Accept both the regions array and the legacy single-region
                // field, so proposals stored before the migration still apply.
                let regions: Option<Vec<String>> = data["regions"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(str::to_owned))
                            .collect()
                    })
                    .or_else(|| data["region"].as_str().map(|r| vec![r.to_owned()]));
                let Some(scope) = history::scope_of(tx, EntityKind::Section, id).await? else {
                    return Ok(());
                };
                history::tracked_edit(tx, &scope, &via, async |conn| {
                    sqlx::query(
                        r#"UPDATE water_sections
                       SET name        = COALESCE($1, name),
                           description = COALESCE($2, description),
                           regions     = COALESCE($3, regions),
                           country     = COALESCE($4, country),
                           location    = COALESCE(ST_GeomFromGeoJSON($5), location),
                           updated_at  = NOW()
                       WHERE id = $6"#,
                    )
                    .bind(data["name"].as_str())
                    .bind(data["description"].as_str())
                    .bind(regions)
                    .bind(data["country"].as_str())
                    .bind(location.as_deref())
                    .bind(id)
                    .execute(conn)
                    .await
                })
                .await?;
            }
        }

        (ProposalEntityType::WaterSection, ProposalOperation::Delete) => {
            if let Some(id) = proposal.entity_id {
                delete_tracked(tx, EntityKind::Section, id, &via).await?;
            }
        }

        (ProposalEntityType::Feature, ProposalOperation::Create) => {
            if let Some(section_id) = data["section_id"].as_i64() {
                let mut body: CreateFeatureBody = serde_json::from_value(data.clone())
                    .map_err(|e| sqlx::Error::Decode(e.into()))?;
                normalize_stored_feature_lang_code(&mut body, proposal.id);
                features::create_feature_bundle(tx, section_id, &body, &via).await?;
            }
        }

        (ProposalEntityType::Feature, ProposalOperation::Update) => {
            if let Some(id) = proposal.entity_id {
                let Some(scope) = history::scope_of(tx, EntityKind::Feature, id).await? else {
                    return Ok(());
                };
                history::tracked_edit(tx, &scope, &via, async |conn| {
                    // Apply water ranges if included in the delta. Each range names
                    // its gauge by an existing series_id or by a catalog reference
                    // resolved-or-created here (same path as create_feature_bundle).
                    if let Some(ranges) = data.get("water_ranges").and_then(|v| v.as_array()) {
                        for range in ranges {
                            let body: crate::models::gauge::FeatureWaterRangeBody =
                                match serde_json::from_value(range.clone()) {
                                    Ok(b) => b,
                                    Err(e) => {
                                        tracing::warn!(
                                            "Proposal {} has an unparseable water range: {e}",
                                            proposal.id
                                        );
                                        continue;
                                    }
                                };
                            let series_id =
                                crate::query::waterways::features::resolve_range_series(
                                    &mut *conn, &body,
                                )
                                .await?;
                            gauges::upsert_feature_water_range_partial(
                                &mut *conn,
                                id,
                                series_id,
                                body.range_low,
                                body.range_medium,
                                body.range_high,
                            )
                            .await?;
                        }
                    }

                    // Apply name/description if included in the delta
                    let lang = data["lang_code"].as_str().unwrap_or(DEFAULT_LANG_CODE);
                    let lang = normalize_lang_code(lang).unwrap_or_else(|_| {
                        tracing::warn!(
                            "Proposal {} carries an invalid lang_code; applying as {}",
                            proposal.id,
                            DEFAULT_LANG_CODE
                        );
                        DEFAULT_LANG_CODE.to_string()
                    });
                    if let Some(name) = data["name"]
                        .as_str()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                    {
                        features::upsert_name(&mut *conn, id, &lang, name).await?;
                    }
                    if let Some(description) = data["description"]
                        .as_str()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                    {
                        features::upsert_description(&mut *conn, id, &lang, description).await?;
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
                    .execute(&mut *conn)
                    .await?;
                    Ok(())
                })
                .await?;
            }
        }

        (ProposalEntityType::Feature, ProposalOperation::Delete) => {
            if let Some(id) = proposal.entity_id {
                delete_tracked(tx, EntityKind::Feature, id, &via).await?;
            }
        }

        (ProposalEntityType::Material, operation) => {
            super::material::apply(
                tx,
                operation,
                proposal.entity_id,
                data,
                &proposal.submitted_by,
            )
            .await?;
        }
    }

    Ok(())
}
