mod comments;
mod features;
mod sections;
mod water_ranges;
mod water_status;
mod waterways;

use aide::axum::{
    ApiRouter,
    routing::{get_with, post_with, put_with},
};

use crate::state::AppState;

/// All waterway routes combined into a single router.
/// Authentication is handled per-handler based on the operation.
pub fn waterways_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        // Waterway CRUD
        .api_route(
            "/",
            get_with(waterways::list_waterways, waterways::list_waterways_docs)
                .post_with(waterways::create_waterway, waterways::create_waterway_docs),
        )
        .api_route(
            "/{waterway_id}",
            get_with(waterways::get_waterway, waterways::get_waterway_docs)
                .put_with(waterways::update_waterway, waterways::update_waterway_docs)
                .delete_with(waterways::delete_waterway, waterways::delete_waterway_docs),
        )
        // Section CRUD
        .api_route(
            "/{waterway_id}/sections",
            post_with(sections::create_section, sections::create_section_docs),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}",
            get_with(sections::get_section, sections::get_section_docs)
                .put_with(sections::update_section, sections::update_section_docs)
                .delete_with(sections::delete_section, sections::delete_section_docs),
        )
        // Feature CRUD
        .api_route(
            "/{waterway_id}/sections/{section_id}/features",
            post_with(features::create_feature, features::create_feature_docs),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}/features/{feature_id}",
            put_with(features::update_feature, features::update_feature_docs)
                .delete_with(features::delete_feature, features::delete_feature_docs),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}/features/{feature_id}/names/{lang_code}",
            post_with(
                features::upsert_feature_name,
                features::upsert_feature_name_docs,
            )
            .delete_with(
                features::delete_feature_name,
                features::delete_feature_name_docs,
            ),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}/features/{feature_id}/descriptions/{lang_code}",
            post_with(
                features::upsert_feature_description,
                features::upsert_feature_description_docs,
            )
            .delete_with(
                features::delete_feature_description,
                features::delete_feature_description_docs,
            ),
        )
        // Section comments
        .api_route(
            "/{waterway_id}/sections/{section_id}/comments",
            get_with(
                comments::list_section_comments,
                comments::list_section_comments_docs,
            )
            .post_with(
                comments::create_section_comment,
                comments::create_section_comment_docs,
            ),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}/comments/{comment_id}",
            put_with(
                comments::update_section_comment,
                comments::update_section_comment_docs,
            )
            .delete_with(
                comments::delete_section_comment,
                comments::delete_section_comment_docs,
            ),
        )
        // Feature comments
        .api_route(
            "/{waterway_id}/sections/{section_id}/features/{feature_id}/comments",
            get_with(
                comments::list_feature_comments,
                comments::list_feature_comments_docs,
            )
            .post_with(
                comments::create_feature_comment,
                comments::create_feature_comment_docs,
            ),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}/features/{feature_id}/comments/{comment_id}",
            put_with(
                comments::update_feature_comment,
                comments::update_feature_comment_docs,
            )
            .delete_with(
                comments::delete_feature_comment,
                comments::delete_feature_comment_docs,
            ),
        )
        // Feature water ranges
        .api_route(
            "/{waterway_id}/sections/{section_id}/features/{feature_id}/water-ranges",
            get_with(
                water_ranges::list_water_ranges,
                water_ranges::list_water_ranges_docs,
            )
            .post_with(
                water_ranges::create_water_range,
                water_ranges::create_water_range_docs,
            ),
        )
        .api_route(
            "/{waterway_id}/sections/{section_id}/features/{feature_id}/water-ranges/{range_id}",
            put_with(
                water_ranges::update_water_range,
                water_ranges::update_water_range_docs,
            )
            .delete_with(
                water_ranges::delete_water_range,
                water_ranges::delete_water_range_docs,
            ),
        )
        // Section water status
        .api_route(
            "/{waterway_id}/sections/{section_id}/water-status",
            get_with(
                water_status::get_section_water_status,
                water_status::get_section_water_status_docs,
            ),
        )
        .with_state(state)
}
