use sqlx::{PgPool, Row, postgres::PgRow};

use crate::models::comment::{Comment, CommentEntityType, CommentId};

fn parse_entity_type(s: &str) -> CommentEntityType {
    match s {
        "feature" => CommentEntityType::Feature,
        _ => CommentEntityType::WaterSection,
    }
}

fn row_to_comment(row: &PgRow) -> Comment {
    Comment {
        id: row.get("id"),
        entity_type: parse_entity_type(&row.get::<String, _>("entity_type")),
        entity_id: row.get("entity_id"),
        body: row.get("body"),
        author_id: row.get("author_id"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

pub async fn list_comments(
    db: &PgPool,
    entity_type: &str,
    entity_id: i64,
) -> Result<Vec<Comment>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, entity_type, entity_id, body, author_id, created_at, updated_at
         FROM comments WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at",
    )
    .bind(entity_type)
    .bind(entity_id)
    .fetch_all(db)
    .await?;

    Ok(rows.iter().map(row_to_comment).collect())
}

pub async fn insert_comment(
    db: &PgPool,
    entity_type: &str,
    entity_id: i64,
    body: &str,
    author_id: &str,
) -> Result<Comment, sqlx::Error> {
    let row = sqlx::query(
        r#"INSERT INTO comments (entity_type, entity_id, body, author_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, entity_type, entity_id, body, author_id, created_at, updated_at"#,
    )
    .bind(entity_type)
    .bind(entity_id)
    .bind(body)
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
    author_id: &str,
) -> Result<Option<Comment>, sqlx::Error> {
    let row = sqlx::query(
        r#"UPDATE comments SET body = $1, updated_at = NOW()
           WHERE id = $2 AND author_id = $3
           RETURNING id, entity_type, entity_id, body, author_id, created_at, updated_at"#,
    )
    .bind(body)
    .bind(comment_id)
    .bind(author_id)
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
