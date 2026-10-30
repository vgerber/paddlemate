mod review;
mod vote;

use review::{delete_proposal, delete_proposal_docs, review_proposal, review_proposal_docs};
use vote::{unvote_proposal, unvote_proposal_docs, vote_proposal, vote_proposal_docs};

use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        path_params::ProposalPath,
        proposal::{ListProposalsFilters, Proposal, ProposalStatus},
        waterway::{PaginatedResponse, page_bounds, total_pages},
    },
    query::proposals,
    state::AppState,
};

#[derive(Deserialize, JsonSchema)]
pub struct ListProposalsQuery {
    pub status: Option<String>,
    pub entity_type: Option<String>,
    pub operation: Option<String>,
    pub waterway_id: Option<i64>,
    pub section_id: Option<i64>,
    pub feature_id: Option<i64>,
    pub submitted_by: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

/// Rows per page unless the caller asks for fewer; also the ceiling.
const MAX_PER_PAGE: i64 = 100;

pub async fn list_proposals(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Query(params): Query<ListProposalsQuery>,
) -> impl IntoApiResponse {
    let (page, per_page) = page_bounds(params.page, params.per_page, MAX_PER_PAGE);
    let (viewer_id, filters) = match &auth {
        Some(Extension(token)) => {
            let uid = token.user_id().to_string();
            let mut f = ListProposalsFilters {
                status: params.status,
                entity_type: params.entity_type,
                operation: params.operation,
                waterway_id: params.waterway_id,
                section_id: params.section_id,
                feature_id: params.feature_id,
                submitted_by: params.submitted_by,
                visible_to: None,
                page,
                per_page,
            };
            // Non-admin: every pending proposal plus their own reviewed ones
            if !token.is_server_admin() {
                f.visible_to = Some(uid.clone());
            }
            (Some(uid), f)
        }
        None => {
            // Unauthenticated: only pending proposals are visible
            let mut f = ListProposalsFilters {
                status: Some("pending".to_string()),
                entity_type: params.entity_type,
                operation: params.operation,
                waterway_id: params.waterway_id,
                section_id: params.section_id,
                feature_id: params.feature_id,
                submitted_by: params.submitted_by,
                visible_to: None,
                page,
                per_page,
            };
            // Submitted_by filter from query params is ignored for unauthenticated requests
            f.submitted_by = None;
            (None, f)
        }
    };

    match proposals::list_proposals(&app.pg_pool, filters, viewer_id.as_deref()).await {
        Ok((items, total)) => Json(PaginatedResponse {
            items,
            total,
            page,
            per_page,
            total_pages: total_pages(total, per_page),
        })
        .into_response(),
        Err(err) => ApiError::from_db("Error listing proposals", &err).into_response(),
    }
}

doc_fn!(list_proposals_docs, op =>
    op.description(
        "List proposals. \
         Unauthenticated: pending only. \
         Authenticated non-admin: all pending proposals plus own proposals of any status. \
         Admin: all proposals. \
         Supports filtering by status, entity_type, operation, waterway_id, section_id, feature_id, submitted_by. Newest first, paged with page and per_page (default and maximum 100)."
    )
    .response::<200, Json<PaginatedResponse<Proposal>>>()
    .tag("Proposals")
);

pub async fn get_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<ProposalPath>,
) -> impl IntoApiResponse {
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());
    let is_admin = auth
        .as_ref()
        .map(|Extension(t)| t.is_server_admin())
        .unwrap_or(false);

    match proposals::get_proposal(&app.pg_pool, path.proposal_id, viewer_id.as_deref()).await {
        Ok(Some(p)) => {
            // Visibility: pending visible to all; non-pending only to admin or submitter
            let visible = is_admin
                || p.status == ProposalStatus::Pending
                || viewer_id.as_deref() == Some(p.submitted_by.as_str());
            if !visible {
                return ApiError::forbidden("Not permitted").into_response();
            }
            Json(p).into_response()
        }
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => ApiError::from_db(
            &format!("Error fetching proposal {}", path.proposal_id),
            err,
        )
        .into_response(),
    }
}

doc_fn!(get_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description(
            "Get a proposal by ID. \
             Pending proposals are visible to everyone. \
             Non-pending proposals require admin or ownership."
        )
        .response::<200, Json<Proposal>>()
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Proposal not found"))
        .tag("Proposals")
);

use aide::axum::{
    ApiRouter,
    routing::{get_with, post_with},
};

pub fn proposals_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route("/", get_with(list_proposals, list_proposals_docs))
        .api_route(
            "/{proposal_id}",
            get_with(get_proposal, get_proposal_docs)
                .patch_with(review_proposal, review_proposal_docs)
                .delete_with(delete_proposal, delete_proposal_docs),
        )
        .api_route(
            "/{proposal_id}/vote",
            post_with(vote_proposal, vote_proposal_docs)
                .delete_with(unvote_proposal, unvote_proposal_docs),
        )
        .with_state(state)
}
