//! Who may do what to a trip, in one place.
//!
//! Every route under `/trips` starts with the same two questions - is there a
//! caller, and are they in this trip - and the answers have to be identical
//! everywhere: a non-member must get 404 rather than 403, because the
//! existence of somebody's private trip is itself private.

use axum::{Extension, response::IntoResponse, response::Response};

use crate::{
    error::ApiError, layers::auth::AuthToken, models::trip::TripId, models::trip::TripMemberRole,
    query::trips, state::AppState,
};

/// The caller, or the error to answer instead. Every handler opens with this,
/// so the unauthenticated case reads the same way in all of them.
pub(super) fn caller(auth: Option<Extension<AuthToken>>) -> Result<String, ApiError> {
    match auth {
        Some(Extension(token)) => Ok(token.user_id().to_string()),
        None => Err(ApiError::unauthorized("Authentication required")),
    }
}

/// Reading or shaping a trip is open to everyone in it: the itinerary moves
/// while the trip runs, and whoever finds the next camp should be able to
/// record it. A non-member gets 404, not 403.
pub(super) async fn require_member(
    app: &AppState,
    trip_id: TripId,
    user_id: &str,
) -> Option<Response> {
    match trips::member_role(&app.pg_pool, trip_id, user_id).await {
        Ok(Some(_)) => None,
        Ok(None) => Some(ApiError::not_found("Not found").into_response()),
        Err(err) => Some(
            ApiError::from_db(&format!("checking trip {trip_id} membership"), err).into_response(),
        ),
    }
}

/// Changing what the trip *is* - its name, who is on it, which bases it has -
/// is an admin's. A member who is not an admin gets 403: they can see the
/// trip, so hiding it now would be a lie.
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
            Some(ApiError::from_db(&format!("checking trip {trip_id} role"), err).into_response())
        }
    }
}
