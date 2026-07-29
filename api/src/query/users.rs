use axum::http::StatusCode;

use crate::{
    models::user::User,
    state::{AdminToken, AppState},
};

pub async fn get_admin_token(app: &AppState) -> Result<String, StatusCode> {
    {
        let cache = app.admin_token_cache.read().await;
        if let Some(cached) = cache.as_ref() {
            if cached.expires_at > std::time::Instant::now() {
                return Ok(cached.token.clone());
            }
        }
    }

    let token_url = format!(
        "{}/realms/{}/protocol/openid-connect/token",
        app.keycloak_config.url, app.keycloak_config.realm
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&token_url)
        .form(&[
            ("grant_type", "client_credentials"),
            ("client_id", &app.keycloak_config.client_id),
            ("client_secret", &app.keycloak_config.client_secret),
        ])
        .send()
        .await
        .map_err(|err| {
            tracing::error!("Error getting admin token: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let data: serde_json::Value = response.json().await.map_err(|err| {
        tracing::error!("Error parsing admin token response: {}", err);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let token = data
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            tracing::error!("No access_token in Keycloak response: {}", data);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .to_string();

    let expires_in = data
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(300);

    // Cache with a 60s safety margin to avoid using an almost-expired token
    let expires_at =
        std::time::Instant::now() + std::time::Duration::from_secs(expires_in.saturating_sub(60));

    {
        let mut cache = app.admin_token_cache.write().await;
        *cache = Some(AdminToken {
            token: token.clone(),
            expires_at,
        });
    }

    Ok(token)
}

pub async fn fetch_username_from_keycloak(
    app: &AppState,
    user_id: &str,
    admin_token: &str,
) -> Result<String, StatusCode> {
    let user_url = format!(
        "{}/admin/realms/{}/users/{}",
        app.keycloak_config.url, app.keycloak_config.realm, user_id
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&user_url)
        .header("Authorization", format!("Bearer {admin_token}"))
        .send()
        .await
        .map_err(|err| {
            tracing::error!("Error calling Keycloak users API: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if !response.status().is_success() {
        tracing::error!("Keycloak users API error: {}", response.status());
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    let user_data: serde_json::Value = response.json().await.map_err(|err| {
        tracing::error!("Error parsing Keycloak user data: {}", err);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let username = user_data
        .get("username")
        .and_then(|v| v.as_str())
        .unwrap_or(user_id)
        .to_string();

    Ok(username)
}

pub async fn get_username(app: &AppState, user_id: &str) -> Result<String, StatusCode> {
    if let Some(cached) = app.username_cache.get(user_id).await {
        return Ok(cached);
    }

    let admin_token = get_admin_token(app).await?;
    let username = fetch_username_from_keycloak(app, user_id, &admin_token).await?;

    app.username_cache
        .insert(user_id.to_string(), username.clone())
        .await;

    Ok(username)
}

pub async fn user_exists_in_keycloak(app: &AppState, user_id: &str) -> Result<bool, StatusCode> {
    if app.username_cache.get(user_id).await.is_some() {
        return Ok(true);
    }

    let admin_token = get_admin_token(app).await?;
    let user_url = format!(
        "{}/admin/realms/{}/users/{}",
        app.keycloak_config.url, app.keycloak_config.realm, user_id
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&user_url)
        .header("Authorization", format!("Bearer {admin_token}"))
        .send()
        .await
        .map_err(|err| {
            tracing::error!("Error calling Keycloak users API: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(response.status().is_success())
}

pub async fn upsert_user(
    pool: &sqlx::PgPool,
    user_id: &str,
    username: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO users (id, username)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, updated_at = NOW()
        WHERE users.username IS DISTINCT FROM EXCLUDED.username
        "#,
        user_id,
        username
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn list_users(pool: &sqlx::PgPool) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query!("SELECT id, username, created_at, updated_at FROM users ORDER BY username")
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
