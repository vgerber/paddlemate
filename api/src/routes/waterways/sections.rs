use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    doc_fn,
    layers::auth::AuthToken,
    models::{
        feature::Feature,
        geometry::Geometry,
        water_section::{Section, SectionId, SectionWithFeatures},
        waterway::WaterwayId,
    },
    query::features,
    state::AppState,
};

pub async fn get_section(
    State(app): State<AppState>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
) -> impl IntoApiResponse {
    let section = sqlx::query!(
        r#"
        SELECT id, waterway_id, name, description, ST_AsGeoJSON(location) AS location, created_at, updated_at
        FROM water_sections WHERE id = $1 AND waterway_id = $2
        "#,
        section_id,
        waterway_id
    )
    .fetch_optional(&app.pg_pool)
    .await;

    let section = match section {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error fetching section {}: {}", section_id, err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let features = features::fetch_features_for_section(&app.pg_pool, section_id).await;

    match features {
        Ok(features) => {
            let features: Vec<Feature> = features;
            Json(SectionWithFeatures {
                id: section.id,
                waterway_id: section.waterway_id,
                name: section.name,
                description: section.description,
                location: serde_json::from_str(&section.location.expect("location NOT NULL"))
                    .expect("valid GeoJSON"),
                features,
                created_at: section.created_at,
                updated_at: section.updated_at,
            })
            .into_response()
        }
        Err(err) => {
            tracing::error!(
                "Error fetching features for section {}: {}",
                section_id,
                err
            );
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(get_section_docs, op =>
    op.description("Get a section with its features")
        .response::<200, Json<SectionWithFeatures>>()
        .response_with::<404, (), _>(|res| res.description("Section not found"))
        .tag("Sections")
);

#[derive(Deserialize, JsonSchema)]
pub struct CreateSectionBody {
    pub name: String,
    pub description: Option<String>,
    pub location: Geometry,
}

pub async fn create_section(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(waterway_id): Path<WaterwayId>,
    Json(body): Json<CreateSectionBody>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    let location_json = serde_json::to_string(&body.location).expect("valid geometry");

    let result = sqlx::query!(
        r#"
        INSERT INTO water_sections (waterway_id, name, description, location)
        VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4))
        RETURNING id, waterway_id, name, description, ST_AsGeoJSON(location) AS location, created_at, updated_at
        "#,
        waterway_id,
        body.name,
        body.description,
        location_json
    )
    .fetch_one(&app.pg_pool)
    .await;

    match result {
        Ok(r) => (
            StatusCode::CREATED,
            Json(Section {
                id: r.id,
                waterway_id: r.waterway_id,
                name: r.name,
                description: r.description,
                location: serde_json::from_str(&r.location.expect("location NOT NULL"))
                    .expect("valid GeoJSON"),
                created_at: r.created_at,
                updated_at: r.updated_at,
            }),
        )
            .into_response(),
        Err(err) => {
            tracing::error!("Error creating section: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(create_section_docs, op =>
    op.description("Create a new section for a river")
        .response_with::<201, Json<Section>, _>(|res| res.description("Section created"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpdateSectionBody {
    pub name: Option<String>,
    pub description: Option<String>,
    pub location: Option<Geometry>,
}

pub async fn update_section(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
    Json(body): Json<UpdateSectionBody>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    let location_json = body
        .location
        .as_ref()
        .map(|g| serde_json::to_string(g).expect("valid geometry"));

    let result = sqlx::query!(
        r#"
        UPDATE water_sections
        SET
            name = COALESCE($1, name),
            description = COALESCE($2, description),
            location = COALESCE(ST_GeomFromGeoJSON($3), location),
            updated_at = NOW()
        WHERE id = $4 AND waterway_id = $5
        RETURNING id, waterway_id, name, description, ST_AsGeoJSON(location) AS location, created_at, updated_at
        "#,
        body.name,
        body.description,
        location_json,
        section_id,
        waterway_id
    )
    .fetch_optional(&app.pg_pool)
    .await;

    match result {
        Ok(Some(r)) => Json(Section {
            id: r.id,
            waterway_id: r.waterway_id,
            name: r.name,
            description: r.description,
            location: serde_json::from_str(&r.location.expect("location NOT NULL"))
                .expect("valid GeoJSON"),
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error updating section {}: {}", section_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(update_section_docs, op =>
    op.description("Update a section")
        .response::<200, Json<Section>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Section not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);

pub async fn delete_section(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    let result = sqlx::query!(
        "DELETE FROM water_sections WHERE id = $1 AND waterway_id = $2 RETURNING id",
        section_id,
        waterway_id
    )
    .fetch_optional(&app.pg_pool)
    .await;

    match result {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error deleting section {}: {}", section_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(delete_section_docs, op =>
    op.description("Delete a section and all its features")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Section not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);

// Aide requires serializable types to generate request body schemas.
// These mirror the request body structs above.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct CreateSectionBodyDoc {
    name: String,
    description: Option<String>,
    location: Geometry,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct UpdateSectionBodyDoc {
    name: Option<String>,
    description: Option<String>,
    location: Option<Geometry>,
}
