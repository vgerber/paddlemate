use std::env;

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_keycloak_auth::{
    KeycloakAuthStatus,
    decode::{Email, KeycloakToken, Profile, ProfileAndEmail},
};
use chrono::Utc;

use crate::{
    query::tokens::{API_TOKEN_PREFIX, hash_token},
    state::AppState,
};

/// Wrapper around KeycloakToken that can be populated from either
/// Keycloak JWT or API token authentication
#[derive(Clone, Debug)]
pub struct AuthToken(pub KeycloakToken<String, ProfileAndEmail>);

impl AuthToken {
    /// Get the user ID (subject) from the token
    pub fn user_id(&self) -> &str {
        &self.0.subject
    }
}

/// Additional authentication metadata
#[derive(Clone, Debug)]
pub struct AuthMethod {
    pub kind: AuthMethodKind,
}

#[derive(Clone, Debug)]
pub enum AuthMethodKind {
    Keycloak,
    ApiToken { token_id: i64 },
}

/// Middleware that handles both API token and Keycloak authentication.
/// - For API tokens (X-Api-Key header with pm_ prefix): validates and creates AuthToken
/// - For Keycloak tokens: wraps the KeycloakToken in AuthToken after Keycloak layer processes it
pub async fn api_token_auth(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    // In PassthroughMode::Pass, Keycloak sets KeycloakAuthStatus instead of KeycloakToken
    if let Some(auth_status) = request
        .extensions()
        .get::<KeycloakAuthStatus<String, ProfileAndEmail>>()
        .cloned()
    {
        match auth_status {
            KeycloakAuthStatus::Success(keycloak_token) => {
                request.extensions_mut().insert(AuthToken(keycloak_token));
                request.extensions_mut().insert(AuthMethod {
                    kind: AuthMethodKind::Keycloak,
                });
                return next.run(request).await;
            }
            KeycloakAuthStatus::Failure(err) => {
                tracing::trace!("Keycloak authentication failed: {}", err);
            }
        }
    }

    // Also check for direct KeycloakToken (in case Block mode is used)
    if let Some(keycloak_token) = request
        .extensions()
        .get::<KeycloakToken<String, ProfileAndEmail>>()
        .cloned()
    {
        request.extensions_mut().insert(AuthToken(keycloak_token));
        request.extensions_mut().insert(AuthMethod {
            kind: AuthMethodKind::Keycloak,
        });
        return next.run(request).await;
    }

    // Try to extract API token from X-Api-Key header
    let auth_header = request
        .headers()
        .get("X-Api-Key")
        .and_then(|v| v.to_str().ok());

    let token = match auth_header {
        Some(token) => token,
        _ => {
            return (StatusCode::UNAUTHORIZED, "Authentication required").into_response();
        }
    };

    // Check if this is an API token (starts with prefix)
    if !token.starts_with(API_TOKEN_PREFIX) {
        return (StatusCode::UNAUTHORIZED, "Invalid API token format").into_response();
    }

    // Hash the token and look it up
    let token_hash = hash_token(token);

    let result = sqlx::query!(
        r#"
        SELECT id, user_id, expires_at, revoked_at
        FROM api_tokens
        WHERE token_hash = $1
        "#,
        token_hash
    )
    .fetch_optional(&state.pg_pool)
    .await;

    match result {
        Ok(Some(record)) => {
            // Check if token is revoked
            if record.revoked_at.is_some() {
                return (StatusCode::UNAUTHORIZED, "API token has been revoked").into_response();
            }

            // Check if token is expired
            if let Some(expires_at) = record.expires_at {
                if expires_at < Utc::now() {
                    return (StatusCode::UNAUTHORIZED, "API token has expired").into_response();
                }
            }

            // Update last_used_at (fire and forget)
            let pool = state.pg_pool.clone();
            let token_id = record.id;
            tokio::spawn(async move {
                let _ = sqlx::query!(
                    "UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1",
                    token_id
                )
                .execute(&pool)
                .await;
            });

            // Create an AuthToken for API token authentication
            let now = time::OffsetDateTime::now_utc();
            let keycloak_token = KeycloakToken {
                expires_at: now + time::Duration::hours(24),
                issued_at: now,
                jwt_id: format!("api-token-{}", record.id),
                issuer: "api-token".to_string(),
                audience: vec![env::var("KEYCLOAK_CLIENT_ID").unwrap_or_default()],
                subject: record.user_id.clone(),
                authorized_party: "api-token".to_string(),
                roles: vec![],
                extra: ProfileAndEmail {
                    profile: Profile {
                        full_name: None,
                        given_name: None,
                        family_name: None,
                        preferred_username: format!("api-token-user-{}", record.id),
                    },
                    email: Email {
                        email: String::new(),
                        email_verified: true,
                    },
                },
            };

            request.extensions_mut().insert(AuthToken(keycloak_token));
            request.extensions_mut().insert(AuthMethod {
                kind: AuthMethodKind::ApiToken {
                    token_id: record.id,
                },
            });

            next.run(request).await
        }
        Ok(None) => (StatusCode::UNAUTHORIZED, "Invalid API token").into_response(),
        Err(err) => {
            tracing::error!("Error validating API token: {}", err);
            (StatusCode::INTERNAL_SERVER_ERROR, "Authentication error").into_response()
        }
    }
}

