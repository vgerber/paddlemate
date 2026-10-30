use sqlx::PgPool;

use crate::models::{
    descent::{CreateDescentRequest, Descent},
    visibility::Visibility,
};

use super::super::gauges::water_status_for_section_at;
use super::{common::*, snapshots::*};

pub async fn create_descent(
    pool: &PgPool,
    user_id: &str,
    req: &CreateDescentRequest,
) -> Result<Descent, sqlx::Error> {
    let visibility_str = req.visibility.scope_str();
    let (shared_users, shared_groups): (&[String], &[i64]) = match &req.visibility {
        Visibility::Shared { users, groups } => (users, groups),
        _ => (&[], &[]),
    };
    let mut tx = pool.begin().await?;

    let row = sqlx::query(&format!(
        "INSERT INTO descents \
            (user_id, name, start_time, end_time, note, \
             put_in_feature_id, put_in_lat, put_in_lon, put_in_label, \
             take_out_feature_id, take_out_lat, take_out_lon, take_out_label, \
             visibility_scope, visible_from, trip_id) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::visibility_scope, $15, $16) \
         RETURNING {DESCENT_COLS}"
    ))
    .bind(user_id)
    .bind(req.name.as_deref())
    .bind(req.start_time)
    .bind(req.end_time)
    .bind(req.note.as_deref())
    .bind(req.put_in_feature_id)
    .bind(req.put_in_lat)
    .bind(req.put_in_lon)
    .bind(req.put_in_label.as_deref())
    .bind(req.take_out_feature_id)
    .bind(req.take_out_lat)
    .bind(req.take_out_lon)
    .bind(req.take_out_label.as_deref())
    .bind(visibility_str)
    .bind(req.visible_from)
    .bind(req.trip_id)
    .fetch_one(&mut *tx)
    .await?;

    let descent = row_to_descent(&row)?;
    let descent_id = descent.id;

    for s in &req.sections {
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

    for uid in shared_users {
        sqlx::query("INSERT INTO descent_visible_users (descent_id, user_id) VALUES ($1, $2)")
            .bind(descent_id)
            .bind(uid)
            .execute(&mut *tx)
            .await?;
    }

    for gid in shared_groups {
        sqlx::query("INSERT INTO descent_visible_groups (descent_id, group_id) VALUES ($1, $2)")
            .bind(descent_id)
            .bind(gid)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    // Snapshot water levels at or before the descent's end time so the reading
    // reflects conditions during the run, not when the descent was logged.
    // Non-fatal: a gauge lookup failure must never prevent a descent from being saved.
    for s in &req.sections {
        if let Ok(status) = water_status_for_section_at(pool, s.section_id, req.end_time).await {
            if !status.ranges.is_empty() {
                let _ = insert_water_snapshots(
                    pool,
                    descent_id,
                    s.section_id,
                    &status.ranges,
                    req.start_time,
                    req.end_time,
                )
                .await;
            }
        }
    }

    enrich_descent(pool, descent).await
}
