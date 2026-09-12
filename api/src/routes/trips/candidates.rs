use aide::axum::{ApiRouter, IntoApiResponse, routing::{get_with, post_with}};
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
        path_params::{TripCandidatePath, TripPath},
        proposal::VoteRequest,
        trip::{
            CreateTripStayCandidateRequest, PatchTripStayCandidateRequest, TripStay,
            TripStayCandidate,
        },
    },
    query::trips,
    state::AppState,
};

use super::access::{caller, require_admin, require_member};
use super::constraint_message;

pub fn candidate_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_candidates, list_candidates_docs)
                .post_with(propose_candidate, propose_candidate_docs),
        )
        .api_route(
            "/{candidate_id}",
            get_with(get_candidate, get_candidate_docs)
                .patch_with(patch_candidate, patch_candidate_docs)
                .delete_with(withdraw_candidate, withdraw_candidate_docs),
        )
        // A vote is cast and taken back; there is nothing to GET here that
        // GET /candidates/{id} does not already say.
        .api_route(
            "/{candidate_id}/vote",
            post_with(vote_candidate, vote_candidate_docs)
                .delete_with(unvote_candidate, unvote_candidate_docs),
        )
        .with_state(state)
}

pub async fn list_candidates(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::list_candidates(&app.pg_pool, trip_id, &caller_id).await {
        Ok(items) => Json(items).into_response(),
        Err(err) => {
            tracing::error!("Error listing candidates for trip {}: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_candidates_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Bases put up for the trip, best supported first.")
        .response::<200, Json<Vec<TripStayCandidate>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn get_candidate(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripCandidatePath {
        trip_id,
        candidate_id,
    }): Path<TripCandidatePath>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::get_candidate(&app.pg_pool, candidate_id, &caller_id).await {
        Ok(Some(c)) if c.trip_id == trip_id => Json(c).into_response(),
        Ok(_) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error loading candidate {}: {}", candidate_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_candidate_docs, op =>
    op.input::<Path<TripCandidatePath>>()
        .description("One proposed base, with its votes.")
        .response::<200, Json<TripStayCandidate>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn propose_candidate(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
    Json(body): Json<CreateTripStayCandidateRequest>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }
    if body.name.trim().is_empty() {
        return ApiError::validation("A base needs a name").into_response();
    }

    match trips::create_candidate(&app.pg_pool, trip_id, &caller_id, &body).await {
        Ok(Some(c)) => (StatusCode::CREATED, Json(c)).into_response(),
        Ok(None) => ApiError::internal().into_response(),
        Err(err) => match constraint_message(&err) {
            Some(msg) => ApiError::validation(msg).into_response(),
            None => {
                tracing::error!("Error proposing a base for trip {}: {}", trip_id, err);
                ApiError::internal().into_response()
            }
        },
    }
}

doc_fn!(propose_candidate_docs, op =>
    op.input::<Path<TripPath>>()
        .input::<Json<CreateTripStayCandidateRequest>>()
        .description("Put a base up for the group. Any member may; the proposer's own vote is counted for it.")
        .response_with::<201, Json<TripStayCandidate>, _>(|res| res.description("Proposed"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn vote_candidate(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripCandidatePath {
        trip_id,
        candidate_id,
    }): Path<TripCandidatePath>,
    Json(body): Json<VoteRequest>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }
    if body.vote != 1 && body.vote != -1 {
        return ApiError::validation("Vote must be 1 or -1").into_response();
    }

    match trips::cast_vote(&app.pg_pool, candidate_id, &caller_id, body.vote).await {
        Ok(()) => match trips::get_candidate(&app.pg_pool, candidate_id, &caller_id).await {
            Ok(Some(c)) => Json(c).into_response(),
            Ok(None) => ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error reloading candidate {}: {}", candidate_id, err);
                ApiError::internal().into_response()
            }
        },
        Err(err) => {
            tracing::error!("Error voting on candidate {}: {}", candidate_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(vote_candidate_docs, op =>
    op.input::<Path<TripCandidatePath>>()
        .input::<Json<VoteRequest>>()
        .description("Vote for or against a proposed base: 1 or -1. Voting again replaces the vote.")
        .response::<200, Json<TripStayCandidate>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid vote"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn unvote_candidate(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripCandidatePath {
        trip_id,
        candidate_id,
    }): Path<TripCandidatePath>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::clear_vote(&app.pg_pool, candidate_id, &caller_id).await {
        Ok(()) => match trips::get_candidate(&app.pg_pool, candidate_id, &caller_id).await {
            Ok(Some(c)) => Json(c).into_response(),
            Ok(None) => ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error reloading candidate {}: {}", candidate_id, err);
                ApiError::internal().into_response()
            }
        },
        Err(err) => {
            tracing::error!("Error clearing vote on candidate {}: {}", candidate_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(unvote_candidate_docs, op =>
    op.input::<Path<TripCandidatePath>>()
        .description("Take back your vote on a proposed base.")
        .response::<200, Json<TripStayCandidate>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

/// One PATCH, two jobs, because a candidate has two kinds of change: any
/// member may correct its fields, and only an admin may accept it. The body
/// says which, so the permission follows the field rather than the route.
pub async fn patch_candidate(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripCandidatePath {
        trip_id,
        candidate_id,
    }): Path<TripCandidatePath>,
    Json(body): Json<PatchTripStayCandidateRequest>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };

    if body.accepted == Some(true) {
        // Settling the argument is an admin's call, like every other write
        // that changes what the trip is.
        if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
            return res;
        }
        return match trips::accept_candidate(&app.pg_pool, candidate_id, &caller_id).await {
            Ok(Some(stay)) => (StatusCode::CREATED, Json(stay)).into_response(),
            Ok(None) => ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error accepting candidate {}: {}", candidate_id, err);
                ApiError::internal().into_response()
            }
        };
    }

    // Correcting a suggestion is open to the trip: whoever spots the wrong
    // price or the dead link should be able to fix it.
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }
    if body.name.as_ref().is_some_and(|n| n.trim().is_empty()) {
        return ApiError::validation("A base needs a name").into_response();
    }

    match trips::update_candidate(&app.pg_pool, candidate_id, &caller_id, &body).await {
        Ok(Some(c)) if c.trip_id == trip_id => Json(c).into_response(),
        Ok(_) => ApiError::not_found("Not found").into_response(),
        Err(err) => match constraint_message(&err) {
            Some(msg) => ApiError::validation(msg).into_response(),
            None => {
                tracing::error!("Error updating candidate {}: {}", candidate_id, err);
                ApiError::internal().into_response()
            }
        },
    }
}

doc_fn!(patch_candidate_docs, op =>
    op.input::<Path<TripCandidatePath>>()
        .input::<Json<PatchTripStayCandidateRequest>>()
        .description("Correct a proposed base, or accept it. Any member may edit the fields - a suggestion belongs to the trip, not to whoever typed it. Only an admin may send `accepted`, which turns it into a base.")
        .response::<200, Json<TripStayCandidate>>()
        .response_with::<201, Json<TripStay>, _>(|res| res.description("Accepted, and now a base"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn withdraw_candidate(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripCandidatePath {
        trip_id,
        candidate_id,
    }): Path<TripCandidatePath>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(res) => return res,
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    // Your own suggestion is yours to take back; anybody else's is an admin's.
    let own = match trips::get_candidate(&app.pg_pool, candidate_id, &caller_id).await {
        Ok(Some(c)) if c.trip_id == trip_id => c.proposed_by == caller_id,
        Ok(_) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error loading candidate {}: {}", candidate_id, err);
            return ApiError::internal().into_response();
        }
    };
    if !own {
        if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
            return res;
        }
    }

    match trips::delete_candidate(&app.pg_pool, candidate_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error withdrawing candidate {}: {}", candidate_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(withdraw_candidate_docs, op =>
    op.input::<Path<TripCandidatePath>>()
        .description("Withdraw a proposed base. Your own, or anyone's if you are an admin.")
        .response_with::<204, (), _>(|res| res.description("Withdrawn"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Not yours"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);
