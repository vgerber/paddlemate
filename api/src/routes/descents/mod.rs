mod create;
mod errors;
mod patch;
mod read;
mod trip_link;
mod validate;

use aide::axum::{ApiRouter, routing::get_with};

use crate::state::AppState;

use self::{
    create::{create_descent, create_descent_docs},
    patch::{delete_descent, delete_descent_docs, patch_descent, patch_descent_docs},
    read::{get_descent, get_descent_docs, list_descents, list_descents_docs},
};

pub fn descents_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_descents, list_descents_docs)
                .post_with(create_descent, create_descent_docs),
        )
        .api_route(
            "/{descent_id}",
            get_with(get_descent, get_descent_docs)
                .patch_with(patch_descent, patch_descent_docs)
                .delete_with(delete_descent, delete_descent_docs),
        )
        .with_state(state)
}
