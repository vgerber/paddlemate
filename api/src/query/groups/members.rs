use sqlx::PgPool;

use crate::models::{
    group::{GroupId, GroupMember, GroupMemberRole},
    user::UserId,
};

pub async fn get_member_role(
    pool: &PgPool,
    group_id: GroupId,
    user_id: &str,
) -> Result<Option<GroupMemberRole>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT role AS "role: GroupMemberRole"
        FROM group_members WHERE group_id = $1 AND user_id = $2
        "#,
        group_id,
        user_id
    )
    .fetch_optional(pool)
    .await
    .map(|r| r.map(|r| r.role))
}

pub async fn add_member(
    pool: &PgPool,
    group_id: GroupId,
    user_id: &str,
    role: GroupMemberRole,
    added_by: &str,
) -> Result<Option<GroupMember>, sqlx::Error> {
    let username = sqlx::query!("SELECT username FROM users WHERE id = $1", user_id)
        .fetch_one(pool)
        .await?
        .username;

    let r = sqlx::query!(
        r#"
        INSERT INTO group_members (group_id, user_id, role, added_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role
            WHERE group_members.role <> 'owner'
        RETURNING group_id, user_id, role AS "role: GroupMemberRole", added_by, created_at
        "#,
        group_id,
        user_id,
        role as GroupMemberRole,
        added_by
    )
    .fetch_optional(pool)
    .await?;

    // None: the user is the owner, whose role never changes.
    Ok(r.map(|r| GroupMember {
        group_id: r.group_id,
        user_id: r.user_id,
        username,
        role: r.role,
        added_by: r.added_by,
        created_at: r.created_at,
    }))
}

pub async fn remove_member(
    pool: &PgPool,
    group_id: GroupId,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query!(
        "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING group_id",
        group_id,
        user_id
    )
    .fetch_optional(pool)
    .await
    .map(|r| r.is_some())
}

/// What changing a member's role did.
pub enum RoleChange {
    Changed(GroupMember),
    NotMember,
    /// The target is the owner, whose role never changes: a group without an
    /// owner could not be managed or deleted any more.
    IsOwner,
}

pub async fn set_member_role(
    pool: &PgPool,
    group_id: GroupId,
    user_id: &str,
    role: GroupMemberRole,
) -> Result<RoleChange, sqlx::Error> {
    let username = sqlx::query!("SELECT username FROM users WHERE id = $1", user_id)
        .fetch_optional(pool)
        .await?
        .map(|r| r.username);

    let Some(username) = username else {
        return Ok(RoleChange::NotMember);
    };

    // The owner guard is in the statement, so no concurrent request can slip
    // between a check and the write.
    let r = sqlx::query!(
        r#"
        UPDATE group_members SET role = $1
        WHERE group_id = $2 AND user_id = $3 AND role <> 'owner'
        RETURNING group_id, user_id, role AS "role: GroupMemberRole", added_by, created_at
        "#,
        role as GroupMemberRole,
        group_id,
        user_id
    )
    .fetch_optional(pool)
    .await?;

    if let Some(r) = r {
        return Ok(RoleChange::Changed(GroupMember {
            group_id: r.group_id,
            user_id: r.user_id,
            username,
            role: r.role,
            added_by: r.added_by,
            created_at: r.created_at,
        }));
    }
    match get_member_role(pool, group_id, user_id).await? {
        Some(GroupMemberRole::Owner) => Ok(RoleChange::IsOwner),
        _ => Ok(RoleChange::NotMember),
    }
}

pub async fn fetch_members(
    pool: &PgPool,
    group_id: GroupId,
) -> Result<Vec<GroupMember>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT gm.group_id, gm.user_id, u.username, gm.role AS "role: GroupMemberRole",
               gm.added_by, gm.created_at
        FROM group_members gm
        INNER JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = $1
        ORDER BY gm.created_at
        "#,
        group_id
    )
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| GroupMember {
                group_id: r.group_id,
                user_id: r.user_id,
                username: r.username,
                role: r.role,
                added_by: r.added_by,
                created_at: r.created_at,
            })
            .collect()
    })
}

pub async fn is_member(
    pool: &PgPool,
    group_id: GroupId,
    user_id: &UserId,
) -> Result<bool, sqlx::Error> {
    sqlx::query!(
        "SELECT group_id FROM group_members WHERE group_id = $1 AND user_id = $2",
        group_id,
        user_id.as_str()
    )
    .fetch_optional(pool)
    .await
    .map(|r| r.is_some())
}
