use std::collections::BTreeMap;

use serde_json::Value;
use sqlx::{PgConnection, Row};

use super::{EntityKind, Scope};
use crate::models::lang::DEFAULT_LANG_CODE;

/// The fields of an entity as display strings, keyed by API field name.
/// A field that is absent is null. Diffing two states gives a step's changes.
pub type State = BTreeMap<String, String>;

/// Feature fields that metadata keys must not shadow.
const RESERVED: [&str; 4] = ["feature_type", "location", "name", "description"];

fn localized(field: &str, lang: &str, default_is_bare: bool) -> String {
    if default_is_bare && lang == DEFAULT_LANG_CODE {
        field.to_string()
    } else {
        format!("{field} ({lang})")
    }
}

fn put(state: &mut State, key: &str, value: Option<String>) {
    if let Some(v) = value {
        state.insert(key.to_string(), v);
    }
}

fn metadata_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Where an existing section or feature sits, looked up by its own id alone.
/// For callers that hold only that id (a proposal); route handlers already
/// have the parents from the path and build a `Scope` directly.
pub async fn scope_of(
    conn: &mut PgConnection,
    kind: EntityKind,
    id: i64,
) -> Result<Option<Scope>, sqlx::Error> {
    match kind {
        EntityKind::Waterway => {
            let found = sqlx::query("SELECT id FROM waterways WHERE id = $1")
                .bind(id)
                .fetch_optional(&mut *conn)
                .await?;
            Ok(found.map(|_| Scope::waterway(id)))
        }
        EntityKind::Section => {
            let row = sqlx::query("SELECT waterway_id FROM water_sections WHERE id = $1")
                .bind(id)
                .fetch_optional(&mut *conn)
                .await?;
            Ok(row.map(|r| Scope::section(r.get("waterway_id"), id)))
        }
        EntityKind::Feature => {
            let row = sqlx::query(
                "SELECT s.waterway_id, f.section_id FROM features f \
                 JOIN water_sections s ON s.id = f.section_id WHERE f.id = $1",
            )
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
            Ok(row.map(|r| Scope::feature(r.get("waterway_id"), r.get("section_id"), id)))
        }
    }
}

/// The entity's current state, looked up inside its parents. None when it
/// does not exist there.
pub async fn snapshot(
    conn: &mut PgConnection,
    scope: &Scope,
) -> Result<Option<State>, sqlx::Error> {
    match scope.kind {
        EntityKind::Waterway => waterway_state(conn, scope).await,
        EntityKind::Section => section_state(conn, scope).await,
        EntityKind::Feature => feature_state(conn, scope).await,
    }
}

async fn waterway_state(
    conn: &mut PgConnection,
    scope: &Scope,
) -> Result<Option<State>, sqlx::Error> {
    let row = sqlx::query("SELECT name, description FROM waterways WHERE id = $1")
        .bind(scope.id)
        .fetch_optional(&mut *conn)
        .await?;
    Ok(row.map(|r| {
        let mut state = State::new();
        put(&mut state, "name", r.get("name"));
        put(&mut state, "description", r.get("description"));
        state
    }))
}

async fn section_state(
    conn: &mut PgConnection,
    scope: &Scope,
) -> Result<Option<State>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT name, description, country, array_to_string(regions, ', ') AS regions, \
                md5(ST_AsBinary(location)) AS location \
         FROM water_sections WHERE id = $1 AND waterway_id = $2",
    )
    .bind(scope.id)
    .bind(scope.waterway_id)
    .fetch_optional(&mut *conn)
    .await?;
    let Some(row) = row else { return Ok(None) };

    let mut state = State::new();
    put(&mut state, "name", row.get("name"));
    put(&mut state, "description", row.get("description"));
    put(&mut state, "country", row.get("country"));
    put(
        &mut state,
        "regions",
        row.get::<Option<String>, _>("regions")
            .filter(|s| !s.is_empty()),
    );
    put(&mut state, "location", row.get("location"));

    for r in sqlx::query("SELECT lang_code, name FROM section_names WHERE section_id = $1")
        .bind(scope.id)
        .fetch_all(&mut *conn)
        .await?
    {
        let lang: String = r.get("lang_code");
        put(&mut state, &localized("name", &lang, false), r.get("name"));
    }
    for r in
        sqlx::query("SELECT lang_code, description FROM section_descriptions WHERE section_id = $1")
            .bind(scope.id)
            .fetch_all(&mut *conn)
            .await?
    {
        let lang: String = r.get("lang_code");
        put(
            &mut state,
            &localized("description", &lang, false),
            r.get("description"),
        );
    }
    Ok(Some(state))
}

async fn feature_state(
    conn: &mut PgConnection,
    scope: &Scope,
) -> Result<Option<State>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT f.feature_type::text AS feature_type, f.metadata, \
                md5(ST_AsBinary(f.location)) AS location \
         FROM features f JOIN water_sections s ON s.id = f.section_id \
         WHERE f.id = $1 AND f.section_id = $2 AND s.waterway_id = $3",
    )
    .bind(scope.id)
    .bind(scope.section_id)
    .bind(scope.waterway_id)
    .fetch_optional(&mut *conn)
    .await?;
    let Some(row) = row else { return Ok(None) };

    let mut state = State::new();
    put(&mut state, "feature_type", row.get("feature_type"));
    put(&mut state, "location", row.get("location"));
    if let Value::Object(map) = row.get::<Value, _>("metadata") {
        for (key, value) in map {
            if value.is_null() {
                continue;
            }
            let field = if RESERVED.contains(&key.as_str()) {
                format!("metadata.{key}")
            } else {
                key
            };
            state.insert(field, metadata_text(&value));
        }
    }

    for r in sqlx::query("SELECT lang_code, name FROM feature_names WHERE feature_id = $1")
        .bind(scope.id)
        .fetch_all(&mut *conn)
        .await?
    {
        let lang: String = r.get("lang_code");
        put(&mut state, &localized("name", &lang, true), r.get("name"));
    }
    for r in
        sqlx::query("SELECT lang_code, description FROM feature_descriptions WHERE feature_id = $1")
            .bind(scope.id)
            .fetch_all(&mut *conn)
            .await?
    {
        let lang: String = r.get("lang_code");
        put(
            &mut state,
            &localized("description", &lang, true),
            r.get("description"),
        );
    }
    for r in sqlx::query(
        "SELECT series_id, range_low, range_medium, range_high \
         FROM feature_water_ranges WHERE feature_id = $1",
    )
    .bind(scope.id)
    .fetch_all(&mut *conn)
    .await?
    {
        let num = |col: &str| {
            r.get::<Option<f64>, _>(col)
                .map_or("-".to_string(), |v| v.to_string())
        };
        let series: i64 = r.get("series_id");
        state.insert(
            format!("water_range_{series}"),
            format!(
                "{} / {} / {}",
                num("range_low"),
                num("range_medium"),
                num("range_high")
            ),
        );
    }
    Ok(Some(state))
}
