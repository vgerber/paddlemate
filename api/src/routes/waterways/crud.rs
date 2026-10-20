use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::models::proposal::{Proposable, clean_note};
use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        geometry::Geometry,
        path_params::WaterwayPath,
        proposal::Proposal,
        water_section::SectionWithFeatures,
        waterway::{
            PaginatedResponse, Waterway, WaterwayFilters, WaterwayId, WaterwayListItem,
            WaterwayType, WaterwayWithSections, page_bounds, total_pages,
        },
    },
    query::{
        features, gauges as query_gauges, proposals, sections as query_sections,
        waterways as query_waterways,
    },
    state::AppState,
};

pub async fn list_waterways(
    State(app): State<AppState>,
    Query(filters): Query<WaterwayFilters>,
) -> impl IntoApiResponse {
    let (page, per_page) = page_bounds(filters.page, filters.per_page, 20);

    match query_waterways::search(&app.pg_pool, &filters, page, per_page).await {
        Ok((items, total)) => Json(PaginatedResponse {
            items,
            total,
            page,
            per_page,
            total_pages: total_pages(total, per_page),
        })
        .into_response(),
        Err(err) => ApiError::from_db("Error listing waterways", &err).into_response(),
    }
}

doc_fn!(list_waterways_docs, op =>
    op.description("List waterways with optional filters and pagination")
        .response::<200, Json<PaginatedResponse<WaterwayListItem>>>()
        .tag("Waterways")
);

/// Gauges already linked to any section of this waterway - the picker offers
/// these first ("on this river") when adding a new section.
pub async fn list_waterway_gauges(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
) -> impl IntoApiResponse {
    match query_gauges::list_waterway_gauges(&app.pg_pool, waterway_id).await {
        Ok(gauges) => Json(gauges).into_response(),
        Err(err) => ApiError::from_db(
            &format!("Error listing gauges for waterway {waterway_id}"),
            err,
        )
        .into_response(),
    }
}

doc_fn!(list_waterway_gauges_docs, op =>
    op.description("Gauges already linked to a waterway's sections")
        .response::<200, Json<Vec<crate::models::gauge::GaugeWithSeries>>>()
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
            return ApiError::from_db(&format!("Error fetching waterway {waterway_id}"), err)
                .into_response();
        }
    };

    let (sections_result, features_result, names_result, descriptions_result) = tokio::join!(
        sqlx::query!(
            r#"
            SELECT id, waterway_id, name, description, regions, country, ST_AsGeoJSON(location) AS location, created_by, created_at, updated_at
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
            let sections: Result<Vec<SectionWithFeatures>, sqlx::Error> = records
                .into_iter()
                .map(|s| {
                    Ok(SectionWithFeatures {
                        id: s.id,
                        waterway_id: s.waterway_id,
                        name: s.name,
                        description: s.description,
                        regions: s.regions,
                        country: s.country,
                        features: features_map.remove(&s.id).unwrap_or_default(),
                        names: names_map.remove(&s.id).unwrap_or_default(),
                        descriptions: descriptions_map.remove(&s.id).unwrap_or_default(),
                        location: Geometry::from_db(s.location)?,
                        created_by: s.created_by,
                        created_at: s.created_at,
                        updated_at: s.updated_at,
                    })
                })
                .collect();
            let sections = match sections {
                Ok(sections) => sections,
                Err(err) => {
                    return ApiError::from_db(
                        &format!("Invalid section geometry for waterway {waterway_id}"),
                        err,
                    )
                    .into_response();
                }
            };
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
            ApiError::from_db(
                &format!("Error fetching sections for waterway {waterway_id}"),
                err,
            )
            .into_response()
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
    Json(Proposable {
        body,
        proposal_note,
    }): Json<Proposable<CreateWaterwayBody>>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    let note = match clean_note(proposal_note) {
        Ok(note) => note,
        Err(err) => return err.into_response(),
    };

    // Reject duplicates up front (case-insensitive) for both the admin and
    // proposal paths; the UNIQUE constraint still guards against races.
    match query_waterways::name_exists(&app.pg_pool, &body.name).await {
        Ok(true) => {
            return ApiError::conflict("A waterway with this name already exists").into_response();
        }
        Ok(false) => {}
        Err(err) => {
            return ApiError::from_db("Error checking waterway name", &err).into_response();
        }
    }

    if token.is_server_admin() {
        let result = query_waterways::create_waterway(
            &app.pg_pool,
            &body.name,
            body.description.as_deref(),
            token.user_id(),
        )
        .await;

        return match result {
            Ok(waterway) => (StatusCode::CREATED, Json(waterway)).into_response(),
            Err(err) if crate::query::is_unique_violation(&err) => {
                ApiError::conflict("A waterway with this name already exists").into_response()
            }
            Err(err) => ApiError::from_db("Error creating waterway", &err).into_response(),
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
        note.as_deref(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => ApiError::from_db("Error submitting waterway proposal", &err).into_response(),
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
    Json(Proposable {
        body,
        proposal_note,
    }): Json<Proposable<UpdateWaterwayBody>>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    let note = match clean_note(proposal_note) {
        Ok(note) => note,
        Err(err) => return err.into_response(),
    };

    if token.is_server_admin() {
        let result = query_waterways::update_waterway(
            &app.pg_pool,
            waterway_id,
            body.name.as_deref(),
            body.description.as_deref(),
            token.user_id(),
        )
        .await;

        return match result {
            Ok(Some(waterway)) => Json(waterway).into_response(),
            Ok(None) => ApiError::not_found("Not found").into_response(),
            Err(err) => ApiError::from_db(&format!("Error updating waterway {waterway_id}"), err)
                .into_response(),
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
        note.as_deref(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            ApiError::from_db("Error submitting waterway update proposal", &err).into_response()
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
        let result =
            query_waterways::delete_waterway(&app.pg_pool, waterway_id, token.user_id()).await;

        return match result {
            Ok(true) => StatusCode::NO_CONTENT.into_response(),
            Ok(false) => ApiError::not_found("Not found").into_response(),
            Err(err) => ApiError::from_db(&format!("Error deleting waterway {waterway_id}"), err)
                .into_response(),
        };
    }

    match proposals::insert_proposal(
        &app.pg_pool,
        "waterway",
        Some(waterway_id),
        "delete",
        serde_json::json!({}),
        token.user_id(),
        None,
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            ApiError::from_db("Error submitting waterway delete proposal", &err).into_response()
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