/// Like api_token_auth but never blocks unauthenticated requests.
/// Sets AuthToken in extensions when credentials are present and valid, then passes through.
/// Use this for routes that are public but can optionally act on behalf of an authenticated user.
pub async fn api_token_auth_optional(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    // Keycloak bearer token (PassthroughMode::Pass sets KeycloakAuthStatus)
    if let Some(auth_status) = request
        .extensions()
        .get::<KeycloakAuthStatus<String, ProfileAndEmail>>()
        .cloned()
    {
        if let KeycloakAuthStatus::Success(keycloak_token) = auth_status {
            request.extensions_mut().insert(AuthToken(keycloak_token));
            request.extensions_mut().insert(AuthMethod {
                kind: AuthMethodKind::Keycloak,
            });
            return next.run(request).await;
        }
    }

    // Direct KeycloakToken (Block mode)
    if let Some(keycloak_token) = request
        .extensions()
        .get::<KeycloakToken<String, ProfileAndEmail>>()
        .cloned()
    {
        request.extensions_mut().insert(AuthToken(keycloak_token));
        request.extensions_mut().insert(AuthMethod {
            kind: AuthMethodKind::Keycloak,
        });
        return next.run(request).await;
    }

    // Try X-Api-Key header; skip silently if missing or invalid format
    let token = match request
        .headers()
        .get("X-Api-Key")
        .and_then(|v| v.to_str().ok())
        .filter(|t| t.starts_with(API_TOKEN_PREFIX))
    {
        Some(t) => t.to_owned(),
        None => return next.run(request).await,
    };

    let token_hash = hash_token(&token);

    let result = sqlx::query!(
        r#"
        SELECT id, user_id, expires_at, revoked_at
        FROM api_tokens
        WHERE token_hash = $1
        "#,
        token_hash
    )
    .fetch_optional(&state.pg_pool)
    .await;

    match result {
        Ok(Some(record))
            if record.revoked_at.is_none()
                && record.expires_at.map(|e| e >= Utc::now()).unwrap_or(true) =>
        {
            let pool = state.pg_pool.clone();
            let token_id = record.id;
            tokio::spawn(async move {
                let _ = sqlx::query!(
                    "UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1",
                    token_id
                )
                .execute(&pool)
                .await;
            });

            let now = time::OffsetDateTime::now_utc();
            let keycloak_token = KeycloakToken {
                expires_at: now + time::Duration::hours(24),
                issued_at: now,
                jwt_id: format!("api-token-{}", record.id),
                issuer: "api-token".to_string(),
                audience: vec![env::var("KEYCLOAK_CLIENT_ID").unwrap_or_default()],
                subject: record.user_id.clone(),
                authorized_party: "api-token".to_string(),
                roles: vec![],
                extra: ProfileAndEmail {
                    profile: Profile {
                        full_name: None,
                        given_name: None,
                        family_name: None,
                        preferred_username: format!("api-token-user-{}", record.id),
                    },
                    email: Email {
                        email: String::new(),
                        email_verified: true,
                    },
                },
            };

            request.extensions_mut().insert(AuthToken(keycloak_token));
            request.extensions_mut().insert(AuthMethod {
                kind: AuthMethodKind::ApiToken {
                    token_id: record.id,
                },
            });

            next.run(request).await
        }
        // Invalid, expired, or revoked token - pass through without setting AuthToken
        _ => next.run(request).await,
    }
}
