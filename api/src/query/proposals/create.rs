use serde_json::{Value, json};
use sqlx::{PgPool, Row};

use super::rows::{RETURNING_COLS, row_to_proposal, with_names};
use crate::models::proposal::Proposal;

/// A feature's name and description live in translation tables; the snapshot
/// carries the English one, else the oldest.
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
                r#"SELECT id, waterway_id, name, description, regions, country,
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
                    "regions": r.get::<Vec<String>, _>("regions"),
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
                          ST_AsGeoJSON(location) AS location_geojson,
                          (SELECT name FROM feature_names WHERE feature_id = features.id
                           ORDER BY (lang_code = 'en') DESC, id LIMIT 1) AS name,
                          (SELECT description FROM feature_descriptions WHERE feature_id = features.id
                           ORDER BY (lang_code = 'en') DESC, id LIMIT 1) AS description
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
                    "name": r.get::<Option<String>, _>("name"),
                    "description": r.get::<Option<String>, _>("description"),
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
    submitter_note: Option<&str>,
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
        r#"INSERT INTO proposals (entity_type, entity_id, operation, proposed_data, original_data, submitted_by, submitter_note)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING {RETURNING_COLS}"#,
    ))
    .bind(entity_type)
    .bind(entity_id)
    .bind(operation)
    .bind(proposed_data)
    .bind(original_data)
    .bind(submitted_by)
    .bind(submitter_note)
    .fetch_one(db)
    .await?;

    with_names(db, row_to_proposal(&row)).await
}
