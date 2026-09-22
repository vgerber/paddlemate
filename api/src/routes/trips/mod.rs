mod access;
mod candidates;
mod members;
mod respond;
mod stays;

use access::{caller, require_admin};
use respond::{failure, if_match, outcome, with_etag};

use aide::axum::{ApiRouter, IntoApiResponse, routing::get_with};
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        path_params::TripPath,
        trip::{CreateTripRequest, ListTripsQuery, PatchTripRequest, Trip},
        waterway::PaginatedResponse,
    },
    query::trips,
    state::AppState,
};

pub fn trips_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_trips, list_trips_docs).post_with(create_trip, create_trip_docs),
        )
        .api_route(
            "/{trip_id}",
            get_with(get_trip, get_trip_docs)
                .patch_with(patch_trip, patch_trip_docs)
                .delete_with(delete_trip, delete_trip_docs),
        )
        .nest_api_service(
            "/{trip_id}/candidates",
            candidates::candidate_routes(state.clone()),
        )
        .nest_api_service("/{trip_id}/members", members::member_routes(state.clone()))
        .nest_api_service("/{trip_id}/stays", stays::stay_routes(state.clone()))
        .with_state(state)
}

pub async fn list_trips(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Query(q): Query<ListTripsQuery>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };

    let filters = trips::ListFilters {
        from: q.from,
        to: q.to,
        page: q.page.unwrap_or(1).max(1),
        per_page: q.per_page.unwrap_or(25).clamp(1, 100),
    };

    match trips::list_trips_for_viewer(&app.pg_pool, &caller_id, filters).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => failure("listing trips", err),
    }
}

doc_fn!(list_trips_docs, op =>
    op.input::<Query<ListTripsQuery>>()
        .description("List the caller's trips. A trip is visible to its members only.")
        .response::<200, Json<PaginatedResponse<Trip>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn create_trip(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(body): Json<CreateTripRequest>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };

    if let Some(end) = body.end_date {
        if end < body.start_date {
            return ApiError::validation("end_date must be on or after start_date").into_response();
        }
    }
    if let Some(res) = stays::stay_input_error(
        body.stay.lat,
        body.stay.lon,
        body.stay.arrival,
        body.stay.departure,
    ) {
        return res;
    }

    match trips::create_trip(&app.pg_pool, &caller_id, &body).await {
        Ok(trip) => with_etag(StatusCode::CREATED, &trip, trip.updated_at),
        Err(err) => failure("creating a trip", err),
    }
}

doc_fn!(create_trip_docs, op =>
    op.description("Create a trip. The caller becomes its first admin, and the trip is created with its first stay so the watch list always hangs off somewhere.")
        .response_with::<201, Json<Trip>, _>(|res| res.description("Trip created"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn get_trip(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };

    // A non-member gets the same 404 as a trip that does not exist.
    match trips::get_trip_for_viewer(&app.pg_pool, trip_id, &caller_id).await {
        Ok(Some(trip)) => with_etag(StatusCode::OK, &trip, trip.updated_at),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(&format!("fetching trip {trip_id}"), err),
    }
}

doc_fn!(get_trip_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Get a trip by ID. The `ETag` is its `updated_at`, for `If-Match` on the next edit.")
        .response::<200, Json<Trip>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not visible"))
        .tag("Trips")
);

pub async fn patch_trip(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
    headers: HeaderMap,
    Json(body): Json<PatchTripRequest>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
        return res;
    }

    let expected = match if_match(&headers) {
        Ok(v) => v,
        Err(err) => return err.into_response(),
    };

    match trips::patch_trip(&app.pg_pool, trip_id, &caller_id, expected, &body).await {
        Ok(result) => outcome(result, |trip| {
            with_etag(StatusCode::OK, &trip, trip.updated_at)
        }),
        Err(err) => failure(&format!("patching trip {trip_id}"), err),
    }
}

doc_fn!(patch_trip_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Update a trip. Admin only. Send the trip's `updated_at` as `If-Match` (quoted, as in the ETag) to refuse with 412 if someone else changed it first.")
        .response::<200, Json<Trip>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .response_with::<412, Json<ErrorResponse>, _>(|res| res.description("Changed since the If-Match version"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn delete_trip(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
) -> impl IntoApiResponse {
    let caller_id = match caller(auth) {
        Ok(id) => id,
        Err(err) => return err.into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, &caller_id).await {
        return res;
    }

    match trips::delete_trip(&app.pg_pool, trip_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => failure(&format!("deleting trip {trip_id}"), err),
    }
}

doc_fn!(delete_trip_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Delete a trip. Admin only. Linked descents are kept and simply lose their trip.")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);
