use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        path_params::ProposalPath,
        proposal::{ProposalStatus, VoteRequest},
    },
    query::proposals,
    state::AppState,
};

pub(super) async fn vote_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<ProposalPath>,
    Json(body): Json<VoteRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    if body.vote != 1 && body.vote != -1 {
        return ApiError::validation("vote must be 1 or -1").into_response();
    }

    match proposals::get_proposal(&app.pg_pool, path.proposal_id, None).await {
        Ok(Some(p)) if p.status != ProposalStatus::Pending => {
            return ApiError::conflict("Only pending proposals can be voted on").into_response();
        }
        Ok(Some(p)) if p.submitted_by == token.user_id() => {
            return ApiError::forbidden("You cannot vote on your own proposal").into_response();
        }
        Ok(Some(_)) => {}
        Ok(None) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            return ApiError::from_db(
                &format!("Error fetching proposal {} for vote", path.proposal_id),
                &err,
            )
            .into_response();
        }
    }

    match proposals::vote_proposal(&app.pg_pool, path.proposal_id, token.user_id(), body.vote).await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::conflict("Proposal can no longer be voted on").into_response(),
        Err(err) => ApiError::from_db(
            &format!("Error voting on proposal {}", path.proposal_id),
            err,
        )
        .into_response(),
    }
}

doc_fn!(vote_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Cast or change a vote on a proposal (1 = upvote, -1 = downvote)")
        .response_with::<204, (), _>(|res| res.description("Vote recorded"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid vote value"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("The proposal's author may not vote on it"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Proposal not found"))
        .response_with::<409, Json<ErrorResponse>, _>(|res| res.description("Proposal is no longer pending"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

pub(super) async fn unvote_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<ProposalPath>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match proposals::unvote_proposal(&app.pg_pool, path.proposal_id, token.user_id()).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => ApiError::from_db(
            &format!("Error removing vote on proposal {}", path.proposal_id),
            err,
        )
        .into_response(),
    }
}

doc_fn!(unvote_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Remove the calling user's vote from a proposal")
        .response_with::<204, (), _>(|res| res.description("Vote removed"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);
