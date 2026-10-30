use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};

use super::{errors::*, trip_link::*, validate::*};
use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        descent::{Descent, PatchDescentRequest},
        path_params::DescentPath,
        visibility::Visibility,
    },
    query::descents,
    state::AppState,
};

pub async fn patch_descent(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(DescentPath { descent_id }): Path<DescentPath>,
    Json(body): Json<PatchDescentRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    if let Some(Visibility::Shared {
        ref users,
        ref groups,
    }) = body.visibility
    {
        if users.is_empty() && groups.is_empty() {
            return ApiError::validation("shared visibility requires at least one user or group")
                .into_response();
        }
    }

    if let Err(err) = check_fields(
        body.name.as_ref().and_then(|n| n.as_deref()),
        body.note.as_ref().and_then(|n| n.as_deref()),
        (
            body.put_in_label.as_deref(),
            body.put_in_lat,
            body.put_in_lon,
        ),
        (
            body.take_out_label.as_deref(),
            body.take_out_lat,
            body.take_out_lon,
        ),
    ) {
        return err.into_response();
    }

    if let Some(err) = body
        .sections
        .as_deref()
        .and_then(|s| check_section_order(s).err())
    {
        return err.into_response();
    }

    let update_put_in = body.put_in_feature_id.is_some()
        || body.put_in_lat.is_some()
        || body.put_in_lon.is_some()
        || body.put_in_label.is_some();
    if update_put_in && !validate_put_in(body.put_in_feature_id, body.put_in_lat, body.put_in_lon) {
        return ApiError::validation(
            "put_in must specify either feature_id or lat+lon, not both or neither",
        )
        .into_response();
    }

    let update_take_out = body.take_out_feature_id.is_some()
        || body.take_out_lat.is_some()
        || body.take_out_lon.is_some()
        || body.take_out_label.is_some();
    if update_take_out
        && !validate_put_in(
            body.take_out_feature_id,
            body.take_out_lat,
            body.take_out_lon,
        )
    {
        return ApiError::validation(
            "take_out must specify either feature_id or lat+lon, not both or neither",
        )
        .into_response();
    }

    if let (Some(start), Some(end)) = (body.start_time, body.end_time) {
        if end < start {
            return ApiError::validation("end_time must be on or after start_time").into_response();
        }
    }

    if let Some(res) = trip_link_error(&app, body.trip_id.flatten(), token.user_id()).await {
        return res;
    }

    // Where it was linked before, so re-sending the same trip on an ordinary
    // edit is not announced as a new log every time.
    let linked_before = match body.trip_id {
        Some(Some(_)) => {
            descents::get_descent_for_viewer(&app.pg_pool, descent_id, Some(token.user_id()))
                .await
                .ok()
                .flatten()
                .and_then(|d| d.trip_id)
        }
        _ => None,
    };

    match descents::patch_descent(&app.pg_pool, descent_id, token.user_id(), &body).await {
        Ok(Some(d)) => {
            let linked_now = matches!(body.trip_id, Some(Some(_)));
            if linked_now && d.trip_id != linked_before {
                announce_log(&app, &d, token.user_id()).await;
            }
            Json(d).into_response()
        }
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(ref err) if db_constraint_response(err).is_some() => {
            db_constraint_response(err).unwrap()
        }
        Err(err) => {
            ApiError::from_db(&format!("Error patching descent {descent_id}"), err).into_response()
        }
    }
}

doc_fn!(patch_descent_docs, op =>
    op.input::<Path<DescentPath>>()
        .description("Partially update a descent (owner only)")
        .response::<200, Json<Descent>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not the owner"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Descents")
);

pub async fn delete_descent(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(DescentPath { descent_id }): Path<DescentPath>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match descents::delete_descent(&app.pg_pool, descent_id, token.user_id()).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            ApiError::from_db(&format!("Error deleting descent {descent_id}"), err).into_response()
        }
    }
}

doc_fn!(delete_descent_docs, op =>
    op.input::<Path<DescentPath>>()
        .description("Delete a descent (owner only)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not the owner"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Descents")
);
