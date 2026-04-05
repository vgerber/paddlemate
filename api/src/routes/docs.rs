use std::sync::Arc;

use aide::{
    axum::{ApiRouter, IntoApiResponse, routing::get_with},
    openapi::OpenApi,
};
use axum::{Extension, Json};

use crate::state::AppState;

pub fn docs_routes(state: AppState) -> ApiRouter {
    let base_url = dotenvy::var("BASE_URL").unwrap_or_else(|_| "".to_string());
    ApiRouter::new()
        .route(
            "/",
            get_with(
                aide::swagger::Swagger::new(&format!("{}/docs/openapi.json", base_url))
                    .with_title("Paddlemate API")
                    .axum_handler(),
                |op| op.description("This documentation page."),
            ),
        )
        .route("/openapi.json", axum::routing::get(serve_docs))
        .with_state(state)
}

async fn serve_docs(Extension(api): Extension<Arc<OpenApi>>) -> impl IntoApiResponse {
    Json(api)
}
