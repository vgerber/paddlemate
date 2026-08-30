use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{UserPath, resolve_self};
use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        feature::Feature, geometry::Geometry, water_section::SectionId, waterway::WaterwayId,
    },
    query::{favorites, features},
    state::AppState,
};

/// A favorited section, including its parent waterway name and full feature list.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct FavoriteSectionResponse {
    pub id: SectionId,
    pub waterway_id: WaterwayId,
    pub waterway_name: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Region names, most specific first (valley, district, state, range).
    pub regions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    /// GeoJSON LineString geometry
    pub location: Geometry,
    pub features: Vec<Feature>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Deserialize, JsonSchema)]
pub struct SectionFavoritePath {
    /// Whose starred sections are edited; only "me" (or the caller's own id).
    user_id: String,
    section_id: SectionId,
}

pub async fn list_favorites(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<UserPath>,
) -> impl IntoApiResponse {
    let user_id = match resolve_self(&path.user_id, token.user_id()) {
        Ok(id) => id,
        Err(response) => return response,
    };

    let metas = match favorites::list_section_favorites(&app.pg_pool, user_id).await {
        Ok(rows) => rows,
        Err(err) => {
            tracing::error!("Error listing favorites: {}", err);
            return ApiError::internal().into_response();
        }
    };

    let mut result = Vec::with_capacity(metas.len());
    for meta in metas {
        let section_features =
            match features::fetch_features_for_section(&app.pg_pool, meta.id).await {
                Ok(f) => f,
                Err(err) => {
                    tracing::error!("Error fetching features for section {}: {}", meta.id, err);
                    return ApiError::internal().into_response();
                }
            };
        result.push(FavoriteSectionResponse {
            id: meta.id,
            waterway_id: meta.waterway_id,
            waterway_name: meta.waterway_name,
            name: meta.name,
            description: meta.description,
            regions: meta.regions,
            country: meta.country,
            location: meta.location,
            features: section_features,
            created_at: meta.created_at,
            updated_at: meta.updated_at,
        });
    }

    Json(result).into_response()
}

doc_fn!(list_favorites_docs, op =>
    op.description("List the sections a user has starred. Only \"me\" is readable.")
        .response::<200, Json<Vec<FavoriteSectionResponse>>>()
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Not permitted"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Favorites")
);

pub async fn add_favorite(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<SectionFavoritePath>,
) -> impl IntoApiResponse {
    let user_id = match resolve_self(&path.user_id, token.user_id()) {
        Ok(id) => id,
        Err(response) => return response,
    };

    match favorites::add_section_favorite(&app.pg_pool, user_id, path.section_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            let msg = err.to_string();
            if msg.contains("foreign key") {
                return ApiError::not_found("Not found").into_response();
            }
            tracing::error!("Error adding favorite: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(add_favorite_docs, op =>
    op.description("Star a section. Only the caller's own list is writable.")
        .response_with::<204, (), _>(|res| res.description("Starred successfully"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Not permitted"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Section not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Favorites")
);

pub async fn remove_favorite(
    State(app): State<AppState>,
    Extension(token): Extension<AuthToken>,
    Path(path): Path<SectionFavoritePath>,
) -> impl IntoApiResponse {
    let user_id = match resolve_self(&path.user_id, token.user_id()) {
        Ok(id) => id,
        Err(response) => return response,
    };

    match favorites::remove_section_favorite(&app.pg_pool, user_id, path.section_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!("Error removing favorite: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(remove_favorite_docs, op =>
    op.description("Unstar a section. Only the caller's own list is writable.")
        .response_with::<204, (), _>(|res| res.description("Unstarred successfully"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Not permitted"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Favorites")
);
