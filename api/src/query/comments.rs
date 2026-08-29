use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::comment::{
    Comment, CommentCategory, CommentEntityType, CommentId, CommentStatus,
};
use crate::query::media::list_media_for_comments;

const COMMENT_COLS: &str = "id, entity_type, entity_id, body, category, status, author_id, \
                            created_at, updated_at";

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
        media: vec![],
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
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

    let mut comments: Vec<Comment> = rows.iter().map(row_to_comment).collect();
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
) -> Result<Comment, sqlx::Error> {
    let row = sqlx::query(&format!(
        "INSERT INTO comments (entity_type, entity_id, body, category, author_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {COMMENT_COLS}"
    ))
    .bind(entity_type)
    .bind(entity_id)
    .bind(body)
    .bind(category.as_str())
    .bind(author_id)
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
