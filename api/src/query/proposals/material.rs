//! Proposals against the material wiki: the capped submit and the apply step.

use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool};

use super::create::insert_row;
use super::rows::{row_to_proposal, with_names};
use crate::models::{
    material::{Material, MaterialBody},
    proposal::{Proposal, ProposalOperation},
};
use crate::query::materials;

/// Material proposals one user may send per day.
pub const MAX_PER_DAY: i64 = materials::MAX_NEW_PER_DAY;

/// Material proposals one user may have waiting for review at once.
pub const MAX_PENDING: i64 = 50;

/// Why a material proposal was not stored.
#[derive(Debug)]
pub enum SubmitError {
    /// Over `MAX_PER_DAY` in the last day or `MAX_PENDING` waiting.
    OverLimit,
    /// The entry the proposal is about does not exist.
    Gone,
    /// The user already has an update or delete waiting on this entry.
    AlreadyPending,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for SubmitError {
    fn from(err: sqlx::Error) -> Self {
        SubmitError::Db(err)
    }
}

/// An entry as a proposal's `original_data` shows it: the writable fields
/// plus the id.
fn snapshot(material: &Material) -> Value {
    let mut value = serde_json::to_value(MaterialBody::from(material)).unwrap_or(Value::Null);
    if let Some(map) = value.as_object_mut() {
        map.insert("id".into(), json!(material.id));
    }
    value
}

/// Store a proposal to create, replace or delete an entry. For update and
/// delete the entry is snapshotted as it is now. The count and the insert run
/// under the user's advisory lock (the one `materials::create` takes), so
/// parallel requests cannot both pass the caps.
pub async fn submit(
    db: &PgPool,
    operation: &str,
    entity_id: Option<i64>,
    data: Value,
    user_id: &str,
    note: Option<&str>,
) -> Result<Proposal, SubmitError> {
    let original = match entity_id {
        Some(id) => match materials::fetch(db, id).await? {
            Some(material) => Some(snapshot(&material)),
            None => return Err(SubmitError::Gone),
        },
        None => None,
    };

    let mut tx = db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('materials:' || $1))")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let (recent, pending): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day'), \
                COUNT(*) FILTER (WHERE status = 'pending') \
         FROM proposals WHERE entity_type = 'material' AND submitted_by = $1",
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    if recent >= MAX_PER_DAY || pending >= MAX_PENDING {
        return Err(SubmitError::OverLimit);
    }
    // The partial unique index allows one pending update or delete per user
    // and entry.
    let row = match insert_row(
        &mut tx, "material", entity_id, operation, data, original, user_id, note,
    )
    .await
    {
        Ok(row) => row,
        Err(sqlx::Error::Database(e))
            if e.constraint() == Some("uniq_proposals_material_pending_change") =>
        {
            return Err(SubmitError::AlreadyPending);
        }
        Err(e) => return Err(e.into()),
    };
    tx.commit().await?;
    Ok(with_names(db, row_to_proposal(&row)).await?)
}

/// Apply an approved material proposal on the reviewer's transaction, through
/// the writes the admin path uses. The stored body is applied as it is: like
/// the waterway proposals, an update is not checked against changes made since
/// it was proposed, and one whose entry is gone does nothing. The submitter is
/// recorded as the author, so a catalogue reseed never overwrites the edit.
pub(super) async fn apply(
    conn: &mut PgConnection,
    operation: &ProposalOperation,
    entity_id: Option<i64>,
    data: &Value,
    submitted_by: &str,
) -> Result<(), sqlx::Error> {
    if matches!(operation, ProposalOperation::Delete) {
        if let Some(id) = entity_id {
            materials::delete_in(conn, id).await?;
        }
        return Ok(());
    }
    let mut body: MaterialBody =
        serde_json::from_value(data.clone()).map_err(|e| sqlx::Error::Decode(e.into()))?;
    body.normalize();
    match (operation, entity_id) {
        (ProposalOperation::Update, Some(id)) => {
            materials::update_in(conn, id, &body, submitted_by).await?;
        }
        (ProposalOperation::Create, _) => {
            materials::create_in(conn, &body, submitted_by).await?;
        }
        _ => {}
    }
    Ok(())
}
