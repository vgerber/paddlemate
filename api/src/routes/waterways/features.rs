use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    doc_fn,
    layers::auth::AuthToken,
    models::{
        feature::{Feature, FeatureType},
        geometry::Geometry,
        water_section::SectionId,
        waterway::WaterwayId,
    },
    state::AppState,
};

fn default_metadata() -> Value {
    Value::Object(serde_json::Map::new())
}

#[derive(Deserialize, JsonSchema)]
pub struct CreateFeatureBody {
    pub feature_type: FeatureType,
    #[serde(default = "default_metadata")]
    pub metadata: Value,
    pub location: Geometry,
}

pub async fn create_feature(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
    Json(body): Json<CreateFeatureBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    // Verify the section belongs to the given waterway
    let section_exists = sqlx::query!(
        "SELECT id FROM water_sections WHERE id = $1 AND waterway_id = $2",
        section_id,
        waterway_id
    )
    .fetch_optional(&app.pg_pool)
    .await;

    if !matches!(section_exists, Ok(Some(_))) {
        return StatusCode::NOT_FOUND.into_response();
    }

    let location_json = serde_json::to_string(&body.location).expect("valid geometry");

    let result = sqlx::query!(
        r#"
        INSERT INTO features (section_id, feature_type, metadata, location, created_by)
        VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4), $5)
        RETURNING id, section_id, feature_type AS "feature_type: FeatureType",
                  metadata, created_by, ST_AsGeoJSON(location) AS location, created_at, updated_at
        "#,
        section_id,
        body.feature_type as FeatureType,
        body.metadata,
        location_json,
        token.user_id()
    )
    .fetch_one(&app.pg_pool)
    .await;

    match result {
        Ok(r) => (
            StatusCode::CREATED,
            Json(Feature {
                id: r.id,
                section_id: r.section_id,
                feature_type: r.feature_type,
                metadata: r.metadata,
                created_by: r.created_by,
                location: serde_json::from_str::<Geometry>(&r.location.expect("location NOT NULL"))
                    .expect("valid GeoJSON"),
                created_at: r.created_at,
                updated_at: r.updated_at,
            }),
        )
            .into_response(),
        Err(err) => {
            tracing::error!("Error creating feature: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(create_feature_docs, op =>
    op.description("Add a feature to a section")
        .response_with::<201, Json<Feature>, _>(|res| res.description("Feature created"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Section not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpdateFeatureBody {
    pub feature_type: Option<FeatureType>,
    pub metadata: Option<Value>,
    pub location: Option<Geometry>,
}

pub async fn update_feature(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id, feature_id)): Path<(WaterwayId, SectionId, i64)>,
    Json(body): Json<UpdateFeatureBody>,
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
        UPDATE features
        SET
            feature_type = COALESCE($1, feature_type),
            metadata = COALESCE($2, metadata),
            location = COALESCE(ST_GeomFromGeoJSON($3), location),
            updated_at = NOW()
        WHERE id = $4 AND section_id = $5
          AND $5 IN (SELECT id FROM water_sections WHERE waterway_id = $6)
        RETURNING id, section_id, feature_type AS "feature_type: FeatureType",
                  metadata, created_by, ST_AsGeoJSON(location) AS location, created_at, updated_at
        "#,
        body.feature_type as Option<FeatureType>,
        body.metadata,
        location_json,
        feature_id,
        section_id,
        waterway_id
    )
    .fetch_optional(&app.pg_pool)
    .await;

    match result {
        Ok(Some(r)) => Json(Feature {
            id: r.id,
            section_id: r.section_id,
            feature_type: r.feature_type,
            metadata: r.metadata,
            created_by: r.created_by,
            location: serde_json::from_str::<Geometry>(&r.location.expect("location NOT NULL"))
                .expect("valid GeoJSON"),
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error updating feature {}: {}", feature_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(update_feature_docs, op =>
    op.description("Update a feature")
        .response::<200, Json<Feature>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Feature not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);

pub async fn delete_feature(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id, feature_id)): Path<(WaterwayId, SectionId, i64)>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    let result = sqlx::query!(
        r#"
        DELETE FROM features
        WHERE id = $1 AND section_id = $2
          AND $2 IN (SELECT id FROM water_sections WHERE waterway_id = $3)
        RETURNING id
        "#,
        feature_id,
        section_id,
        waterway_id
    )
    .fetch_optional(&app.pg_pool)
    .await;

    match result {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error deleting feature {}: {}", feature_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(delete_feature_docs, op =>
    op.description("Delete a feature")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Feature not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);

// Aide requires serializable types to generate request body schemas.
// These mirror the request body structs above.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct CreateFeatureBodyDoc {
    feature_type: FeatureType,
    metadata: Value,
    location: Geometry,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct UpdateFeatureBodyDoc {
    feature_type: Option<FeatureType>,
    metadata: Option<Value>,
    location: Option<Geometry>,
}
