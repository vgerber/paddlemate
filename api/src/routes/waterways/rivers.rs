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
        water_section::Section,
        waterway::{Waterway, WaterwayId, WaterwayType, WaterwayWithSections},
    },
    state::AppState,
};

pub async fn list_rivers(State(app): State<AppState>) -> impl IntoApiResponse {
    let result = sqlx::query!(
        r#"SELECT id, waterway_type AS "waterway_type: WaterwayType", name, description, created_at, updated_at FROM waterways ORDER BY name"#
    )
    .fetch_all(&app.pg_pool)
    .await;

    match result {
        Ok(records) => {
            let waterways: Vec<Waterway> = records
                .into_iter()
                .map(|r| Waterway {
                    id: r.id,
                    waterway_type: r.waterway_type,
                    name: r.name,
                    description: r.description,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                })
                .collect();
            Json(waterways).into_response()
        }
        Err(err) => {
            tracing::error!("Error listing waterways: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_rivers_docs, op =>
    op.description("List all rivers")
        .response::<200, Json<Vec<Waterway>>>()
        .tag("Rivers")
);

pub async fn get_river(
    State(app): State<AppState>,
    Path(waterway_id): Path<WaterwayId>,
) -> impl IntoApiResponse {
    let waterway = sqlx::query!(
        r#"SELECT id, waterway_type AS "waterway_type: WaterwayType", name, description, created_at, updated_at FROM waterways WHERE id = $1"#,
        waterway_id
    )
    .fetch_optional(&app.pg_pool)
    .await;

    let waterway = match waterway {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error fetching waterway {}: {}", waterway_id, err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let sections = sqlx::query!(
        r#"
        SELECT id, waterway_id, name, description, ST_AsGeoJSON(location) AS location, created_at, updated_at
        FROM water_sections WHERE waterway_id = $1 ORDER BY name
        "#,
        waterway_id
    )
    .fetch_all(&app.pg_pool)
    .await;

    match sections {
        Ok(records) => {
            let sections: Vec<Section> = records
                .into_iter()
                .map(|s| Section {
                    id: s.id,
                    waterway_id: s.waterway_id,
                    name: s.name,
                    description: s.description,
                    location: serde_json::from_str(&s.location.expect("location NOT NULL"))
                        .expect("valid GeoJSON"),
                    created_at: s.created_at,
                    updated_at: s.updated_at,
                })
                .collect();
            Json(WaterwayWithSections {
                id: waterway.id,
                waterway_type: waterway.waterway_type,
                name: waterway.name,
                description: waterway.description,
                sections,
                created_at: waterway.created_at,
                updated_at: waterway.updated_at,
            })
            .into_response()
        }
        Err(err) => {
            tracing::error!("Error fetching sections for waterway {}: {}", waterway_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(get_river_docs, op =>
    op.description("Get a river with its sections")
        .response::<200, Json<WaterwayWithSections>>()
        .response_with::<404, (), _>(|res| res.description("River not found"))
        .tag("Rivers")
);

#[derive(Deserialize, JsonSchema)]
pub struct CreateRiverBody {
    pub name: String,
    pub description: Option<String>,
}

pub async fn create_river(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(body): Json<CreateRiverBody>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    let result = sqlx::query!(
        r#"
        INSERT INTO waterways (waterway_type, name, description)
        VALUES ('river', $1, $2)
        RETURNING id, waterway_type AS "waterway_type: WaterwayType", name, description, created_at, updated_at
        "#,
        body.name,
        body.description
    )
    .fetch_one(&app.pg_pool)
    .await;

    match result {
        Ok(r) => (
            StatusCode::CREATED,
            Json(Waterway {
                id: r.id,
                waterway_type: r.waterway_type,
                name: r.name,
                description: r.description,
                created_at: r.created_at,
                updated_at: r.updated_at,
            }),
        )
            .into_response(),
        Err(err) => {
            tracing::error!("Error creating waterway: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(create_river_docs, op =>
    op.description("Create a new river")
        .response_with::<201, Json<Waterway>, _>(|res| res.description("River created"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Rivers")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpdateRiverBody {
    pub name: Option<String>,
    pub description: Option<String>,
}

pub async fn update_river(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(waterway_id): Path<WaterwayId>,
    Json(body): Json<UpdateRiverBody>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    let result = sqlx::query!(
        r#"
        UPDATE waterways
        SET
            name = COALESCE($1, name),
            description = COALESCE($2, description),
            updated_at = NOW()
        WHERE id = $3
        RETURNING id, waterway_type AS "waterway_type: WaterwayType", name, description, created_at, updated_at
        "#,
        body.name,
        body.description,
        waterway_id
    )
    .fetch_optional(&app.pg_pool)
    .await;

    match result {
        Ok(Some(r)) => Json(Waterway {
            id: r.id,
            waterway_type: r.waterway_type,
            name: r.name,
            description: r.description,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error updating waterway {}: {}", waterway_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(update_river_docs, op =>
    op.description("Update a river")
        .response::<200, Json<Waterway>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("River not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Rivers")
);

pub async fn delete_river(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(waterway_id): Path<WaterwayId>,
) -> impl IntoApiResponse {
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    let result = sqlx::query!(
        "DELETE FROM waterways WHERE id = $1 RETURNING id",
        waterway_id
    )
    .fetch_optional(&app.pg_pool)
    .await;

    match result {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error deleting waterway {}: {}", waterway_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(delete_river_docs, op =>
    op.description("Delete a river and all its sections and features")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("River not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Rivers")
);

// Aide requires serializable types to generate request body schemas.
// These mirror the request body structs above.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct UpdateRiverBodyDoc {
    name: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct CreateRiverBodyDoc {
    name: String,
    description: Option<String>,
}
