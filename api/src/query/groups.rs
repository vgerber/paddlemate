use sqlx::PgPool;

use crate::models::{
    group::{Group, GroupId, GroupMember, GroupMemberRole, GroupWithMembers},
    user::UserId,
};

pub async fn insert_group(
    pool: &PgPool,
    name: &str,
    description: Option<&str>,
    created_by: &str,
) -> Result<Group, sqlx::Error> {
    let r = sqlx::query!(
        r#"
        INSERT INTO groups (name, description, created_by)
        VALUES ($1, $2, $3)
        RETURNING id, name, description, created_by, created_at, updated_at
        "#,
        name,
        description,
        created_by
    )
    .fetch_one(pool)
    .await?;

    Ok(Group {
        id: r.id,
        name: r.name,
        description: r.description,
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
    })
}

pub async fn get_group_for_member(
    pool: &PgPool,
    group_id: GroupId,
    user_id: &str,
) -> Result<Option<GroupWithMembers>, sqlx::Error> {
    let group = sqlx::query!(
        r#"
        SELECT id, name, description, created_by, created_at, updated_at
        FROM groups
        WHERE id = $1
          AND id IN (SELECT group_id FROM group_members WHERE user_id = $2)
        "#,
        group_id,
        user_id
    )
    .fetch_optional(pool)
    .await?;

    let Some(group) = group else {
        return Ok(None);
    };

    let members = fetch_members(pool, group_id).await?;

    Ok(Some(GroupWithMembers {
        id: group.id,
        name: group.name,
        description: group.description,
        created_by: group.created_by,
        members,
        created_at: group.created_at,
        updated_at: group.updated_at,
    }))
}

pub async fn list_groups_for_user(pool: &PgPool, user_id: &str) -> Result<Vec<Group>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT g.id, g.name, g.description, g.created_by, g.created_at, g.updated_at
        FROM groups g
        INNER JOIN group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = $1
        ORDER BY g.name
        "#,
        user_id
    )
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| Group {
                id: r.id,
                name: r.name,
                description: r.description,
                created_by: r.created_by,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect()
    })
}

pub async fn update_group(
    pool: &PgPool,
    group_id: GroupId,
    user_id: &str,
    name: Option<&str>,
    description: Option<Option<&str>>,
) -> Result<Option<Group>, sqlx::Error> {
    // Only owners and admins may update; verified by checking role in the query
    let r = sqlx::query!(
        r#"
        UPDATE groups
        SET
            name = COALESCE($1, name),
            description = CASE WHEN $2 THEN $3 ELSE description END,
            updated_at = NOW()
        WHERE id = $4
          AND id IN (
              SELECT group_id FROM group_members
              WHERE user_id = $5 AND role IN ('owner', 'admin')
          )
        RETURNING id, name, description, created_by, created_at, updated_at
        "#,
        name,
        description.is_some(),
        description.flatten(),
        group_id,
        user_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(r.map(|r| Group {
        id: r.id,
        name: r.name,
        description: r.description,
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }))
}

pub async fn delete_group(
    pool: &PgPool,
    group_id: GroupId,
    user_id: &str,
    is_server_admin: bool,
) -> Result<bool, sqlx::Error> {
    if is_server_admin {
        return sqlx::query!("DELETE FROM groups WHERE id = $1 RETURNING id", group_id)
            .fetch_optional(pool)
            .await
            .map(|r| r.is_some());
    }

    sqlx::query!(
        r#"
        DELETE FROM groups
        WHERE id = $1
          AND id IN (
              SELECT group_id FROM group_members
              WHERE user_id = $2 AND role = 'owner'
          )
        RETURNING id
        "#,
        group_id,
        user_id
    )
    .fetch_optional(pool)
    .await
    .map(|r| r.is_some())
}

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
) -> Result<GroupMember, sqlx::Error> {
    let username = sqlx::query!("SELECT username FROM users WHERE id = $1", user_id)
        .fetch_one(pool)
        .await?
        .username;

    let r = sqlx::query!(
        r#"
        INSERT INTO group_members (group_id, user_id, role, added_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role
        RETURNING group_id, user_id, role AS "role: GroupMemberRole", added_by, created_at
        "#,
        group_id,
        user_id,
        role as GroupMemberRole,
        added_by
    )
    .fetch_one(pool)
    .await?;

    Ok(GroupMember {
        group_id: r.group_id,
        user_id: r.user_id,
        username,
        role: r.role,
        added_by: r.added_by,
        created_at: r.created_at,
    })
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

pub async fn set_member_role(
    pool: &PgPool,
    group_id: GroupId,
    user_id: &str,
    role: GroupMemberRole,
) -> Result<Option<GroupMember>, sqlx::Error> {
    let username = sqlx::query!("SELECT username FROM users WHERE id = $1", user_id)
        .fetch_optional(pool)
        .await?
        .map(|r| r.username);

    let Some(username) = username else {
        return Ok(None);
    };

    let r = sqlx::query!(
        r#"
        UPDATE group_members SET role = $1
        WHERE group_id = $2 AND user_id = $3
        RETURNING group_id, user_id, role AS "role: GroupMemberRole", added_by, created_at
        "#,
        role as GroupMemberRole,
        group_id,
        user_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(r.map(|r| GroupMember {
        group_id: r.group_id,
        user_id: r.user_id,
        username,
        role: r.role,
        added_by: r.added_by,
        created_at: r.created_at,
    }))
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
