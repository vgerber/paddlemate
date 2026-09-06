use aide::axum::{
    ApiRouter, IntoApiResponse,
    routing::{get_with, put_with},
};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
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

use super::{constraint_message, require_admin};

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

/// Any member may shape the itinerary: the base moves while the trip runs, and
/// whoever finds the next camp should be able to record it.
async fn require_member(app: &AppState, trip_id: i64, user_id: &str) -> Option<Response> {
    match trips::member_role(&app.pg_pool, trip_id, user_id).await {
        Ok(Some(_)) => None,
        Ok(None) => Some(ApiError::not_found("Not found").into_response()),
        Err(err) => {
            tracing::error!("Error checking trip {} membership: {}", trip_id, err);
            Some(ApiError::internal().into_response())
        }
    }
}

pub async fn list_stays(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(TripPath { trip_id }): Path<TripPath>,
) -> impl IntoApiResponse {
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    match trips::can_view(&app.pg_pool, trip_id, viewer_id.as_deref()).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error checking trip {} visibility: {}", trip_id, err);
            return ApiError::internal().into_response();
        }
    }

    match trips::list_stays(&app.pg_pool, trip_id).await {
        Ok(stays) => Json(stays).into_response(),
        Err(err) => {
            tracing::error!("Error listing trip {} stays: {}", trip_id, err);
            ApiError::internal().into_response()
        }
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
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    match trips::can_view(&app.pg_pool, trip_id, viewer_id.as_deref()).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error checking trip {} visibility: {}", trip_id, err);
            return ApiError::internal().into_response();
        }
    }

    match trips::list_stays(&app.pg_pool, trip_id).await {
        Ok(stays) => match stays.into_iter().find(|s| s.id == stay_id) {
            Some(stay) => Json(stay).into_response(),
            None => ApiError::not_found("Not found").into_response(),
        },
        Err(err) => {
            tracing::error!("Error fetching trip {} stay {}: {}", trip_id, stay_id, err);
            ApiError::internal().into_response()
        }
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
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, token.user_id()).await {
        return res;
    }
    if let Some(res) = stay_input_error(body.lat, body.lon, body.arrival, body.departure) {
        return res;
    }

    match trips::create_stay(&app.pg_pool, trip_id, token.user_id(), &body).await {
        Ok(stay) => (StatusCode::CREATED, Json(stay)).into_response(),
        Err(err) => {
            tracing::error!("Error creating trip {} stay: {}", trip_id, err);
            ApiError::internal().into_response()
        }
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
    Json(body): Json<PatchTripStayRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, token.user_id()).await {
        return res;
    }
    if body.lat.is_some() != body.lon.is_some() {
        return ApiError::validation("location needs both lat and lon, or neither").into_response();
    }

    match trips::patch_stay(&app.pg_pool, trip_id, stay_id, &body).await {
        Ok(Some(stay)) => Json(stay).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(ref err) if constraint_message(err).is_some() => {
            ApiError::validation(constraint_message(err).unwrap()).into_response()
        }
        Err(err) => {
            tracing::error!("Error patching trip {} stay {}: {}", trip_id, stay_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(patch_stay_docs, op =>
    op.input::<Path<TripStayPath>>()
        .description("Update a stay. Any member may edit it, since the base moves while the trip runs.")
        .response::<200, Json<TripStay>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
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
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if let Some(res) = require_admin(&app, trip_id, token.user_id()).await {
        return res;
    }

    // A trip always has somewhere to hang its watch list, the way it always
    // keeps an admin.
    match trips::stay_count(&app.pg_pool, trip_id).await {
        Ok(1) => {
            return ApiError::validation("A trip must keep at least one stay").into_response();
        }
        Err(err) => {
            tracing::error!("Error counting trip {} stays: {}", trip_id, err);
            return ApiError::internal().into_response();
        }
        _ => {}
    }

    match trips::delete_stay(&app.pg_pool, trip_id, stay_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting trip {} stay {}: {}", trip_id, stay_id, err);
            ApiError::internal().into_response()
        }
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
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };
    if let Some(res) = require_member(&app, trip_id, token.user_id()).await {
        return res;
    }

    match trips::replace_stay_sections(&app.pg_pool, trip_id, stay_id, &body.sections).await {
        Ok(Some(sections)) => Json(sections).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(ref err) if crate::query::is_unique_violation(err) => {
            ApiError::validation("A section can appear once per stay, with one position")
                .into_response()
        }
        Err(err) => {
            tracing::error!(
                "Error replacing trip {} stay {} sections: {}",
                trip_id,
                stay_id,
                err
            );
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(replace_sections_docs, op =>
    op.input::<Path<TripStayPath>>()
        .description("Replace the ordered sections watched from a stay. The same section may be watched from several stays.")
        .response::<200, Json<Vec<TripSection>>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Trips")
);
