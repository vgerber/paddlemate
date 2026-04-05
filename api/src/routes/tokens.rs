use aide::axum::{
    ApiRouter, IntoApiResponse,
    routing::{delete_with, get_with},
};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{DateTime, Duration, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    doc_fn,
    layers::auth::AuthToken,
    models::api_token::{ApiToken, ApiTokenId},
    query::tokens::generate_token_pair,
    state::AppState,
};

pub fn tokens_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_tokens, list_tokens_docs).post_with(create_token, create_token_docs),
        )
        .api_route("/{token_id}", delete_with(revoke_token, revoke_token_docs))
        .with_state(state)
}

#[derive(Deserialize, JsonSchema)]
struct CreateTokenBody {
    name: String,
    expires_in_days: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
struct ApiTokenCreated {
    pub id: ApiTokenId,
    pub name: String,
    /// The plain token - only shown once at creation time!
    pub token: String,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
}

async fn create_token(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Json(body): Json<CreateTokenBody>,
) -> impl IntoApiResponse {
    let user_id = &token.user_id();
    let (plain_token, token_hash) = generate_token_pair();

    let expires_at: Option<DateTime<Utc>> = body
        .expires_in_days
        .map(|days| Utc::now() + Duration::days(days));

    let result = sqlx::query!(
        r#"
        INSERT INTO api_tokens (user_id, name, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at
        "#,
        user_id,
        body.name,
        token_hash,
        expires_at
    )
    .fetch_one(&app.pg_pool)
    .await;

    match result {
        Ok(record) => Json(ApiTokenCreated {
            id: record.id,
            name: body.name,
            token: plain_token,
            created_at: record.created_at,
            expires_at,
        })
        .into_response(),
        Err(err) => {
            if err.to_string().contains("duplicate key") {
                return (
                    StatusCode::CONFLICT,
                    "A token with this name already exists",
                )
                    .into_response();
            }
            tracing::error!("Error creating API token: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(create_token_docs, op =>
    op.description("Create a new API token. The token is only shown once at creation time - store it securely!")
        .response_with::<200, Json<ApiTokenCreated>, _>(|res| {
            res.example(ApiTokenCreated {
                id: 1,
                name: "CI/CD Pipeline".to_string(),
                token: "pm_a1b2c3d4e5f6...".to_string(),
                created_at: Utc::now(),
                expires_at: Some(Utc::now() + Duration::days(90)),
            })
        })
        .response_with::<409, (), _>(|res| res.description("Token with this name already exists"))
        .response_with::<500, (), _>(|res| res.description("Internal server error"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("API Tokens")
);

async fn list_tokens(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
) -> impl IntoApiResponse {
    let user_id = &token.user_id();

    let tokens = sqlx::query!(
        r#"
        SELECT id, user_id, name, created_at, expires_at, last_used_at, revoked_at
        FROM api_tokens
        WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC
        "#,
        user_id
    )
    .fetch_all(&app.pg_pool)
    .await;

    match tokens {
        Ok(records) => {
            let now = Utc::now();
            let tokens: Vec<ApiToken> = records
                .into_iter()
                .map(|r| {
                    let is_expired = r.expires_at.map(|e| e < now).unwrap_or(false);
                    ApiToken {
                        id: r.id,
                        user_id: r.user_id,
                        name: r.name,
                        created_at: r.created_at,
                        expires_at: r.expires_at,
                        last_used_at: r.last_used_at,
                        is_active: r.revoked_at.is_none() && !is_expired,
                    }
                })
                .collect();
            Json(tokens).into_response()
        }
        Err(err) => {
            tracing::error!("Error listing API tokens: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_tokens_docs, op =>
    op.description("List all API tokens for the authenticated user. Does not include revoked tokens.")
        .response_with::<200, Json<Vec<ApiToken>>, _>(|res| {
            res.example(vec![ApiToken {
                id: 1,
                user_id: "user-uuid".to_string(),
                name: "CI/CD Pipeline".to_string(),
                created_at: Utc::now(),
                expires_at: Some(Utc::now() + Duration::days(90)),
                last_used_at: Some(Utc::now()),
                is_active: true,
            }])
        })
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("API Tokens")
);

#[derive(Deserialize, JsonSchema)]
struct RevokeTokenPath {
    token_id: ApiTokenId,
}

async fn revoke_token(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<RevokeTokenPath>,
) -> impl IntoApiResponse {
    let user_id = &token.user_id();

    let result = sqlx::query!(
        r#"
        UPDATE api_tokens
        SET revoked_at = NOW()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        "#,
        path.token_id,
        user_id
    )
    .execute(&app.pg_pool)
    .await;

    match result {
        Ok(res) => {
            if res.rows_affected() == 0 {
                StatusCode::NOT_FOUND.into_response()
            } else {
                StatusCode::NO_CONTENT.into_response()
            }
        }
        Err(err) => {
            tracing::error!("Error revoking API token: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(revoke_token_docs, op =>
    op.description("Revoke an API token. The token will no longer be usable for authentication.")
        .response_with::<204, (), _>(|res| res.description("Token revoked successfully"))
        .response_with::<404, (), _>(|res| res.description("Token not found or already revoked"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("API Tokens")
);
