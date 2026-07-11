use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::QueryBuilder;

use crate::{
    doc_fn,
    layers::auth::AuthToken,
    models::{
        path_params::WaterwayPath,
        proposal::Proposal,
        water_section::SectionWithFeatures,
        waterway::{PaginatedResponse, Waterway, WaterwayId, WaterwayType, WaterwayWithSections},
    },
    query::{features, proposals, sections as query_sections},
    state::AppState,
};

// Internal row type for the dynamic list query.
#[derive(sqlx::FromRow)]
struct WaterwayRow {
    id: i64,
    waterway_type: WaterwayType,
    name: String,
    description: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    total_count: Option<i64>,
}

impl From<WaterwayRow> for Waterway {
    fn from(r: WaterwayRow) -> Self {
        Waterway {
            id: r.id,
            waterway_type: r.waterway_type,
            name: r.name,
            description: r.description,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct WaterwayFilters {
    /// Page number, starting at 1.
    pub page: Option<i64>,
    /// Items per page (max 100, default 20).
    pub per_page: Option<i64>,
    /// Filter by river or section name (case-insensitive substring match).
    pub name: Option<String>,
    /// Filter by ISO 3166-1 alpha-2 country code (e.g. "AT", "FR").
    pub country: Option<String>,
    /// Minimum whitewater grade (1=I … 6=VI, 10=X).
    pub min_difficulty: Option<i32>,
    /// Maximum whitewater grade (1=I … 6=VI, 10=X).
    pub max_difficulty: Option<i32>,
    /// Latitude for proximity filter (requires lon and radius_km).
    pub lat: Option<f64>,
    /// Longitude for proximity filter (requires lat and radius_km).
    pub lon: Option<f64>,
    /// Radius in km - returns waterways with at least one section within this distance.
    pub radius_km: Option<f64>,
}

pub async fn list_waterways(
    State(app): State<AppState>,
    Query(filters): Query<WaterwayFilters>,
) -> impl IntoApiResponse {
    let page = filters.page.unwrap_or(1).max(1);
    let per_page = filters.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            w.id, w.waterway_type, w.name, w.description,
            w.created_at, w.updated_at,
            COUNT(*) OVER () AS total_count
        FROM waterways w
        WHERE 1=1
        "#,
    );

    if let Some(name) = &filters.name {
        if !name.is_empty() {
            qb.push(" AND (unaccent(w.name) ILIKE unaccent(");
            qb.push_bind(format!("%{}%", name));
            qb.push(") OR EXISTS (SELECT 1 FROM water_sections ws_n WHERE ws_n.waterway_id = w.id AND unaccent(ws_n.name) ILIKE unaccent(");
            qb.push_bind(format!("%{}%", name));
            qb.push(")))");
        }
    }

    if let Some(country) = &filters.country {
        if !country.is_empty() {
            qb.push(" AND EXISTS (SELECT 1 FROM water_sections ws WHERE ws.waterway_id = w.id AND ws.country = ");
            qb.push_bind(country.to_uppercase());
            qb.push(")");
        }
    }

    if filters.min_difficulty.is_some() || filters.max_difficulty.is_some() {
        let min = filters.min_difficulty.unwrap_or(1);
        let max = filters.max_difficulty.unwrap_or(10);
        qb.push(
            r#" AND EXISTS (
            SELECT 1 FROM water_sections ws
            JOIN features f ON f.section_id = ws.id AND f.feature_type = 'whitewater'
            WHERE ws.waterway_id = w.id
            AND (CASE
                WHEN f.metadata->>'difficulty' ~ '^X'   THEN 10
                WHEN f.metadata->>'difficulty' ~ '^VI'  THEN 6
                WHEN f.metadata->>'difficulty' ~ '^V'   THEN 5
                WHEN f.metadata->>'difficulty' ~ '^IV'  THEN 4
                WHEN f.metadata->>'difficulty' ~ '^III' THEN 3
                WHEN f.metadata->>'difficulty' ~ '^II'  THEN 2
                WHEN f.metadata->>'difficulty' ~ '^I'   THEN 1
                ELSE NULL
            END) BETWEEN "#,
        );
        qb.push_bind(min);
        qb.push(" AND ");
        qb.push_bind(max);
        qb.push(")");
    }

    if let (Some(lat), Some(lon), Some(radius_km)) = (filters.lat, filters.lon, filters.radius_km) {
        qb.push(
            " AND EXISTS (SELECT 1 FROM water_sections ws2 WHERE ws2.waterway_id = w.id
            AND ST_DWithin(ws2.location::geography, ST_SetSRID(ST_MakePoint(",
        );
        qb.push_bind(lon);
        qb.push(", ");
        qb.push_bind(lat);
        qb.push("), 4326)::geography, ");
        qb.push_bind(radius_km * 1000.0);
        qb.push("))");
    }

    match &filters.name {
        Some(name) if !name.is_empty() => {
            qb.push(" ORDER BY CASE WHEN unaccent(w.name) ILIKE unaccent(");
            qb.push_bind(format!("{}%", name));
            qb.push(") THEN 0 ELSE 1 END, w.name LIMIT ");
        }
        _ => {
            qb.push(" ORDER BY w.name LIMIT ");
        }
    }
    qb.push_bind(per_page);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let rows = qb
        .build_query_as::<WaterwayRow>()
        .fetch_all(&app.pg_pool)
        .await;

    match rows {
        Ok(records) => {
            let total = records.first().and_then(|r| r.total_count).unwrap_or(0);
            let total_pages = if per_page > 0 {
                (total + per_page - 1) / per_page
            } else {
                0
            };
            let items: Vec<Waterway> = records.into_iter().map(Waterway::from).collect();
            Json(PaginatedResponse {
                items,
                total,
                page,
                per_page,
                total_pages,
            })
            .into_response()
        }
        Err(err) => {
            tracing::error!("Error listing waterways: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(list_waterways_docs, op =>
    op.description("List waterways with optional filters and pagination")
        .response::<200, Json<PaginatedResponse<Waterway>>>()
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
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error fetching waterway {}: {}", waterway_id, err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let (sections_result, features_result, names_result, descriptions_result) = tokio::join!(
        sqlx::query!(
            r#"
            SELECT id, waterway_id, name, description, region, country, ST_AsGeoJSON(location) AS location, created_at, updated_at
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
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(get_waterway_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description("Get a waterway with its sections")
        .response::<200, Json<WaterwayWithSections>>()
        .response_with::<404, (), _>(|res| res.description("Waterway not found"))
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
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    // Reject duplicates up front (case-insensitive) for both the admin and
    // proposal paths; the UNIQUE constraint still guards against races.
    match sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM waterways WHERE lower(name) = lower($1)) AS "exists!""#,
        body.name
    )
    .fetch_one(&app.pg_pool)
    .await
    {
        Ok(true) => {
            return (
                StatusCode::CONFLICT,
                "A waterway with this name already exists",
            )
                .into_response();
        }
        Ok(false) => {}
        Err(err) => {
            tracing::error!("Error checking waterway name: {}", err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
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
            Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23505") => (
                StatusCode::CONFLICT,
                "A waterway with this name already exists",
            )
                .into_response(),
            Err(err) => {
                tracing::error!("Error creating waterway: {}", err);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
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
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(create_waterway_docs, op =>
    op.description("Create a waterway (admin: immediate 201, others: proposal 202)")
        .response_with::<201, Json<Waterway>, _>(|res| res.description("Waterway created"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<409, (), _>(|res| res.description("A waterway with this name already exists"))
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
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
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
            Ok(None) => StatusCode::NOT_FOUND.into_response(),
            Err(err) => {
                tracing::error!("Error updating waterway {}: {}", waterway_id, err);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
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
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(update_waterway_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description("Update a waterway (admin: immediate 200, others: proposal 202)")
        .response::<200, Json<Waterway>>()
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Waterway not found"))
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
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
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
            Ok(None) => StatusCode::NOT_FOUND.into_response(),
            Err(err) => {
                tracing::error!("Error deleting waterway {}: {}", waterway_id, err);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
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
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(delete_waterway_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description("Delete a waterway (admin: immediate 204, others: proposal 202)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Waterway not found"))
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
