use sqlx::PgPool;

use crate::models::user::User;

pub struct UserWithFollowStatus {
    pub id: String,
    pub username: String,
    /// Status of the viewer's outgoing follow: "pending" | "accepted" | None.
    pub outgoing_status: Option<String>,
    /// Whether this user has a pending request to follow the viewer.
    pub incoming_pending: bool,
}

/// All users except the viewer, with outgoing status and incoming pending flag.
pub async fn list_all_users_with_follow_status(
    pool: &PgPool,
    viewer_id: &str,
) -> Result<Vec<UserWithFollowStatus>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT
            u.id,
            u.username,
            out_f.status AS "outgoing_status?: String",
            (in_f.follower_id IS NOT NULL) AS "incoming_pending!"
        FROM users u
        LEFT JOIN user_follows out_f
            ON out_f.follower_id = $1 AND out_f.following_id = u.id
        LEFT JOIN user_follows in_f
            ON in_f.following_id = $1
            AND in_f.follower_id = u.id
            AND in_f.status = 'pending'
        WHERE u.id != $1
        ORDER BY u.username
        "#,
        viewer_id
    )
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| UserWithFollowStatus {
                id: r.id,
                username: r.username,
                outgoing_status: r.outgoing_status,
                incoming_pending: r.incoming_pending,
            })
            .collect()
    })
}

/// Users that the given user is following (accepted only).
pub async fn list_following(pool: &PgPool, user_id: &str) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT u.id, u.username, u.created_at, u.updated_at
        FROM users u
        JOIN user_follows uf ON uf.following_id = u.id
        WHERE uf.follower_id = $1 AND uf.status = 'accepted'
        ORDER BY u.username
        "#,
        user_id
    )
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| User {
                id: r.id,
                username: r.username,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect()
    })
}

/// Users who follow the given user (accepted only).
pub async fn list_followers(pool: &PgPool, user_id: &str) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT u.id, u.username, u.created_at, u.updated_at
        FROM users u
        JOIN user_follows uf ON uf.follower_id = u.id
        WHERE uf.following_id = $1 AND uf.status = 'accepted'
        ORDER BY u.username
        "#,
        user_id
    )
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| User {
                id: r.id,
                username: r.username,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect()
    })
}

/// Users who have sent a pending follow request to the given user.
pub async fn list_pending_requests(pool: &PgPool, user_id: &str) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT u.id, u.username, u.created_at, u.updated_at
        FROM users u
        JOIN user_follows uf ON uf.follower_id = u.id
        WHERE uf.following_id = $1 AND uf.status = 'pending'
        ORDER BY uf.created_at
        "#,
        user_id
    )
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| User {
                id: r.id,
                username: r.username,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect()
    })
}

/// Send a follow request (creates a pending relationship).
pub async fn follow_user(
    pool: &PgPool,
    follower_id: &str,
    following_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO user_follows (follower_id, following_id, status)
        VALUES ($1, $2, 'pending')
        ON CONFLICT DO NOTHING
        "#,
        follower_id,
        following_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Accept a pending follow request. Returns true if a row was updated.
pub async fn accept_follow(
    pool: &PgPool,
    follower_id: &str,
    following_id: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        r#"
        UPDATE user_follows
        SET status = 'accepted'
        WHERE follower_id = $1 AND following_id = $2 AND status = 'pending'
        "#,
        follower_id,
        following_id
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// Remove a follow relationship. Either party may call this:
/// the follower cancels their own request/follow, or the target rejects
/// an incoming pending request.
pub async fn delete_follow(
    pool: &PgPool,
    requester_id: &str,
    other_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM user_follows
        WHERE (follower_id = $1 AND following_id = $2)
           OR (follower_id = $2 AND following_id = $1 AND status = 'pending')
        "#,
        requester_id,
        other_id
    )
    .execute(pool)
    .await?;
    Ok(())
}
