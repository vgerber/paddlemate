use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::{
    doc_fn,
    layers::auth::AuthToken,
    models::{
        path_params::ProposalPath,
        proposal::{ListProposalsFilters, Proposal, ProposalStatus, ReviewRequest, VoteRequest},
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
}

pub async fn list_proposals(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Query(params): Query<ListProposalsQuery>,
) -> impl IntoApiResponse {
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
            };
            // Non-admin: scope to own proposals only unless admin overrides
            if !token.is_server_admin() {
                f.submitted_by = Some(uid.clone());
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
            };
            // Submitted_by filter from query params is ignored for unauthenticated requests
            f.submitted_by = None;
            (None, f)
        }
    };

    match proposals::list_proposals(&app.pg_pool, filters, viewer_id.as_deref()).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing proposals: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_proposals_docs, op =>
    op.description(
        "List proposals. \
         Unauthenticated: pending only. \
         Authenticated non-admin: own proposals (all statuses). \
         Admin: all proposals. \
         Supports filtering by status, entity_type, operation, waterway_id, section_id, feature_id, submitted_by."
    )
    .response::<200, Json<Vec<Proposal>>>()
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
                return StatusCode::FORBIDDEN.into_response();
            }
            Json(p).into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error fetching proposal {}: {}", path.proposal_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
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
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .response_with::<404, (), _>(|res| res.description("Proposal not found"))
        .tag("Proposals")
);

pub async fn review_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<ProposalPath>,
    Json(body): Json<ReviewRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    if !token.is_server_admin() {
        return StatusCode::FORBIDDEN.into_response();
    }

    if matches!(body.status, ProposalStatus::Pending) {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            "Status must be 'approved' or 'rejected'",
        )
            .into_response();
    }

    match proposals::review_proposal(
        &app.pg_pool,
        path.proposal_id,
        token.user_id(),
        &body.status,
        body.review_note.as_deref(),
    )
    .await
    {
        Ok(Some(p)) => Json(p).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        // Unique violation while applying the change (e.g. duplicate waterway name).
        Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23505") => (
            StatusCode::CONFLICT,
            "Approving would create a duplicate (name already exists) — reject the proposal instead",
        )
            .into_response(),
        // Check violation (e.g. water range thresholds out of order).
        Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23514") => (
            StatusCode::CONFLICT,
            "The proposed data violates a data constraint (e.g. water range thresholds) — reject the proposal instead",
        )
            .into_response(),
        // Foreign key violation (e.g. a referenced gauge series was deleted).
        Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23503") => (
            StatusCode::CONFLICT,
            "The proposal references data that no longer exists (e.g. a deleted gauge) — reject the proposal instead",
        )
            .into_response(),
        Err(err) => {
            tracing::error!("Error reviewing proposal {}: {}", path.proposal_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(review_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Approve or reject a proposal (admin only)")
        .response::<200, Json<Proposal>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .response_with::<404, (), _>(|res| res.description("Proposal not found or already reviewed"))
        .response_with::<409, (), _>(|res| res.description("Approving would create a duplicate"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

pub async fn vote_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<ProposalPath>,
    Json(body): Json<VoteRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    if body.vote != 1 && body.vote != -1 {
        return (StatusCode::UNPROCESSABLE_ENTITY, "vote must be 1 or -1").into_response();
    }

    match proposals::vote_proposal(&app.pg_pool, path.proposal_id, token.user_id(), body.vote).await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!("Error voting on proposal {}: {}", path.proposal_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(vote_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Cast or change a vote on a proposal (1 = upvote, -1 = downvote)")
        .response_with::<204, (), _>(|res| res.description("Vote recorded"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<422, (), _>(|res| res.description("Invalid vote value"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

pub async fn unvote_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<ProposalPath>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    match proposals::unvote_proposal(&app.pg_pool, path.proposal_id, token.user_id()).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!(
                "Error removing vote on proposal {}: {}",
                path.proposal_id,
                err
            );
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(unvote_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Remove the calling user's vote from a proposal")
        .response_with::<204, (), _>(|res| res.description("Vote removed"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

pub async fn delete_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<ProposalPath>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    let proposal =
        match proposals::get_proposal(&app.pg_pool, path.proposal_id, Some(token.user_id())).await {
            Ok(Some(p)) => p,
            Ok(None) => return StatusCode::NOT_FOUND.into_response(),
            Err(err) => {
                tracing::error!(
                    "Error fetching proposal {} for delete: {}",
                    path.proposal_id,
                    err
                );
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        };

    // Only the submitter or an admin may withdraw a proposal.
    let is_owner = proposal.submitted_by == token.user_id();
    if !is_owner && !token.is_server_admin() {
        return StatusCode::FORBIDDEN.into_response();
    }

    // Only pending proposals can be withdrawn; reviewed ones are immutable.
    if proposal.status != ProposalStatus::Pending {
        return (
            StatusCode::CONFLICT,
            "Only pending proposals can be deleted",
        )
            .into_response();
    }

    match proposals::delete_proposal(&app.pg_pool, path.proposal_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error deleting proposal {}: {}", path.proposal_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(delete_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Delete (withdraw) a pending proposal. Allowed for the submitter or an admin.")
        .response_with::<204, (), _>(|res| res.description("Proposal deleted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .response_with::<404, (), _>(|res| res.description("Proposal not found"))
        .response_with::<409, (), _>(|res| res.description("Proposal already reviewed"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

// Aide requires a serializable type to generate the request body schema.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, JsonSchema)]
#[allow(dead_code)]
struct ReviewRequestDoc {
    status: ProposalStatus,
    review_note: Option<String>,
}

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
