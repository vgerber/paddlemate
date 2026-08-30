use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::comment::{
    Comment, CommentCategory, CommentEntityType, CommentId, CommentStatus,
};
use crate::query::media::list_media_for_comments;

const COMMENT_COLS: &str = "id, entity_type, entity_id, body, category, status, author_id, \
                            ST_AsGeoJSON(location) AS location, created_at, updated_at";

fn parse_entity_type(s: &str) -> CommentEntityType {
    match s {
        "feature" => CommentEntityType::Feature,
        "waterway" => CommentEntityType::Waterway,
        _ => CommentEntityType::WaterSection,
    }
}

fn row_to_comment(row: &PgRow) -> Comment {
    Comment {
        id: row.get("id"),
        entity_type: parse_entity_type(&row.get::<String, _>("entity_type")),
        entity_id: row.get("entity_id"),
        body: row.get("body"),
        category: CommentCategory::parse(&row.get::<String, _>("category"))
            .unwrap_or(CommentCategory::Info),
        status: CommentStatus::parse(&row.get::<String, _>("status")).unwrap_or(CommentStatus::Ok),
        author_id: row.get("author_id"),
        author_name: None,
        location: row
            .get::<Option<String>, _>("location")
            .and_then(|raw| serde_json::from_str(&raw).ok()),
        media: vec![],
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

/// Every note on a river and on its sections, oldest first - the overview
/// a river page shows before you narrow to one section.
pub async fn list_river_comments(
    db: &PgPool,
    waterway_id: i64,
) -> Result<Vec<Comment>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {COMMENT_COLS} FROM comments
         WHERE status <> 'spam'
           AND ((entity_type = 'waterway' AND entity_id = $1)
                OR (entity_type = 'water_section'
                    AND entity_id IN (SELECT id FROM water_sections WHERE waterway_id = $1)))
         ORDER BY created_at"
    ))
    .bind(waterway_id)
    .fetch_all(db)
    .await?;
    with_media(db, rows.iter().map(row_to_comment).collect()).await
}

pub async fn list_comments(
    db: &PgPool,
    entity_type: &str,
    entity_id: i64,
) -> Result<Vec<Comment>, sqlx::Error> {
    // Spam is filtered out for everyone; merged and outdated notes stay in
    // the response so a client can fold them away rather than lose them.
    let rows = sqlx::query(&format!(
        "SELECT {COMMENT_COLS} FROM comments
         WHERE entity_type = $1 AND entity_id = $2 AND status <> 'spam'
         ORDER BY created_at"
    ))
    .bind(entity_type)
    .bind(entity_id)
    .fetch_all(db)
    .await?;

    with_media(db, rows.iter().map(row_to_comment).collect()).await
}

/// Hang each note's photos on it, in one extra query for the whole thread.
async fn with_media(db: &PgPool, mut comments: Vec<Comment>) -> Result<Vec<Comment>, sqlx::Error> {
    let ids: Vec<i64> = comments.iter().map(|comment| comment.id).collect();
    for item in list_media_for_comments(db, &ids).await? {
        if let Some(comment) = comments
            .iter_mut()
            .find(|comment| Some(comment.id) == item.comment_id)
        {
            comment.media.push(item);
        }
    }
    Ok(comments)
}

pub async fn insert_comment(
    db: &PgPool,
    entity_type: &str,
    entity_id: i64,
    body: &str,
    category: CommentCategory,
    author_id: &str,
    location_geojson: Option<&str>,
) -> Result<Comment, sqlx::Error> {
    let row = sqlx::query(&format!(
        "INSERT INTO comments (entity_type, entity_id, body, category, author_id, location)
             VALUES ($1, $2, $3, $4, $5,
                     CASE WHEN $6::text IS NULL THEN NULL
                          ELSE ST_SetSRID(ST_GeomFromGeoJSON($6), 4326) END)
             RETURNING {COMMENT_COLS}"
    ))
    .bind(entity_type)
    .bind(entity_id)
    .bind(body)
    .bind(category.as_str())
    .bind(author_id)
    .bind(location_geojson)
    .fetch_one(db)
    .await?;

    Ok(row_to_comment(&row))
}

/// Update a comment body. Only the original author can update.
/// Returns None if the comment does not exist or the caller is not the author.
pub async fn update_comment(
    db: &PgPool,
    comment_id: CommentId,
    body: &str,
    category: Option<CommentCategory>,
    author_id: &str,
) -> Result<Option<Comment>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "UPDATE comments
         SET body = $1, category = COALESCE($4, category), updated_at = NOW()
         WHERE id = $2 AND author_id = $3
         RETURNING {COMMENT_COLS}"
    ))
    .bind(body)
    .bind(comment_id)
    .bind(author_id)
    .bind(category.map(|c| c.as_str()))
    .fetch_optional(db)
    .await?;

    Ok(row.as_ref().map(row_to_comment))
}

/// Delete a comment. Authors can delete their own; admins can delete any.
/// Returns true if a row was deleted.
pub async fn delete_comment(
    db: &PgPool,
    comment_id: CommentId,
    caller_id: &str,
    is_admin: bool,
) -> Result<bool, sqlx::Error> {
    let result =
        sqlx::query("DELETE FROM comments WHERE id = $1 AND (author_id = $2 OR $3::boolean)")
            .bind(comment_id)
            .bind(caller_id)
            .bind(is_admin)
            .execute(db)
            .await?;

    Ok(result.rows_affected() > 0)
}

/// Set a note's status. Admin moderation, so no author check.
pub async fn moderate_comment(
    db: &PgPool,
    comment_id: CommentId,
    status: CommentStatus,
) -> Result<Option<Comment>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "UPDATE comments SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING {COMMENT_COLS}"
    ))
    .bind(status.as_str())
    .bind(comment_id)
    .fetch_optional(db)
    .await?;
    Ok(row.as_ref().map(row_to_comment))
}

/// Fill in display names for a thread's authors. Cached per user, so a
/// thread by three people costs at most three directory lookups, and a
/// failure just leaves the id in place.
pub async fn resolve_author_names(app: &crate::state::AppState, comments: &mut [Comment]) {
    let mut ids: Vec<String> = comments
        .iter()
        .map(|comment| comment.author_id.clone())
        .collect();
    ids.sort();
    ids.dedup();

    let mut names = std::collections::HashMap::new();
    for id in ids {
        if let Ok(name) = crate::query::users::get_username(app, &id).await {
            names.insert(id, name);
        }
    }
    for comment in comments {
        comment.author_name = names.get(&comment.author_id).cloned();
    }
}
