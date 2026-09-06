mod members;
mod stays;

use aide::axum::{
    ApiRouter, IntoApiResponse,
    routing::{get_with, put_with},
};
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        path_params::TripPath,
        trip::{
            CreateTripRequest, ListTripsQuery, PatchTripRequest, ReplaceAudienceGroupsRequest,
            ReplaceAudienceUsersRequest, Trip, TripId, TripMemberRole,
        },
        visibility::Visibility,
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
        .api_route(
            "/{trip_id}/audiences/users",
            put_with(replace_audience_users, replace_audience_users_docs),
        )
        .api_route(
            "/{trip_id}/audiences/groups",
            put_with(replace_audience_groups, replace_audience_groups_docs),
        )
        .nest_api_service("/{trip_id}/members", members::member_routes(state.clone()))
        .nest_api_service("/{trip_id}/stays", stays::stay_routes(state.clone()))
        .with_state(state)
}

/// Every write below the trip is an admin action, so they all start here.
/// Returns the error response to send, or None when the caller may proceed.
pub(super) async fn require_admin(
    app: &AppState,
    trip_id: TripId,
    user_id: &str,
) -> Option<Response> {
    match trips::member_role(&app.pg_pool, trip_id, user_id).await {
        Ok(Some(TripMemberRole::Admin)) => None,
        Ok(Some(TripMemberRole::Member)) => {
            Some(ApiError::forbidden("Admin role required").into_response())
        }
        Ok(None) => Some(ApiError::not_found("Not found").into_response()),
        Err(err) => {
            tracing::error!("Error checking trip {} role: {}", trip_id, err);
            Some(ApiError::internal().into_response())
        }
    }
}

fn audience_error(visibility: &Visibility) -> Option<Response> {
    let Visibility::Shared { users, groups } = visibility else {
        return None;
    };
    if users.is_empty() && groups.is_empty() {
        return Some(
            ApiError::validation("shared visibility requires at least one user or group")
                .into_response(),
        );
    }
    None
}

pub async fn list_trips(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Query(q): Query<ListTripsQuery>,
) -> impl IntoApiResponse {
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    if q.scope.as_deref() == Some("member") && viewer_id.is_none() {
        return ApiError::unauthorized("Authentication required").into_response();
    }

    let filters = trips::ListFilters {
        scope: q.scope,
        from: q.from,
        to: q.to,
        page: q.page.unwrap_or(1).max(1),
        per_page: q.per_page.unwrap_or(25).clamp(1, 100),
    };

    match trips::list_trips_for_viewer(&app.pg_pool, viewer_id.as_deref(), filters).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing trips: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_trips_docs, op =>
    op.input::<Query<ListTripsQuery>>()
        .description("List trips visible to the current viewer. scope=member narrows to the caller's own trips.")
        .response::<200, Json<PaginatedResponse<Trip>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized (scope=member requires auth)"))
        .tag("Trips")
);

pub async fn create_trip(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(body): Json<CreateTripRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    if let Some(res) = audience_error(&body.visibility) {
        return res;
    }
    if let Some(end) = body.end_date {
        if end < body.start_date {
            return ApiError::validation("end_date must be on or after start_date").into_response();
        }
    }
    if let Some(res) = stays::stay_input_error(body.stay.lat, body.stay.lon, body.stay.arrival, body.stay.departure) {
        return res;
    }

    match trips::create_trip(&app.pg_pool, token.user_id(), &body).await {
        Ok(trip) => (StatusCode::CREATED, Json(trip)).into_response(),
        Err(err) => {
            tracing::error!("Error creating trip: {}", err);
            ApiError::internal().into_response()
        }
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
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    match trips::get_trip_for_viewer(&app.pg_pool, trip_id, viewer_id.as_deref()).await {
        Ok(Some(trip)) => Json(trip).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error fetching trip {}: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_trip_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Get a trip by ID")
        .response::<200, Json<Trip>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not visible"))
        .tag("Trips")
);

pub async fn patch_trip(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
    Json(body): Json<PatchTripRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, token.user_id()).await {
        return res;
    }
    if let Some(vis) = &body.visibility {
        if let Some(res) = audience_error(vis) {
            return res;
        }
    }

    match trips::patch_trip(&app.pg_pool, trip_id, token.user_id(), &body).await {
        Ok(Some(trip)) => Json(trip).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(ref err) if constraint_message(err).is_some() => {
            ApiError::validation(constraint_message(err).unwrap()).into_response()
        }
        Err(err) => {
            tracing::error!("Error patching trip {}: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

/// The check constraints a client can actually trip, each with the message
/// for the rule it broke - so a bad date answers 400 saying which one, rather
/// than leaking a constraint name through an internal error.
pub(super) fn constraint_message(err: &sqlx::Error) -> Option<&'static str> {
    let sqlx::Error::Database(db) = err else {
        return None;
    };
    match db.constraint()? {
        "chk_trip_dates" => Some("end_date must be on or after start_date"),
        "chk_trip_stay_dates" | "chk_trip_attendance_dates" => {
            Some("departure must be on or after arrival")
        }
        "chk_trip_attendance_arrival_time" => {
            Some("Set the day you arrive before the time")
        }
        "chk_trip_attendance_departure_time" => {
            Some("Set the day you leave before the time")
        }
        "chk_trip_attendance_same_day" => {
            Some("Arriving and leaving the same day, but the times run backwards")
        }
        _ => None,
    }
}

doc_fn!(patch_trip_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Update a trip. Admin only. Patching visibility to shared replaces the audience inline.")
        .response::<200, Json<Trip>>()
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
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, token.user_id()).await {
        return res;
    }

    match trips::delete_trip(&app.pg_pool, trip_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting trip {}: {}", trip_id, err);
            ApiError::internal().into_response()
        }
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

pub async fn replace_audience_users(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
    Json(body): Json<ReplaceAudienceUsersRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, token.user_id()).await {
        return res;
    }

    match trips::replace_visible_users(&app.pg_pool, trip_id, &body.users).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!("Error setting trip {} user audience: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(replace_audience_users_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Replace the users a shared trip is visible to. Admin only.")
        .response_with::<204, (), _>(|res| res.description("Audience replaced"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);

pub async fn replace_audience_groups(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
    Json(body): Json<ReplaceAudienceGroupsRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, token.user_id()).await {
        return res;
    }

    match trips::replace_visible_groups(&app.pg_pool, trip_id, &body.groups).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!("Error setting trip {} group audience: {}", trip_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(replace_audience_groups_docs, op =>
    op.input::<Path<TripPath>>()
        .description("Replace the groups a shared trip is visible to. Admin only.")
        .response_with::<204, (), _>(|res| res.description("Audience replaced"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Admin role required"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);
