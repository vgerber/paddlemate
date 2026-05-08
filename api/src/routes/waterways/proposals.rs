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
        proposal::{Proposal, ProposalStatus, ReviewRequest},
    },
    query::proposals,
    state::AppState,
};

#[derive(Deserialize, JsonSchema)]
pub struct ListProposalsQuery {
    pub status: Option<String>,
    pub entity_type: Option<String>,
}

pub async fn list_waterway_proposals(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Query(params): Query<ListProposalsQuery>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    if !token.is_server_admin() {
        return StatusCode::FORBIDDEN.into_response();
    }

    match proposals::list_waterway_proposals(
        &app.pg_pool,
        params.status.as_deref(),
        params.entity_type.as_deref(),
    )
    .await
    {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing waterway proposals: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_waterway_proposals_docs, op =>
    op.description("List pending waterway and section proposals (admin only)")
        .response::<200, Json<Vec<Proposal>>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

pub async fn get_waterway_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(proposal_id): Path<i64>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    match proposals::get_proposal(&app.pg_pool, proposal_id).await {
        Ok(Some(p)) => {
            // Admins can view any; submitters can view their own
            if !token.is_server_admin() && p.submitted_by != token.user_id() {
                return StatusCode::FORBIDDEN.into_response();
            }
            Json(p).into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error fetching proposal {}: {}", proposal_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(get_waterway_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Get a waterway or section proposal (admin or submitter)")
        .response::<200, Json<Proposal>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .response_with::<404, (), _>(|res| res.description("Proposal not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

pub async fn review_waterway_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(proposal_id): Path<i64>,
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
        return (StatusCode::UNPROCESSABLE_ENTITY, "Status must be 'approved' or 'rejected'")
            .into_response();
    }

    match proposals::review_proposal(
        &app.pg_pool,
        proposal_id,
        token.user_id(),
        &body.status,
        body.review_note.as_deref(),
    )
    .await
    {
        Ok(Some(p)) => Json(p).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error reviewing proposal {}: {}", proposal_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(review_waterway_proposal_docs, op =>
    op.input::<Path<ProposalPath>>()
        .description("Approve or reject a waterway/section proposal (admin only)")
        .response::<200, Json<Proposal>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .response_with::<404, (), _>(|res| res.description("Proposal not found or already reviewed"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

// Aide requires serializable types to generate request body schemas.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, JsonSchema)]
#[allow(dead_code)]
struct ReviewRequestDoc {
    status: ProposalStatus,
    review_note: Option<String>,
}
