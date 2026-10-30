use std::collections::HashMap;

use aide::axum::IntoApiResponse;
use axum::{
    Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    models::{gauge::SectionWaterStatus, id_list::parse_id_list, path_params::SectionPath},
    query::gauges,
    state::AppState,
};

pub async fn get_section_water_status(
    State(app): State<AppState>,
    Path(path): Path<SectionPath>,
) -> impl IntoApiResponse {
    match gauges::water_status_for_section(&app.pg_pool, path.section_id).await {
        Ok(status) => Json(status).into_response(),
        Err(err) => ApiError::from_db(
            &format!(
                "Error fetching water status for section {}",
                path.section_id
            ),
            err,
        )
        .into_response(),
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

#[derive(Deserialize, JsonSchema)]
pub struct WaterStatusBatchQuery {
    /// Comma separated section ids, at most 100.
    pub section_ids: String,
}

pub async fn get_water_statuses(
    State(app): State<AppState>,
    Query(query): Query<WaterStatusBatchQuery>,
) -> impl IntoApiResponse {
    let ids = match parse_id_list(&query.section_ids, "section_ids") {
        Ok(ids) => ids,
        Err(err) => return err.into_response(),
    };
    match gauges::water_status_for_sections(&app.pg_pool, &ids).await {
        Ok(statuses) => Json(statuses).into_response(),
        Err(err) => ApiError::from_db("Error fetching water statuses", err).into_response(),
    }
}

doc_fn!(get_water_statuses_docs, op =>
    op.input::<Query<WaterStatusBatchQuery>>()
        .description(
            "Water status of up to 100 sections in one call, keyed by section id. \
             Each value is what the single-section route returns; a section without \
             ranges, or one that does not exist, has an empty `ranges`."
        )
        .response::<200, Json<HashMap<i64, SectionWaterStatus>>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Missing, malformed or more than 100 ids"))
        .tag("Waterways")
);
