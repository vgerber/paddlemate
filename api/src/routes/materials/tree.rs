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
    models::material::{MaterialFilters, MaterialTree},
    query::materials::tree,
    state::AppState,
};

pub async fn get_tree(
    State(app): State<AppState>,
    Query(filters): Query<MaterialFilters>,
) -> impl IntoApiResponse {
    if let Err(err) = check_filters(&filters) {
        return err.into_response();
    }
    match tree::tree(&app.pg_pool, &filters).await {
        Ok(tree) => Json(tree).into_response(),
        Err(err) => ApiError::from_db("Error building the material tree", err).into_response(),
    }
}

doc_fn!(get_tree_docs, op =>
    op.description("The wiki as a browse tree: category, use (kayaks only), discipline, brand, each with model and entry counts. Takes the filters of the model list except category, use, discipline and brand (the levels the tree offers); paging and sort are ignored.")
        .response::<200, Json<MaterialTree>>()
        .tag("Materials")
);
