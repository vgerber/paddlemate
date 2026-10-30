use axum::response::{IntoResponse, Response};

use crate::{
    error::ApiError,
    models::{
        descent::Descent,
        notification::{EventSummary, TripEventKind},
    },
    notify,
    query::trips,
    state::AppState,
};

/// Tells the trip a log was credited to it, named as people call the run:
/// its own name, else the river, else the section.
pub(super) async fn announce_log(app: &AppState, d: &Descent, user_id: &str) {
    let Some(trip_id) = d.trip_id else { return };
    let name = d.name.clone().or_else(|| {
        d.sections
            .first()
            .and_then(|s| s.waterway_name.clone().or_else(|| s.section_name.clone()))
    });
    let summary = EventSummary {
        name,
        ..Default::default()
    };
    notify::record(app, trip_id, user_id, TripEventKind::LogLinked, summary).await;
}

/// Linking a log to a trip is a claim on that trip, so the caller must be in
/// it. Unlinking (`trip_id: null`) needs no check beyond owning the descent.
pub(super) async fn trip_link_error(
    app: &AppState,
    trip_id: Option<i64>,
    user_id: &str,
) -> Option<Response> {
    let trip_id = trip_id?;
    match trips::member_role(&app.pg_pool, trip_id, user_id).await {
        Ok(Some(_)) => None,
        Ok(None) => Some(ApiError::forbidden("Not a member of that trip").into_response()),
        Err(err) => Some(
            ApiError::from_db(&format!("Error checking trip {trip_id} membership"), err)
                .into_response(),
        ),
    }
}
