//! The one write path for history-aware edits and deletes, shared by the
//! admin routes and accepted proposals.

use sqlx::PgConnection;

use super::{EntityKind, Op, Scope, Via, record, record::record_children, snapshot::snapshot};

/// Lock the entity's row, looked up inside its parents. False when it does
/// not exist there.
async fn lock(conn: &mut PgConnection, scope: &Scope) -> Result<bool, sqlx::Error> {
    let query = match scope.kind {
        EntityKind::Waterway => {
            sqlx::query("SELECT id FROM waterways WHERE id = $1 FOR UPDATE").bind(scope.id)
        }
        EntityKind::Section => sqlx::query(
            "SELECT id FROM water_sections WHERE id = $1 AND waterway_id = $2 FOR UPDATE",
        )
        .bind(scope.id)
        .bind(scope.waterway_id),
        EntityKind::Feature => sqlx::query(
            "SELECT f.id FROM features f JOIN water_sections s ON s.id = f.section_id \
             WHERE f.id = $1 AND f.section_id = $2 AND s.waterway_id = $3 FOR UPDATE OF f",
        )
        .bind(scope.id)
        .bind(scope.section_id)
        .bind(scope.waterway_id),
    };
    let found = query.fetch_optional(&mut *conn).await?.is_some();
    if found && scope.kind == EntityKind::Waterway {
        // A feature being created holds a KEY SHARE lock on its section, not on
        // the river, so locking the river alone would let the cascade delete a
        // feature that record_children never saw. Locking the sections waits
        // for such inserts and makes later ones fail instead.
        sqlx::query("SELECT id FROM water_sections WHERE waterway_id = $1 ORDER BY id FOR UPDATE")
            .bind(scope.id)
            .fetch_all(&mut *conn)
            .await?;
    }
    Ok(found)
}

/// Lock the entity, snapshot it, run `apply`, snapshot again and record the
/// step, all on the caller's transaction. The row lock keeps the before state
/// true until the transaction ends. None when the entity does not exist.
pub async fn tracked_edit<T>(
    conn: &mut PgConnection,
    scope: &Scope,
    via: &Via<'_>,
    apply: impl AsyncFnOnce(&mut PgConnection) -> Result<T, sqlx::Error>,
) -> Result<Option<T>, sqlx::Error> {
    if !lock(conn, scope).await? {
        return Ok(None);
    }
    let Some(before) = snapshot(conn, scope).await? else {
        return Ok(None);
    };
    let out = apply(&mut *conn).await?;
    let after = snapshot(conn, scope).await?.unwrap_or_default();
    record(conn, scope, Op::Edit, via, &before, &after).await?;
    Ok(Some(out))
}

/// Delete the entity inside its parents and record the step, plus one for
/// each section and feature that goes with it. False when it does not exist.
pub async fn tracked_delete(
    conn: &mut PgConnection,
    scope: &Scope,
    via: &Via<'_>,
) -> Result<bool, sqlx::Error> {
    if !lock(conn, scope).await? {
        return Ok(false);
    }
    record_children(conn, scope, via).await?;
    let query = match scope.kind {
        EntityKind::Waterway => sqlx::query("DELETE FROM waterways WHERE id = $1").bind(scope.id),
        EntityKind::Section => {
            sqlx::query("DELETE FROM water_sections WHERE id = $1").bind(scope.id)
        }
        EntityKind::Feature => sqlx::query("DELETE FROM features WHERE id = $1").bind(scope.id),
    };
    query.execute(&mut *conn).await?;
    let empty = Default::default();
    record(conn, scope, Op::Delete, via, &empty, &empty).await?;
    Ok(true)
}
