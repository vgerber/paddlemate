use aide::axum::{ApiRouter, IntoApiResponse, routing::get_with};
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
        descent::{CreateDescentRequest, Descent, ListDescentsQuery, PatchDescentRequest},
        path_params::DescentPath,
        visibility::Visibility,
        waterway::PaginatedResponse,
    },
    query::{descents, trips},
    state::AppState,
};

pub fn descents_routes(state: AppState) -> ApiRouter {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_descents, list_descents_docs)
                .post_with(create_descent, create_descent_docs),
        )
        .api_route(
            "/{descent_id}",
            get_with(get_descent, get_descent_docs)
                .patch_with(patch_descent, patch_descent_docs)
                .delete_with(delete_descent, delete_descent_docs),
        )
        .with_state(state)
}

fn validate_put_in(feature_id: Option<i64>, lat: Option<f64>, lon: Option<f64>) -> bool {
    matches!(
        (feature_id.is_some(), lat.is_some(), lon.is_some()),
        (true, false, false) | (false, true, true)
    )
}

/// Turn the constraint violations a client can actually cause into validation
/// errors. Returns None for anything else, which stays an internal error.
fn db_constraint_response(err: &sqlx::Error) -> Option<axum::response::Response> {
    use axum::response::IntoResponse;
    if let sqlx::Error::Database(db_err) = err {
        match db_err.code().as_deref() {
            // CHECK constraint violation
            Some("23514") => {
                return Some(
                    ApiError::validation(
                        db_err
                            .constraint()
                            .map(constraint_message)
                            .unwrap_or("Constraint violation"),
                    )
                    .into_response(),
                );
            }
            // Foreign key violation - invalid section_id, feature_id, user_id, or group_id
            Some("23503") => {
                return Some(
                    ApiError::validation("Referenced resource does not exist").into_response(),
                );
            }
            _ => {}
        }
    }
    None
}

fn constraint_message(name: &str) -> &'static str {
    match name {
        "chk_descent_times" => "end_time must be on or after start_time",
        "chk_descent_put_in" => {
            "put_in must specify either feature_id or lat+lon, not both or neither"
        }
        "chk_descent_take_out" => {
            "take_out must specify either feature_id or lat+lon, not both or neither"
        }
        _ => "Constraint violation",
    }
}

/// Linking a log to a trip is a claim on that trip, so the caller must be in
/// it. Unlinking (`trip_id: null`) needs no check beyond owning the descent.
async fn trip_link_error(app: &AppState, trip_id: Option<i64>, user_id: &str) -> Option<Response> {
    let trip_id = trip_id?;
    match trips::member_role(&app.pg_pool, trip_id, user_id).await {
        Ok(Some(_)) => None,
        Ok(None) => Some(ApiError::forbidden("Not a member of that trip").into_response()),
        Err(err) => {
            tracing::error!("Error checking trip {} membership: {}", trip_id, err);
            Some(ApiError::internal().into_response())
        }
    }
}

pub async fn list_descents(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Query(q): Query<ListDescentsQuery>,
) -> impl IntoApiResponse {
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    // scope=owned and scope=following both require authentication
    if matches!(q.scope.as_deref(), Some("owned") | Some("following")) && viewer_id.is_none() {
        return ApiError::unauthorized("Authentication required").into_response();
    }

    let page = q.page.unwrap_or(1).max(1);
    let per_page = q.per_page.unwrap_or(25).clamp(1, 100);

    let filters = descents::ListFilters {
        scope: q.scope.as_deref(),
        visibility: q.visibility.as_deref(),
        from: q.from,
        to: q.to,
        section_id: q.section_id,
        user_id: q.user_id.as_deref(),
        trip_id: q.trip_id,
        page,
        per_page,
    };

    match descents::list_descents_for_viewer(&app.pg_pool, viewer_id.as_deref(), filters).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing descents: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_descents_docs, op =>
    op.input::<Query<ListDescentsQuery>>()
        .description("List descents visible to the current viewer. user_id narrows to one paddler's logs, within what the viewer may see. trip_id narrows to one trip, and a member of it sees every log in that trip, private ones included.")
        .response::<200, Json<PaginatedResponse<Descent>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized (scope=owned requires auth)"))
        .tag("Descents")
);

pub async fn create_descent(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(body): Json<CreateDescentRequest>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

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
        Ok(d) => (StatusCode::CREATED, Json(d)).into_response(),
        Err(ref err) if db_constraint_response(err).is_some() => {
            db_constraint_response(err).unwrap()
        }
        Err(err) => {
            tracing::error!("Error creating descent: {}", err);
            ApiError::internal().into_response()
        }
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

pub async fn get_descent(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(DescentPath { descent_id }): Path<DescentPath>,
) -> impl IntoApiResponse {
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    match descents::get_descent_for_viewer(&app.pg_pool, descent_id, viewer_id.as_deref()).await {
        Ok(Some(d)) => Json(d).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error fetching descent {}: {}", descent_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_descent_docs, op =>
    op.input::<Path<DescentPath>>()
        .description("Get a descent by ID")
        .response::<200, Json<Descent>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Not found or not visible"))
        .tag("Descents")
);

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

    match descents::patch_descent(&app.pg_pool, descent_id, token.user_id(), &body).await {
        Ok(Some(d)) => Json(d).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(ref err) if db_constraint_response(err).is_some() => {
            db_constraint_response(err).unwrap()
        }
        Err(err) => {
            tracing::error!("Error patching descent {}: {}", descent_id, err);
            ApiError::internal().into_response()
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
            tracing::error!("Error deleting descent {}: {}", descent_id, err);
            ApiError::internal().into_response()
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

#[cfg(test)]
mod tests {
    use super::{constraint_message, validate_put_in};

    #[test]
    fn a_point_is_either_a_feature_or_coordinates() {
        assert!(validate_put_in(Some(1), None, None));
        assert!(validate_put_in(None, Some(47.0), Some(11.0)));
    }

    #[test]
    fn a_point_is_never_both_partial_nor_empty() {
        assert!(!validate_put_in(None, None, None), "nothing given");
        assert!(
            !validate_put_in(Some(1), Some(47.0), Some(11.0)),
            "both given"
        );
        assert!(!validate_put_in(None, Some(47.0), None), "latitude only");
        assert!(!validate_put_in(None, None, Some(11.0)), "longitude only");
    }

    #[test]
    fn known_constraints_explain_themselves() {
        assert!(constraint_message("chk_descent_times").contains("start_time"));
        assert!(constraint_message("chk_descent_put_in").contains("put_in"));
        assert_eq!(constraint_message("something_else"), "Constraint violation");
    }
}
