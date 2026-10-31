use aide::axum::IntoApiResponse;
use axum::{
    Json,
    extract::{Query, State},
    response::IntoResponse,
};

use super::check_filters;
use crate::{
    doc_fn,
    error::ApiError,
    models::{
        material::{MaterialFilters, MaterialModel},
        page::{PaginatedResponse, page_bounds, page_of},
    },
    query::materials::models,
    state::AppState,
};

pub async fn list_models(
    State(app): State<AppState>,
    Query(filters): Query<MaterialFilters>,
) -> impl IntoApiResponse {
    if let Err(err) = check_filters(&filters) {
        return err.into_response();
    }
    let (page, per_page) = page_bounds(filters.page, filters.per_page, 24);
    match models::list(&app.pg_pool, &filters, page, per_page).await {
        Ok((items, total)) => Json(page_of(items, total, page, per_page)).into_response(),
        Err(err) => ApiError::from_db("Error listing material models", err).into_response(),
    }
}

doc_fn!(list_models_docs, op =>
    op.description("The wiki as models: entries sharing category, brand, model and variant, each with its sizes. Takes the filters of the entry list (`ids` is ignored); paging counts models.")
        .response::<200, Json<PaginatedResponse<MaterialModel>>>()
        .tag("Materials")
);
