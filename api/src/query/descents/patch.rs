use chrono::{DateTime, Utc};
use sqlx::PgPool;

use crate::models::{
    descent::{Descent, DescentId, PatchDescentRequest},
    visibility::Visibility,
};

use super::common::*;

pub async fn patch_descent(
    pool: &PgPool,
    descent_id: DescentId,
    user_id: &str,
    patch: &PatchDescentRequest,
) -> Result<Option<Descent>, sqlx::Error> {
    let visibility_str: Option<&str> = patch.visibility.as_ref().map(|v| v.scope_str());
    let update_name = patch.name.is_some();
    let name_val: Option<&str> = patch.name.as_ref().and_then(|n| n.as_deref());
    let update_note = patch.note.is_some();
    let note_val: Option<&str> = patch.note.as_ref().and_then(|n| n.as_deref());
    let update_visible_from = patch.visible_from.is_some();
    let visible_from_val: Option<DateTime<Utc>> = patch.visible_from.flatten();
    let update_put_in = patch.put_in_feature_id.is_some()
        || patch.put_in_lat.is_some()
        || patch.put_in_lon.is_some()
        || patch.put_in_label.is_some();
    let update_take_out = patch.take_out_feature_id.is_some()
        || patch.take_out_lat.is_some()
        || patch.take_out_lon.is_some()
        || patch.take_out_label.is_some();

    let mut tx = pool.begin().await?;

    let row = sqlx::query(&format!(
        "UPDATE descents SET \
             start_time          = COALESCE($3::timestamptz, start_time), \
             end_time            = COALESCE($4::timestamptz, end_time), \
             name                = CASE WHEN $5::boolean THEN $6::text ELSE name END, \
             note                = CASE WHEN $7::boolean THEN $8::text ELSE note END, \
             visibility_scope    = COALESCE($9::text::visibility_scope, visibility_scope), \
             visible_from        = CASE WHEN $10::boolean THEN $11::timestamptz ELSE visible_from END, \
             put_in_feature_id   = CASE WHEN $12::boolean THEN $13::bigint ELSE put_in_feature_id END, \
             put_in_lat          = CASE WHEN $12::boolean THEN $14::float8 ELSE put_in_lat END, \
             put_in_lon          = CASE WHEN $12::boolean THEN $15::float8 ELSE put_in_lon END, \
             put_in_label        = CASE WHEN $12::boolean THEN $16::text ELSE put_in_label END, \
             take_out_feature_id = CASE WHEN $17::boolean THEN $18::bigint ELSE take_out_feature_id END, \
             take_out_lat        = CASE WHEN $17::boolean THEN $19::float8 ELSE take_out_lat END, \
             take_out_lon        = CASE WHEN $17::boolean THEN $20::float8 ELSE take_out_lon END, \
             take_out_label      = CASE WHEN $17::boolean THEN $21::text ELSE take_out_label END, \
             trip_id             = CASE WHEN $22::boolean THEN $23::bigint ELSE trip_id END, \
             updated_at          = NOW() \
         WHERE id = $1 AND user_id = $2 \
         RETURNING {DESCENT_COLS}"
    ))
    .bind(descent_id)
    .bind(user_id)
    .bind(patch.start_time)
    .bind(patch.end_time)
    .bind(update_name)
    .bind(name_val)
    .bind(update_note)
    .bind(note_val)
    .bind(visibility_str)
    .bind(update_visible_from)
    .bind(visible_from_val)
    .bind(update_put_in)
    .bind(patch.put_in_feature_id)
    .bind(patch.put_in_lat)
    .bind(patch.put_in_lon)
    .bind(patch.put_in_label.as_deref())
    .bind(update_take_out)
    .bind(patch.take_out_feature_id)
    .bind(patch.take_out_lat)
    .bind(patch.take_out_lon)
    .bind(patch.take_out_label.as_deref())
    .bind(patch.trip_id.is_some())
    .bind(patch.trip_id.flatten())
    .fetch_optional(&mut *tx)
    .await?;

    let row = match row {
        None => return Ok(None),
        Some(r) => r,
    };
    let base = row_to_descent(&row)?;

    // Sync audience tables when visibility changes.
    if let Some(ref vis) = patch.visibility {
        sqlx::query("DELETE FROM descent_visible_users  WHERE descent_id = $1")
            .bind(descent_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM descent_visible_groups WHERE descent_id = $1")
            .bind(descent_id)
            .execute(&mut *tx)
            .await?;

        if let Visibility::Shared { users, groups } = vis {
            for uid in users {
                sqlx::query(
                    "INSERT INTO descent_visible_users (descent_id, user_id) VALUES ($1, $2)",
                )
                .bind(descent_id)
                .bind(uid)
                .execute(&mut *tx)
                .await?;
            }
            for gid in groups {
                sqlx::query(
                    "INSERT INTO descent_visible_groups (descent_id, group_id) VALUES ($1, $2)",
                )
                .bind(descent_id)
                .bind(gid)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    // Replace sections when provided.
    if let Some(ref sections) = patch.sections {
        sqlx::query("DELETE FROM descent_sections WHERE descent_id = $1")
            .bind(descent_id)
            .execute(&mut *tx)
            .await?;
        for s in sections {
            sqlx::query(
                "INSERT INTO descent_sections (descent_id, section_id, sort_order, note) \
                 VALUES ($1, $2, $3, $4)",
            )
            .bind(descent_id)
            .bind(s.section_id)
            .bind(s.sort_order)
            .bind(s.note.as_deref())
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(Some(enrich_descent(pool, base).await?))
}

pub async fn delete_descent(
    pool: &PgPool,
    descent_id: DescentId,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM descents WHERE id = $1 AND user_id = $2")
        .bind(descent_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
