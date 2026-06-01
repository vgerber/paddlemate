use sqlx::PgPool;

use crate::models::user::User;

pub struct UserWithFollowStatus {
    pub id: String,
    pub username: String,
    pub is_following: bool,
}

/// All users except the viewer, with a flag indicating whether the viewer follows them.
pub async fn list_all_users_with_follow_status(
    pool: &PgPool,
    viewer_id: &str,
) -> Result<Vec<UserWithFollowStatus>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT
            u.id,
            u.username,
            (uf.follower_id IS NOT NULL) AS "is_following!"
        FROM users u
        LEFT JOIN user_follows uf ON uf.follower_id = $1 AND uf.following_id = u.id
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
                is_following: r.is_following,
            })
            .collect()
    })
}

/// Users that the given user is following.
pub async fn list_following(pool: &PgPool, user_id: &str) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT u.id, u.username, u.created_at, u.updated_at
        FROM users u
        JOIN user_follows uf ON uf.following_id = u.id
        WHERE uf.follower_id = $1
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

/// Users who follow the given user.
pub async fn list_followers(pool: &PgPool, user_id: &str) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT u.id, u.username, u.created_at, u.updated_at
        FROM users u
        JOIN user_follows uf ON uf.follower_id = u.id
        WHERE uf.following_id = $1
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

pub async fn follow_user(
    pool: &PgPool,
    follower_id: &str,
    following_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO user_follows (follower_id, following_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        "#,
        follower_id,
        following_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn unfollow_user(
    pool: &PgPool,
    follower_id: &str,
    following_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM user_follows
        WHERE follower_id = $1 AND following_id = $2
        "#,
        follower_id,
        following_id
    )
    .execute(pool)
    .await?;
    Ok(())
}
