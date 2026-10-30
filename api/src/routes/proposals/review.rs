use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        path_params::ProposalPath,
        proposal::{Proposal, ProposalStatus, ReviewRequest},
    },
    query::proposals,
    routes::access,
    state::AppState,
};

pub(super) async fn review_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<ProposalPath>,
    Json(body): Json<ReviewRequest>,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };

    if let Err(err) = access::require_server_admin(&token, "Not permitted") {
        return err.into_response();
    }

    if matches!(body.status, ProposalStatus::Pending) {
        return ApiError::validation("Status must be 'approved' or 'rejected'").into_response();
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
        Ok(Some(p)) => {
            // Approval may have created + activated a gauge; wake the poller.
            app.gauge_wake.notify_waiters();
            // A new section may need its regions derived.
            app.region_wake.notify_waiters();
            Json(p).into_response()
        }
        Ok(None) => ApiError::not_found("Not found").into_response(),
        // Unique violation while applying the change (e.g. duplicate waterway name).
        Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23505") => ApiError::conflict("Approving would create a duplicate (name already exists) - reject the proposal instead").into_response(),
        // Check violation (e.g. water range thresholds out of order).
        Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23514") => ApiError::conflict("The proposed data violates a data constraint (e.g. water range thresholds) - reject the proposal instead").into_response(),
        // Foreign key violation (e.g. a referenced gauge series was deleted).
        Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23503") => ApiError::conflict("The proposal references data that no longer exists (e.g. a deleted gauge) - reject the proposal instead").into_response(),
        // The stored payload no longer matches the shape the API expects,
        // which happens when a required field is added after it was submitted.
        // Say so plainly instead of reporting a server fault the admin cannot act on.
        Err(sqlx::Error::Decode(err)) => {
            tracing::error!("Proposal {} payload is no longer readable: {}", path.proposal_id, err);
            ApiError::conflict("This proposal was submitted in an older format and can no longer be applied - reject it and ask for a new one").into_response()
        }
        Err(err) => {
            ApiError::from_db(&format!("Error reviewing proposal {}", path.proposal_id), err).into_response()
        }
    }
}

doc_fn!(review_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Approve or reject a proposal (admin only)")
        .response::<200, Json<Proposal>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Proposal not found or already reviewed"))
        .response_with::<409, Json<ErrorResponse>, _>(|res| res.description("Approving would create a duplicate"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

pub(super) async fn delete_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<ProposalPath>,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };

    let proposal = match proposals::get_proposal(
        &app.pg_pool,
        path.proposal_id,
        Some(token.user_id()),
    )
    .await
    {
        Ok(Some(p)) => p,
        Ok(None) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            return ApiError::from_db(
                &format!("Error fetching proposal {} for delete", path.proposal_id),
                err,
            )
            .into_response();
        }
    };

    // Only the submitter or an admin may withdraw a proposal.
    let is_owner = proposal.submitted_by == token.user_id();
    if !is_owner && !token.is_server_admin() {
        return ApiError::forbidden("Not permitted").into_response();
    }

    // Only pending proposals can be withdrawn; reviewed ones are immutable.
    if proposal.status != ProposalStatus::Pending {
        return ApiError::conflict("Only pending proposals can be deleted").into_response();
    }

    match proposals::delete_proposal(&app.pg_pool, path.proposal_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => ApiError::from_db(
            &format!("Error deleting proposal {}", path.proposal_id),
            err,
        )
        .into_response(),
    }
}

doc_fn!(delete_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Delete (withdraw) a pending proposal. Allowed for the submitter or an admin.")
        .response_with::<204, (), _>(|res| res.description("Proposal deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Proposal not found"))
        .response_with::<409, Json<ErrorResponse>, _>(|res| res.description("Proposal already reviewed"))
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
