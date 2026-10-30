use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        descent::{Descent, ListDescentsQuery},
        page::{PaginatedResponse, page_bounds},
        path_params::DescentPath,
    },
    query::descents,
    routes::access,
    state::AppState,
};

pub async fn list_descents(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Query(q): Query<ListDescentsQuery>,
) -> impl IntoApiResponse {
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());

    // scope=owned and scope=following both require authentication
    if matches!(q.scope.as_deref(), Some("owned") | Some("following")) && viewer_id.is_none() {
        return access::unauthenticated().into_response();
    }

    let (page, per_page) = page_bounds(q.page, q.per_page, 25);

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
        Err(err) => ApiError::from_db("Error listing descents", err).into_response(),
    }
}

doc_fn!(list_descents_docs, op =>
    op.input::<Query<ListDescentsQuery>>()
        .description("List descents visible to the current viewer. user_id narrows to one paddler's logs, within what the viewer may see. trip_id narrows to one trip, and a member of it sees every log in that trip, private ones included.")
        .response::<200, Json<PaginatedResponse<Descent>>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized (scope=owned requires auth)"))
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
            ApiError::from_db(&format!("Error fetching descent {descent_id}"), err).into_response()
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
