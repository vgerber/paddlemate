use aide::axum::IntoApiResponse;
use axum::{Extension, Json, extract::State, http::StatusCode, response::IntoResponse};

use crate::{doc_fn, layers::auth::AuthToken, models::{proposal::Proposal, user::User}, query::{proposals, users}, state::AppState};

pub async fn list_users(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    if !token.is_server_admin() {
        return StatusCode::FORBIDDEN.into_response();
    }

    match users::list_users(&app.pg_pool).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing users: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_users_docs, op =>
    op.description("List all registered users (server admin only)")
        .response::<200, Json<Vec<User>>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Users")
);

pub async fn list_my_proposals(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    match proposals::list_my_proposals(&app.pg_pool, token.user_id()).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing proposals for user {}: {}", token.user_id(), err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_my_proposals_docs, op =>
    op.description("List proposals submitted by the authenticated user")
        .response::<200, Json<Vec<Proposal>>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);
