use aide::axum::IntoApiResponse;
use axum::{Extension, Json, extract::State, response::IntoResponse};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::user::User,
    query::users,
    state::AppState,
};

pub async fn list_users(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    if !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }

    match users::list_users(&app.pg_pool).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing users: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_users_docs, op =>
    op.description("List all registered users (server admin only)")
        .response::<200, Json<Vec<User>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Users")
);
