mod comments;
mod feature_proposals;
mod features;
mod proposals;
mod sections;
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
        // Waterway & section proposals
        .api_route(
            "/proposals",
            get_with(
                proposals::list_waterway_proposals,
                proposals::list_waterway_proposals_docs,
            ),
        )
        .api_route(
            "/proposals/{proposal_id}",
            get_with(
                proposals::get_waterway_proposal,
                proposals::get_waterway_proposal_docs,
            )
            .patch_with(
                proposals::review_waterway_proposal,
                proposals::review_waterway_proposal_docs,
            ),
        )
        // Feature proposals scoped by waterway
        .api_route(
            "/{waterway_id}/features/proposals",
            get_with(
                feature_proposals::list_feature_proposals,
                feature_proposals::list_feature_proposals_docs,
            ),
        )
        .api_route(
            "/{waterway_id}/features/proposals/{proposal_id}",
            get_with(
                feature_proposals::get_feature_proposal,
                feature_proposals::get_feature_proposal_docs,
            )
            .patch_with(
                feature_proposals::review_feature_proposal,
                feature_proposals::review_feature_proposal_docs,
            ),
        )
        .with_state(state)
}
