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
        path_params::{SectionPath, WaterwayPath},
        proposal::Proposal,
        water_section::{Section, SectionId, SectionWithFeatures},
        waterway::WaterwayId,
    },
    query::{features, proposals, sections},
    state::AppState,
};

pub async fn get_section(
    State(app): State<AppState>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
) -> impl IntoApiResponse {
    let section = sqlx::query!(
        r#"
        SELECT id, waterway_id, name, description, region, country, ST_AsGeoJSON(location) AS location, created_at, updated_at
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

    let (features, names, descriptions) = tokio::join!(
        features::fetch_features_for_section(&app.pg_pool, section_id),
        sections::fetch_names_for_section(&app.pg_pool, section_id),
        sections::fetch_descriptions_for_section(&app.pg_pool, section_id),
    );

    match (features, names, descriptions) {
        (Ok(features), Ok(names), Ok(descriptions)) => {
            let features: Vec<Feature> = features;
            Json(SectionWithFeatures {
                id: section.id,
                waterway_id: section.waterway_id,
                name: section.name,
                description: section.description,
                region: section.region,
                country: section.country,
                location: serde_json::from_str(&section.location.expect("location NOT NULL"))
                    .expect("valid GeoJSON"),
                features,
                names,
                descriptions,
                created_at: section.created_at,
                updated_at: section.updated_at,
            })
            .into_response()
        }
        (Err(err), _, _) | (_, Err(err), _) | (_, _, Err(err)) => {
            tracing::error!(
                "Error fetching details for section {}: {}",
                section_id,
                err
            );
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(get_section_docs, op =>
    op.input::<Path<SectionPath>>()
        .description("Get a section with its features")
        .response::<200, Json<SectionWithFeatures>>()
        .response_with::<404, (), _>(|res| res.description("Section not found"))
        .tag("Sections")
);

fn default_metadata() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

/// A localized name/description pair submitted with a new section. The plain
/// `name`/`description` fields stay the default (fallback) text.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SectionTranslationBody {
    /// BCP-47 language code, e.g. "de"
    pub lang_code: String,
    pub name: Option<String>,
    pub description: Option<String>,
}

/// A feature submitted together with a new section (e.g. whitewater for the
/// full stretch, or a weir at a specific point).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SectionFeatureBody {
    pub feature_type: crate::models::feature::FeatureType,
    #[serde(default = "default_metadata")]
    pub metadata: serde_json::Value,
    pub location: Geometry,
    pub name: Option<String>,
    pub description: Option<String>,
    /// BCP-47 language code for name/description (default: "en")
    pub lang_code: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct CreateSectionBody {
    pub name: String,
    pub description: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    pub location: Geometry,
    /// Localized names/descriptions created together with the section
    #[serde(default)]
    pub translations: Vec<SectionTranslationBody>,
    /// Features created together with the section
    #[serde(default)]
    pub features: Vec<SectionFeatureBody>,
}

pub async fn create_section(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(waterway_id): Path<WaterwayId>,
    Json(body): Json<CreateSectionBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    if token.is_server_admin() {
        let location_json = serde_json::to_string(&body.location).expect("valid geometry");

        let result = sqlx::query!(
            r#"
        INSERT INTO water_sections (waterway_id, name, description, region, country, location)
        VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6))
        RETURNING id, waterway_id, name, description, region, country, ST_AsGeoJSON(location) AS location, created_at, updated_at
        "#,
            waterway_id,
            body.name,
            body.description,
            body.region,
            body.country,
            location_json
        )
        .fetch_one(&app.pg_pool)
        .await;

        return match result {
            Ok(r) => {
                for translation in &body.translations {
                    if let Some(name) = &translation.name {
                        let _ = sections::upsert_name(
                            &app.pg_pool,
                            r.id,
                            &translation.lang_code,
                            name,
                        )
                        .await;
                    }
                    if let Some(desc) = &translation.description {
                        let _ = sections::upsert_description(
                            &app.pg_pool,
                            r.id,
                            &translation.lang_code,
                            desc,
                        )
                        .await;
                    }
                }
                for feature in &body.features {
                    let feature_location =
                        serde_json::to_string(&feature.location).expect("valid geometry");
                    match features::insert_feature(
                        &app.pg_pool,
                        r.id,
                        feature.feature_type.clone(),
                        feature.metadata.clone(),
                        &feature_location,
                        token.user_id(),
                    )
                    .await
                    {
                        Ok(created) => {
                            let lang = feature.lang_code.as_deref().unwrap_or("en");
                            if let Some(name) = &feature.name {
                                let _ =
                                    features::upsert_name(&app.pg_pool, created.id, lang, name)
                                        .await;
                            }
                            if let Some(desc) = &feature.description {
                                let _ = features::upsert_description(
                                    &app.pg_pool,
                                    created.id,
                                    lang,
                                    desc,
                                )
                                .await;
                            }
                        }
                        Err(err) => {
                            tracing::error!("Error creating bundled feature: {}", err);
                        }
                    }
                }
                (
                    StatusCode::CREATED,
                    Json(Section {
                        id: r.id,
                        waterway_id: r.waterway_id,
                        name: r.name,
                        description: r.description,
                        region: r.region,
                        country: r.country,
                        location: serde_json::from_str(&r.location.expect("location NOT NULL"))
                            .expect("valid GeoJSON"),
                        created_at: r.created_at,
                        updated_at: r.updated_at,
                    }),
                )
                    .into_response()
            }
            Err(err) => {
                tracing::error!("Error creating section: {}", err);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        };
    }

    let data = serde_json::json!({
        "waterway_id": waterway_id,
        "name": body.name,
        "description": body.description,
        "region": body.region,
        "country": body.country,
        "location": body.location,
        "translations": body.translations,
        "features": body.features,
    });
    match proposals::insert_proposal(
        &app.pg_pool,
        "water_section",
        None,
        "create",
        data,
        token.user_id(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            tracing::error!("Error submitting section proposal: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(create_section_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description("Create a section (admin: immediate 201, others: proposal 202)")
        .response_with::<201, Json<Section>, _>(|res| res.description("Section created"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpdateSectionBody {
    pub name: Option<String>,
    pub description: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    pub location: Option<Geometry>,
}

pub async fn update_section(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
    Json(body): Json<UpdateSectionBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    if token.is_server_admin() {
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
            region = COALESCE($3, region),
            country = COALESCE($4, country),
            location = COALESCE(ST_GeomFromGeoJSON($5), location),
            updated_at = NOW()
        WHERE id = $6 AND waterway_id = $7
        RETURNING id, waterway_id, name, description, region, country, ST_AsGeoJSON(location) AS location, created_at, updated_at
        "#,
            body.name,
            body.description,
            body.region,
            body.country,
            location_json,
            section_id,
            waterway_id
        )
        .fetch_optional(&app.pg_pool)
        .await;

        return match result {
            Ok(Some(r)) => Json(Section {
                id: r.id,
                waterway_id: r.waterway_id,
                name: r.name,
                description: r.description,
                region: r.region,
                country: r.country,
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
        };
    }

    let data = serde_json::json!({
        "waterway_id": waterway_id,
        "name": body.name,
        "description": body.description,
        "location": body.location,
    });
    match proposals::insert_proposal(
        &app.pg_pool,
        "water_section",
        Some(section_id),
        "update",
        data,
        token.user_id(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            tracing::error!("Error submitting section update proposal: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(update_section_docs, op =>
    op.input::<Path<SectionPath>>()
        .description("Update a section (admin: immediate 200, others: proposal 202)")
        .response::<200, Json<Section>>()
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
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
    let Extension(token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    if token.is_server_admin() {
        let result = sqlx::query!(
            "DELETE FROM water_sections WHERE id = $1 AND waterway_id = $2 RETURNING id",
            section_id,
            waterway_id
        )
        .fetch_optional(&app.pg_pool)
        .await;

        return match result {
            Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
            Ok(None) => StatusCode::NOT_FOUND.into_response(),
            Err(err) => {
                tracing::error!("Error deleting section {}: {}", section_id, err);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        };
    }

    let data = serde_json::json!({ "waterway_id": waterway_id });
    match proposals::insert_proposal(
        &app.pg_pool,
        "water_section",
        Some(section_id),
        "delete",
        data,
        token.user_id(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            tracing::error!("Error submitting section delete proposal: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(delete_section_docs, op =>
    op.input::<Path<SectionPath>>()
        .description("Delete a section (admin: immediate 204, others: proposal 202)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
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
    region: Option<String>,
    country: Option<String>,
    location: Geometry,
    translations: Vec<SectionTranslationBody>,
    features: Vec<SectionFeatureBody>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct UpdateSectionBodyDoc {
    name: Option<String>,
    description: Option<String>,
    region: Option<String>,
    country: Option<String>,
    location: Option<Geometry>,
}
