use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        path_params::WaterwayPath,
        proposal::Proposal,
        water_section::SectionWithFeatures,
        waterway::{
            PaginatedResponse, Waterway, WaterwayFilters, WaterwayId, WaterwayListItem,
            WaterwayType, WaterwayWithSections,
        },
    },
    query::{features, proposals, sections as query_sections, waterways as query_waterways},
    state::AppState,
};

pub async fn list_waterways(
    State(app): State<AppState>,
    Query(filters): Query<WaterwayFilters>,
) -> impl IntoApiResponse {
    let page = filters.page.unwrap_or(1).max(1);
    let per_page = filters.per_page.unwrap_or(20).clamp(1, 100);

    match query_waterways::search(&app.pg_pool, &filters, page, per_page).await {
        Ok((items, total)) => Json(PaginatedResponse {
            items,
            total,
            page,
            per_page,
            total_pages: (total + per_page - 1) / per_page,
        })
        .into_response(),
        Err(err) => {
            tracing::error!("Error listing waterways: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_waterways_docs, op =>
    op.description("List waterways with optional filters and pagination")
        .response::<200, Json<PaginatedResponse<WaterwayListItem>>>()
        .tag("Waterways")
);

pub async fn get_waterway(
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
        Ok(None) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error fetching waterway {}: {}", waterway_id, err);
            return ApiError::internal().into_response();
        }
    };

    let (sections_result, features_result, names_result, descriptions_result) = tokio::join!(
        sqlx::query!(
            r#"
            SELECT id, waterway_id, name, description, region, country, ST_AsGeoJSON(location) AS location, created_by, created_at, updated_at
            FROM water_sections WHERE waterway_id = $1 ORDER BY river_km_start NULLS LAST, name
            "#,
            waterway_id
        )
        .fetch_all(&app.pg_pool),
        features::fetch_features_for_waterway(&app.pg_pool, waterway_id),
        query_sections::fetch_names_for_waterway(&app.pg_pool, waterway_id),
        query_sections::fetch_descriptions_for_waterway(&app.pg_pool, waterway_id)
    );

    match (
        sections_result,
        features_result,
        names_result,
        descriptions_result,
    ) {
        (Ok(records), Ok(mut features_map), Ok(mut names_map), Ok(mut descriptions_map)) => {
            let sections: Vec<SectionWithFeatures> = records
                .into_iter()
                .map(|s| SectionWithFeatures {
                    id: s.id,
                    waterway_id: s.waterway_id,
                    name: s.name,
                    description: s.description,
                    region: s.region,
                    country: s.country,
                    features: features_map.remove(&s.id).unwrap_or_default(),
                    names: names_map.remove(&s.id).unwrap_or_default(),
                    descriptions: descriptions_map.remove(&s.id).unwrap_or_default(),
                    location: serde_json::from_str(&s.location.expect("location NOT NULL"))
                        .expect("valid GeoJSON"),
                    created_by: s.created_by,
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
        (Err(err), _, _, _) | (_, Err(err), _, _) | (_, _, Err(err), _) | (_, _, _, Err(err)) => {
            tracing::error!(
                "Error fetching sections for waterway {}: {}",
                waterway_id,
                err
            );
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_waterway_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description("Get a waterway with its sections")
        .response::<200, Json<WaterwayWithSections>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Waterway not found"))
        .tag("Waterways")
);

#[derive(Deserialize, JsonSchema)]
pub struct CreateWaterwayBody {
    pub name: String,
    pub description: Option<String>,
}

pub async fn create_waterway(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(body): Json<CreateWaterwayBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    // Reject duplicates up front (case-insensitive) for both the admin and
    // proposal paths; the UNIQUE constraint still guards against races.
    match query_waterways::name_exists(&app.pg_pool, &body.name).await {
        Ok(true) => {
            return ApiError::conflict("A waterway with this name already exists").into_response();
        }
        Ok(false) => {}
        Err(err) => {
            tracing::error!("Error checking waterway name: {}", err);
            return ApiError::internal().into_response();
        }
    }

    if token.is_server_admin() {
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

        return match result {
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
            Err(err) if crate::query::is_unique_violation(&err) => {
                ApiError::conflict("A waterway with this name already exists").into_response()
            }
            Err(err) => {
                tracing::error!("Error creating waterway: {}", err);
                ApiError::internal().into_response()
            }
        };
    }

    let data = serde_json::json!({ "name": body.name, "description": body.description });
    match proposals::insert_proposal(
        &app.pg_pool,
        "waterway",
        None,
        "create",
        data,
        token.user_id(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            tracing::error!("Error submitting waterway proposal: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(create_waterway_docs, op =>
    op.description("Create a waterway (admin: immediate 201, others: proposal 202)")
        .response_with::<201, Json<Waterway>, _>(|res| res.description("Waterway created"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<409, Json<ErrorResponse>, _>(|res| res.description("A waterway with this name already exists"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Waterways")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpdateWaterwayBody {
    pub name: Option<String>,
    pub description: Option<String>,
}

pub async fn update_waterway(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(waterway_id): Path<WaterwayId>,
    Json(body): Json<UpdateWaterwayBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    if token.is_server_admin() {
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

        return match result {
            Ok(Some(r)) => Json(Waterway {
                id: r.id,
                waterway_type: r.waterway_type,
                name: r.name,
                description: r.description,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .into_response(),
            Ok(None) => ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error updating waterway {}: {}", waterway_id, err);
                ApiError::internal().into_response()
            }
        };
    }

    let data = serde_json::json!({ "name": body.name, "description": body.description });
    match proposals::insert_proposal(
        &app.pg_pool,
        "waterway",
        Some(waterway_id),
        "update",
        data,
        token.user_id(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            tracing::error!("Error submitting waterway update proposal: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_waterway_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description("Update a waterway (admin: immediate 200, others: proposal 202)")
        .response::<200, Json<Waterway>>()
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Waterway not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Waterways")
);

pub async fn delete_waterway(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(waterway_id): Path<WaterwayId>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    if token.is_server_admin() {
        let result = sqlx::query!(
            "DELETE FROM waterways WHERE id = $1 RETURNING id",
            waterway_id
        )
        .fetch_optional(&app.pg_pool)
        .await;

        return match result {
            Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
            Ok(None) => ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error deleting waterway {}: {}", waterway_id, err);
                ApiError::internal().into_response()
            }
        };
    }

    match proposals::insert_proposal(
        &app.pg_pool,
        "waterway",
        Some(waterway_id),
        "delete",
        serde_json::json!({}),
        token.user_id(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            tracing::error!("Error submitting waterway delete proposal: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_waterway_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description("Delete a waterway (admin: immediate 204, others: proposal 202)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Waterway not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Waterways")
);

// Aide requires serializable types to generate request body schemas.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct UpdateWaterwayBodyDoc {
    name: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct CreateWaterwayBodyDoc {
    name: String,
    description: Option<String>,
}
