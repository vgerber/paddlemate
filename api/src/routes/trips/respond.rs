//! How a trips result becomes a response, in one place.
//!
//! The status a situation gets is part of the contract, so it is decided
//! here once rather than by each handler: a missing thing is 404, a stale
//! version 412, a refused rule or a bad input 400, anything else an opaque
//! 500 with the cause in the log.

use axum::{
    Json,
    http::{HeaderMap, HeaderValue, header},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::{error::ApiError, query::trips::Outcome};

const STALE: &str = "Changed by someone else since you opened it - reload and try again";

/// The version the caller last saw, from `If-Match`. The tag is the item's
/// `updated_at` exactly as the JSON carries it, quoted, so a client that has
/// the item - from a list as much as from a GET - already has its version.
/// No header, or `*`, means "write regardless".
pub(super) fn if_match(headers: &HeaderMap) -> Result<Option<DateTime<Utc>>, ApiError> {
    let Some(raw) = headers.get(header::IF_MATCH) else {
        return Ok(None);
    };
    let bad = || {
        ApiError::validation("If-Match must be the updated_at of the item being edited")
            .with_target("If-Match")
    };
    let raw = raw.to_str().map_err(|_| bad())?.trim();
    if raw == "*" {
        return Ok(None);
    }
    let tag = raw.strip_prefix("W/").unwrap_or(raw);
    let tag = tag
        .strip_prefix('"')
        .and_then(|t| t.strip_suffix('"'))
        .ok_or_else(bad)?;
    DateTime::parse_from_rfc3339(tag)
        .map(|t| Some(t.with_timezone(&Utc)))
        .map_err(|_| bad())
}

/// The body with its version in `ETag`, for anything a client may edit next.
pub(super) fn with_etag<T: Serialize>(
    status: axum::http::StatusCode,
    body: &T,
    updated_at: DateTime<Utc>,
) -> Response {
    let mut res = (status, Json(body)).into_response();
    // serde's own rendering, so the tag matches the JSON value byte for byte.
    if let Ok(tag) = serde_json::to_string(&updated_at) {
        if let Ok(value) = HeaderValue::from_str(&tag) {
            res.headers_mut().insert(header::ETAG, value);
        }
    }
    res
}

/// Every arm but `Done` has one answer for the whole feature.
pub(super) fn outcome<T>(result: Outcome<T>, done: impl FnOnce(T) -> Response) -> Response {
    match result {
        Outcome::Done(value) => done(value),
        Outcome::NotFound => ApiError::not_found("Not found").into_response(),
        Outcome::Stale => ApiError::precondition_failed(STALE).into_response(),
        Outcome::Refused(why) => ApiError::validation(why).into_response(),
    }
}

/// A database failure: a constraint the client broke becomes the 400 naming
/// the rule, anything else the opaque 500 with its cause logged.
pub(super) fn failure(context: &str, err: sqlx::Error) -> Response {
    match constraint_message(&err) {
        Some(message) => ApiError::validation(message).into_response(),
        None => ApiError::from_db(context, err).into_response(),
    }
}

/// The constraints a request can trip, each with the sentence for the rule
/// it broke, so a bad input answers 400 saying which rule rather than 500.
pub(super) fn constraint_message(err: &sqlx::Error) -> Option<&'static str> {
    let sqlx::Error::Database(db) = err else {
        return None;
    };
    match db.constraint()? {
        "chk_trip_dates" => Some("end_date must be on or after start_date"),
        "chk_trip_stay_dates" | "chk_trip_attendance_dates" | "chk_trip_candidate_dates" => {
            Some("departure must be on or after arrival")
        }
        "chk_trip_attendance_arrival_time" => Some("Set the day you arrive before the time"),
        "chk_trip_attendance_departure_time" => Some("Set the day you leave before the time"),
        "chk_trip_attendance_same_day" => {
            Some("Arriving and leaving the same day, but the times run backwards")
        }
        "trip_sections_section_id_fkey" => Some("That section does not exist"),
        "trip_sections_stay_id_section_id_key" => Some("A section can appear once per stay"),
        "trip_members_user_id_fkey" => Some("That user does not exist"),
        "trip_stay_candidate_votes_vote_check" => Some("vote must be 1 or -1"),
        _ => None,
    }
}
