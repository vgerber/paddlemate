use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        osm_geometry::{OsmElementKind, WaterwayOsmGeometry},
        path_params::WaterwayPath,
    },
    query::osm_geometry,
    state::AppState,
};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct OsmGeometryQuery {
    /// Element kind filter: "centerline" or "bank". Omitted = all kinds.
    pub kind: Option<String>,
}

pub async fn get_osm_geometry(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
    Query(query): Query<OsmGeometryQuery>,
) -> impl IntoApiResponse {
    let kind = match query.kind.as_deref() {
        None => None,
        Some(raw) => match OsmElementKind::parse(raw) {
            Some(kind) => Some(kind),
            None => {
                return ApiError::validation("kind must be 'centerline' or 'bank'")
                    .with_target("kind")
                    .into_response();
            }
        },
    };
    match osm_geometry::fetch_elements(&app.pg_pool, waterway_id, kind).await {
        Ok(Some(doc)) => Json(doc).into_response(),
        Ok(None) => ApiError::not_found("No cached OSM geometry").into_response(),
        Err(err) => {
            tracing::error!("Error fetching OSM geometry for {}: {}", waterway_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_osm_geometry_docs, op =>
    op.description("Cached OSM elements of a waterway (centerline way fragments, later bank areas). 404 when nothing is cached - the client should fall back to a live Overpass query.")
        .response::<200, Json<WaterwayOsmGeometry>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Nothing cached"))
        .tag("Waterways")
);

pub async fn delete_osm_geometry(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
) -> impl IntoApiResponse {
    let Some(Extension(token)) = auth else {
        return ApiError::unauthorized("Authentication required").into_response();
    };
    if !token.is_server_admin() {
        return ApiError::forbidden("Admin access required").into_response();
    }
    match osm_geometry::delete_elements(&app.pg_pool, waterway_id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!("Error deleting OSM geometry for {}: {}", waterway_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_osm_geometry_docs, op =>
    op.description("Invalidate a waterway's cached OSM geometry (admin only); the next backfill run re-fetches it")
        .response_with::<204, (), _>(|res| res.description("Cache dropped"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Waterways")
);
