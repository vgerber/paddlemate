mod features;
mod rivers;
mod sections;

use aide::axum::{
    ApiRouter,
    routing::{get_with, post_with, put_with},
};

use crate::state::AppState;

/// Public read-only routes (no authentication required)
pub fn rivers_read_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/", get_with(rivers::list_rivers, rivers::list_rivers_docs))
        .api_route(
            "/{waterway_id}",
            get_with(rivers::get_river, rivers::get_river_docs),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}",
            get_with(sections::get_section, sections::get_section_docs),
        )
        .with_state(state)
}

/// Protected write routes (authentication required)
pub fn rivers_write_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            post_with(rivers::create_river, rivers::create_river_docs),
        )
        .api_route(
            "/{waterway_id}",
            put_with(rivers::update_river, rivers::update_river_docs)
                .delete_with(rivers::delete_river, rivers::delete_river_docs),
        )
        .api_route(
            "/{waterway_id}/sections",
            post_with(sections::create_section, sections::create_section_docs),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}",
            put_with(sections::update_section, sections::update_section_docs)
                .delete_with(sections::delete_section, sections::delete_section_docs),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}/features",
            post_with(features::create_feature, features::create_feature_docs),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}/features/{feature_id}",
            put_with(features::update_feature, features::update_feature_docs)
                .delete_with(features::delete_feature, features::delete_feature_docs),
        )
        .with_state(state)
}
