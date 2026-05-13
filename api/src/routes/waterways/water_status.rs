use aide::axum::IntoApiResponse;
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};

use crate::{
    doc_fn,
    models::{gauge::SectionWaterStatus, path_params::SectionPath},
    query::gauges,
    state::AppState,
};

pub async fn get_section_water_status(
    State(app): State<AppState>,
    Path(path): Path<SectionPath>,
) -> impl IntoApiResponse {
    match gauges::water_status_for_section(&app.pg_pool, path.section_id).await {
        Ok(status) => Json(status).into_response(),
        Err(err) => {
            tracing::error!(
                "Error fetching water status for section {}: {}",
                path.section_id,
                err
            );
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(get_section_water_status_docs, op =>
    op.description(
        "Returns all water-level ranges attached to features in the section, \
         each with the gauge metadata and its most recent reading. \
         Ranges without a reading (gauge not yet polled) will have `latest_reading: null`."
    )
    .response::<200, Json<SectionWaterStatus>>()
    .tag("Waterways")
);
