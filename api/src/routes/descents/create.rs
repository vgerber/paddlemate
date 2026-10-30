use aide::axum::IntoApiResponse;
use axum::{Extension, Json, extract::State, http::StatusCode, response::IntoResponse};

use super::{errors::*, trip_link::*, validate::*};
use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        descent::{CreateDescentRequest, Descent},
        visibility::Visibility,
    },
    query::descents,
    routes::access,
    state::AppState,
};

pub async fn create_descent(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(body): Json<CreateDescentRequest>,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };

    if let Err(err) = check_fields(
        body.name.as_deref(),
        body.note.as_deref(),
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

    if let Err(err) = check_section_order(&body.sections) {
        return err.into_response();
    }

    if !validate_put_in(body.put_in_feature_id, body.put_in_lat, body.put_in_lon) {
        return ApiError::validation(
            "put_in must specify either feature_id or lat+lon, not both or neither",
        )
        .into_response();
    }

    if !validate_put_in(
        body.take_out_feature_id,
        body.take_out_lat,
        body.take_out_lon,
    ) {
        return ApiError::validation(
            "take_out must specify either feature_id or lat+lon, not both or neither",
        )
        .into_response();
    }

    if body.end_time < body.start_time {
        return ApiError::validation("end_time must be on or after start_time").into_response();
    }

    if let Visibility::Shared {
        ref users,
        ref groups,
    } = body.visibility
    {
        if users.is_empty() && groups.is_empty() {
            return ApiError::validation("shared visibility requires at least one user or group")
                .into_response();
        }
    }

    if let Some(res) = trip_link_error(&app, body.trip_id, token.user_id()).await {
        return res;
    }

    match descents::create_descent(&app.pg_pool, token.user_id(), &body).await {
        Ok(d) => {
            announce_log(&app, &d, token.user_id()).await;
            (StatusCode::CREATED, Json(d)).into_response()
        }
        Err(ref err) if db_constraint_response(err).is_some() => {
            db_constraint_response(err).unwrap()
        }
        Err(err) => ApiError::from_db("Error creating descent", err).into_response(),
    }
}

doc_fn!(create_descent_docs, op =>
    op.description("Log a new descent")
        .response_with::<201, Json<Descent>, _>(|res| res.description("Descent created"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Validation error"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Descents")
);
