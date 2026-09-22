use aide::axum::{
    ApiRouter, IntoApiResponse,
    routing::{get_with, put_with},
};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use chrono::NaiveDate;

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        path_params::{TripPath, TripStayPath},
        trip::{
            CreateTripStayRequest, PatchTripStayRequest, ReplaceTripSectionsRequest, TripSection,
            TripStay,
        },
    },
    query::trips,
    state::AppState,
};

use super::access::{caller, require_admin, require_member};
use super::respond::{failure, if_match, outcome, with_etag};

pub fn stay_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_stays, list_stays_docs).post_with(create_stay, create_stay_docs),
        )
        .api_route(
            "/{stay_id}",
            get_with(get_stay, get_stay_docs)
                .patch_with(patch_stay, patch_stay_docs)
                .delete_with(delete_stay, delete_stay_docs),
        )
        .api_route(
            "/{stay_id}/sections",
            put_with(replace_sections, replace_sections_docs),
        )
        .with_state(state)
}

/// A point needs both halves, and a stay cannot end before it starts. The
/// dates are also checked by the table, but answering here keeps the message
/// specific to the field the client got wrong.
pub(super) fn stay_input_error(
    lat: Option<f64>,
    lon: Option<f64>,
    arrival: Option<NaiveDate>,
    departure: Option<NaiveDate>,
) -> Option<Response> {
    if lat.is_some() != lon.is_some() {
        return Some(
            ApiError::validation("location needs both lat and lon, or neither").into_response(),
        );
    }
    if let (Some(a), Some(d)) = (arrival, departure) {
        if d < a {
            return Some(
                ApiError::validation("departure must be on or after arrival").into_response(),
            );
        }
    }
    None
}

pub async fn list_stays(
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

    match trips::list_stays(&app.pg_pool, trip_id).await {
        Ok(stays) => Json(stays).into_response(),
        Err(err) => failure(&format!("listing trip {trip_id} stays"), err),
    }
}

doc_fn!(list_stays_docs, op =>
    op.input::<Path<TripPath>>()
        .description("List a trip's stays as a timeline, each with the sections watched from it.")
        .response::<200, Json<Vec<TripStay>>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not visible"))
        .tag("Trips")
);

pub async fn get_stay(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripStayPath { trip_id, stay_id }): Path<TripStayPath>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::list_stays(&app.pg_pool, trip_id).await {
        Ok(stays) => match stays.into_iter().find(|s| s.id == stay_id) {
            Some(stay) => with_etag(StatusCode::OK, &stay, stay.updated_at),
            None => ApiError::not_found("Not found").into_response(),
        },
        Err(err) => failure(&format!("fetching trip {trip_id} stay {stay_id}"), err),
    }
}

doc_fn!(get_stay_docs, op =>
    op.input::<Path<TripStayPath>>()
        .description("Get one stay of a trip")
        .response::<200, Json<TripStay>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not visible"))
        .tag("Trips")
);

pub async fn create_stay(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
    Json(body): Json<CreateTripStayRequest>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }
    if let Some(res) = stay_input_error(body.lat, body.lon, body.arrival, body.departure) {
        return res;
    }

    match trips::create_stay(&app.pg_pool, trip_id, &caller_id, &body).await {
        Ok(stay) => with_etag(StatusCode::CREATED, &stay, stay.updated_at),
        Err(err) => failure(&format!("creating trip {trip_id} stay"), err),
    }
}

doc_fn!(create_stay_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Add a stay. Kind and name are enough, so a placeholder can be planned against while booking is open.")
        .response_with::<201, Json<TripStay>, _>(|res| res.description("Stay created"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn patch_stay(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripStayPath { trip_id, stay_id }): Path<TripStayPath>,
    headers: HeaderMap,
    Json(body): Json<PatchTripStayRequest>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }
    if body.lat.is_some() != body.lon.is_some() {
        return ApiError::validation("location needs both lat and lon, or neither").into_response();
    }
    let expected = match if_match(&headers) {
        Ok(v) => v,
        Err(err) => return err.into_response(),
    };

    match trips::patch_stay(&app.pg_pool, trip_id, stay_id, expected, &body).await {
        Ok(result) => outcome(result, |stay| {
            with_etag(StatusCode::OK, &stay, stay.updated_at)
        }),
        Err(err) => failure(&format!("patching trip {trip_id} stay {stay_id}"), err),
    }
}

doc_fn!(patch_stay_docs, op =>
    op.input::<Path<TripStayPath>>()
        .description("Update a stay. Any member may edit it, since the base moves while the trip runs. Send the stay's `updated_at` as `If-Match` (quoted, as in the ETag) to refuse with 412 if someone else changed it first.")
        .response::<200, Json<TripStay>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .response_with::<412, Json<ErrorResponse>, _>(|res| res.description("Changed since the If-Match version"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn delete_stay(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripStayPath { trip_id, stay_id }): Path<TripStayPath>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
        return res;
    }

    // The last-stay rule lives with the delete, under the trip lock.
    match trips::delete_stay(&app.pg_pool, trip_id, stay_id).await {
        Ok(result) => outcome(result, |()| StatusCode::NO_CONTENT.into_response()),
        Err(err) => failure(&format!("deleting trip {trip_id} stay {stay_id}"), err),
    }
}

doc_fn!(delete_stay_docs, op =>
    op.input::<Path<TripStayPath>>()
        .description("Delete a stay. Admin only, and the last stay cannot be deleted.")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Would leave the trip without a stay"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn replace_sections(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripStayPath { trip_id, stay_id }): Path<TripStayPath>,
    Json(body): Json<ReplaceTripSectionsRequest>,
) -> impl IntoApiResponse {
    // `caller_id`, not `user_id`: members routes already carry a `user_id`
    // in the path, and the two are not the same person.
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, &caller_id).await {
        return res;
    }

    // Position is list order, so a run listed twice has no single place.
    let mut seen = std::collections::HashSet::new();
    if let Some(dup) = body.sections.iter().find(|s| !seen.insert(s.section_id)) {
        return ApiError::validation(format!("Section {} is listed twice", dup.section_id))
            .with_target("sections")
            .into_response();
    }

    match trips::replace_stay_sections(&app.pg_pool, trip_id, stay_id, &body.sections).await {
        Ok(Some(sections)) => Json(sections).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(
            &format!("replacing trip {trip_id} stay {stay_id} sections"),
            err,
        ),
    }
}

doc_fn!(replace_sections_docs, op =>
    op.input::<Path<TripStayPath>>()
        .description("Replace the sections watched from a stay, in order: a section's position is its place in the list. Runs that stay on the list keep their id, status and note; leaving `status` or `note` out keeps what the entry had. The same section may be watched from several stays.")
        .response::<200, Json<Vec<TripSection>>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);
