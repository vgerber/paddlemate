use std::sync::Arc;

use aide::{
    axum::{ApiRouter, IntoApiResponse},
    openapi::OpenApi,
};
use axum::{Extension, Json, http::header, response::IntoResponse};

use crate::state::AppState;

pub fn docs_routes(state: AppState) -> ApiRouter {
    let base_url = dotenvy::var("BASE_URL").unwrap_or_else(|_| "".to_string());
    let openapi_url = format!("{}/api/v1/docs/openapi.json", base_url);
    ApiRouter::new()
        .route(
            "/",
            axum::routing::get(move || serve_stoplight(openapi_url.clone())),
        )
        .route("/openapi.json", axum::routing::get(serve_openapi))
        .with_state(state)
}

async fn serve_stoplight(openapi_url: String) -> impl IntoResponse {
    let html = format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
  <title>Paddlemate API</title>
  <script src="https://unpkg.com/@stoplight/elements/web-components.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css" />
</head>
<body>
  <elements-api
    apiDescriptionUrl="{}"
    router="hash"
    layout="sidebar"
    hideSchemas
  />
</body>
</html>
"#,
        openapi_url
    );
    ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], html)
}

async fn serve_openapi(Extension(api): Extension<Arc<OpenApi>>) -> impl IntoApiResponse {
    Json(api)
}
