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
    models::proposal::{Proposal, ProposalStatus, ReviewRequest},
    query::proposals,
    state::AppState,
};

#[derive(Deserialize, JsonSchema)]
pub struct ListFeatureProposalsQuery {
    pub status: Option<String>,
}

pub async fn list_feature_proposals(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(waterway_id): Path<i64>,
    Query(params): Query<ListFeatureProposalsQuery>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    if !token.is_server_admin() {
        return StatusCode::FORBIDDEN.into_response();
    }

    match proposals::list_feature_proposals(&app.pg_pool, waterway_id, params.status.as_deref()).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing feature proposals for waterway {}: {}", waterway_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_feature_proposals_docs, op =>
    op.description("List feature proposals for a waterway (admin only)")
        .response::<200, Json<Vec<Proposal>>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

pub async fn get_feature_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, proposal_id)): Path<(i64, i64)>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    match proposals::get_feature_proposal(&app.pg_pool, proposal_id, waterway_id).await {
        Ok(Some(p)) => {
            if !token.is_server_admin() && p.submitted_by != token.user_id() {
                return StatusCode::FORBIDDEN.into_response();
            }
            Json(p).into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error fetching feature proposal {}: {}", proposal_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(get_feature_proposal_docs, op =>
    op.description("Get a feature proposal scoped to a waterway (admin or submitter)")
        .response::<200, Json<Proposal>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .response_with::<404, (), _>(|res| res.description("Proposal not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);

pub async fn review_feature_proposal(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((_waterway_id, proposal_id)): Path<(i64, i64)>,
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
            tracing::error!("Error reviewing feature proposal {}: {}", proposal_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(review_feature_proposal_docs, op =>
    op.description("Approve or reject a feature proposal (admin only)")
        .response::<200, Json<Proposal>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<403, (), _>(|res| res.description("Forbidden"))
        .response_with::<404, (), _>(|res| res.description("Proposal not found or already reviewed"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Proposals")
);
