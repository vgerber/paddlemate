use aide::axum::{
    ApiRouter, IntoApiResponse,
    routing::{get_with, post_with},
};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        geometry::Geometry,
        notification::{EventSummary, TripEventKind},
        path_params::{TripCandidatePath, TripPath},
        proposal::VoteRequest,
        trip::{
            CreateTripStayCandidateRequest, PatchTripStayCandidateRequest, TripStay,
            TripStayCandidate,
        },
    },
    notify,
    query::trips::{self, Outcome},
    state::AppState,
};

use super::access::{caller, require_admin, require_member};
use super::name_error;
use super::respond::{failure, if_match, outcome, with_etag};

/// A base is a place, so its location is a point - anything else would only
/// fail later, in the column, as an internal error.
fn location_error(location: Option<&Geometry>) -> Option<Response> {
    match location {
        None | Some(Geometry::Point { .. }) => None,
        Some(_) => Some(
            ApiError::validation("A base's location must be a Point")
                .with_target("location")
                .into_response(),
        ),
    }
}

/// After a vote is cast or taken back: open views refresh live, the bell
/// stays quiet (see `TripEventKind::in_inbox`).
async fn voted(app: &AppState, trip_id: i64, candidate_id: i64, caller_id: &str) -> Response {
    if let Ok(Some(c)) = trips::get_candidate(&app.pg_pool, trip_id, candidate_id, caller_id).await
    {
        let named = EventSummary::named(&c.name);
        notify::record(
            app,
            trip_id,
            caller_id,
            TripEventKind::CandidateVoted,
            named,
        )
        .await;
    }
    current(app, trip_id, candidate_id, caller_id).await
}

/// The candidate as it now stands, for the vote routes' answer.
async fn current(app: &AppState, trip_id: i64, candidate_id: i64, caller_id: &str) -> Response {
    match trips::get_candidate(&app.pg_pool, trip_id, candidate_id, caller_id).await {
        Ok(Some(c)) => with_etag(StatusCode::OK, &c, c.updated_at),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(&format!("loading candidate {candidate_id}"), err),
    }
}

// Every handler passes the path's trip to the query, which filters on it:
// a candidate id is only ever looked up inside the trip it was reached by.
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
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::list_candidates(&app.pg_pool, trip_id, &caller_id).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => failure(&format!("listing candidates for trip {trip_id}"), err),
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
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    current(&app, trip_id, candidate_id, &caller_id).await
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
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }
    if let Some(res) = name_error("name", &body.name) {
        return res;
    }

    if let Some(res) = location_error(body.location.as_ref()) {
        return res;
    }

    match trips::create_candidate(&app.pg_pool, trip_id, &caller_id, &body).await {
        Ok(Some(c)) => {
            let named = EventSummary::named(&c.name);
            notify::record(
                &app,
                trip_id,
                &caller_id,
                TripEventKind::CandidateProposed,
                named,
            )
            .await;
            with_etag(StatusCode::CREATED, &c, c.updated_at)
        }
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(&format!("proposing a base for trip {trip_id}"), err),
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
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }
    if body.vote != 1 && body.vote != -1 {
        return ApiError::validation("Vote must be 1 or -1").into_response();
    }

    // cast_vote only matches a candidate of this trip, so an id from another
    // trip is a 404 here rather than a vote there.
    match trips::cast_vote(&app.pg_pool, trip_id, candidate_id, &caller_id, body.vote).await {
        Ok(true) => voted(&app, trip_id, candidate_id, &caller_id).await,
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(&format!("voting on candidate {candidate_id}"), err),
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
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::clear_vote(&app.pg_pool, trip_id, candidate_id, &caller_id).await {
        Ok(()) => voted(&app, trip_id, candidate_id, &caller_id).await,
        Err(err) => failure(&format!("clearing a vote on candidate {candidate_id}"), err),
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
    headers: HeaderMap,
    Json(body): Json<PatchTripStayCandidateRequest>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };

    let expected = match if_match(&headers) {
        Ok(v) => v,
        Err(err) => return err.into_response(),
    };

    if body.accepted == Some(true) {
        // Settling the argument is an admin's call, like every other write
        // that changes what the trip is.
        if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
            return res;
        }
        return match trips::accept_candidate(
            &app.pg_pool,
            trip_id,
            candidate_id,
            &caller_id,
            expected,
        )
        .await
        {
            Ok(result) => {
                if let Outcome::Done(stay) = &result {
                    let named = EventSummary::named(&stay.name);
                    notify::record(
                        &app,
                        trip_id,
                        &caller_id,
                        TripEventKind::CandidateAccepted,
                        named,
                    )
                    .await;
                }
                outcome(result, |stay| {
                    with_etag(StatusCode::CREATED, &stay, stay.updated_at)
                })
            }
            Err(err) => failure(&format!("accepting candidate {candidate_id}"), err),
        };
    }

    // Correcting a suggestion is open to the trip: whoever spots the wrong
    // price or the dead link should be able to fix it.
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }
    if let Some(res) = body.name.as_deref().and_then(|n| name_error("name", n)) {
        return res;
    }
    if let Some(res) = location_error(body.location.as_ref().and_then(|l| l.as_ref())) {
        return res;
    }

    match trips::update_candidate(
        &app.pg_pool,
        trip_id,
        candidate_id,
        &caller_id,
        expected,
        &body,
    )
    .await
    {
        Ok(result) => {
            if let Outcome::Done(c) = &result {
                let named = EventSummary::named(&c.name);
                notify::record(
                    &app,
                    trip_id,
                    &caller_id,
                    TripEventKind::CandidateChanged,
                    named,
                )
                .await;
            }
            outcome(result, |c| with_etag(StatusCode::OK, &c, c.updated_at))
        }
        Err(err) => failure(&format!("editing candidate {candidate_id}"), err),
    }
}

doc_fn!(patch_candidate_docs, op =>
    op.input::<Path<TripCandidatePath>>()
        .input::<Json<PatchTripStayCandidateRequest>>()
        .description("Correct a proposed base, or accept it. Any member may edit the fields - a suggestion belongs to the trip, not to whoever typed it. Only an admin may send `accepted`, which turns it into a base. Send the candidate's `updated_at` as `If-Match` (quoted, as in the ETag) to refuse with 412 if it changed first - for an accept, that means accepting only the version you read.")
        .response::<200, Json<TripStayCandidate>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .response_with::<412, Json<ErrorResponse>, _>(|res| res.description("Changed since the If-Match version"))
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
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    // Your own suggestion is yours to take back; anybody else's is an admin's.
    let (own, name) =
        match trips::get_candidate(&app.pg_pool, trip_id, candidate_id, &caller_id).await {
            Ok(Some(c)) => (c.proposed_by == caller_id, c.name),
            Ok(None) => return ApiError::not_found("Not found").into_response(),
            Err(err) => return failure(&format!("loading candidate {candidate_id}"), err),
        };
    if !own {
        if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
            return res;
        }
    }

    match trips::delete_candidate(&app.pg_pool, trip_id, candidate_id).await {
        Ok(true) => {
            let named = EventSummary::named(name);
            notify::record(
                &app,
                trip_id,
                &caller_id,
                TripEventKind::CandidateWithdrawn,
                named,
            )
            .await;
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(&format!("withdrawing candidate {candidate_id}"), err),
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
