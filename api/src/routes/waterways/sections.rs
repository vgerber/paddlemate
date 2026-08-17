use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        descent::SectionDescentCount,
        feature::Feature,
        path_params::{SectionLocalePath, SectionPath, WaterwayPath},
        proposal::Proposal,
        water_section::{
            CreateSectionBody, Section, SectionDescription, SectionId, SectionName,
            SectionWithFeatures, UpdateSectionBody,
        },
        waterway::WaterwayId,
    },
    query::{descents, features, proposals, sections},
    state::AppState,
};
use aide::axum::IntoApiResponse;

use super::authorize_localization;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::Deserialize;

pub async fn get_section(
    State(app): State<AppState>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
) -> impl IntoApiResponse {
    let section = match sections::fetch_section(&app.pg_pool, waterway_id, section_id).await {
        Ok(Some(s)) => s,
        Ok(None) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error fetching section {}: {}", section_id, err);
            return ApiError::internal().into_response();
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
                regions: section.regions,
                country: section.country,
                location: section.location,
                features,
                names,
                descriptions,
                created_by: section.created_by,
                created_at: section.created_at,
                updated_at: section.updated_at,
            })
            .into_response()
        }
        (Err(err), _, _) | (_, Err(err), _) | (_, _, Err(err)) => {
            tracing::error!("Error fetching details for section {}: {}", section_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_section_docs, op =>
    op.input::<Path<SectionPath>>()
        .description("Get a section with its features")
        .response::<200, Json<SectionWithFeatures>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Section not found"))
        .tag("Sections")
);

pub async fn create_section(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(waterway_id): Path<WaterwayId>,
    Json(mut body): Json<CreateSectionBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    for feature in &body.features {
        for range in &feature.water_ranges {
            if let Err(msg) = range.validate() {
                return ApiError::validation(msg).into_response();
            }
        }
    }

    // Normalizing here means the proposal payload below is stored with the
    // canonical codes, so approval never has to validate again.
    if let Err(msg) = body.normalize_lang_codes() {
        return ApiError::validation(msg).into_response();
    }

    if token.is_server_admin() {
        let mut tx = match app.pg_pool.begin().await {
            Ok(tx) => tx,
            Err(err) => {
                tracing::error!("Error starting transaction: {}", err);
                return ApiError::internal().into_response();
            }
        };
        let section =
            sections::create_section_bundle(&mut tx, waterway_id, &body, token.user_id()).await;
        return match section {
            Ok(section) => match tx.commit().await {
                Ok(()) => {
                    // A feature's range may have created + activated a gauge.
                    app.gauge_wake.notify_waiters();
                    (StatusCode::CREATED, Json(section)).into_response()
                }
                Err(err) => {
                    tracing::error!("Error committing section: {}", err);
                    ApiError::internal().into_response()
                }
            },
            Err(err) => {
                tracing::error!("Error creating section: {}", err);
                ApiError::internal().into_response()
            }
        };
    }

    let mut data = serde_json::to_value(&body).expect("serializable body");
    data["waterway_id"] = serde_json::json!(waterway_id);
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
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(create_section_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description("Create a section (admin: immediate 201, others: proposal 202)")
        .response_with::<201, Json<Section>, _>(|res| res.description("Section created"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code or water range thresholds"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);

pub async fn update_section(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
    Json(body): Json<UpdateSectionBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    if token.is_server_admin() {
        return match sections::update_section(&app.pg_pool, waterway_id, section_id, &body).await {
            Ok(Some(section)) => Json(section).into_response(),
            Ok(None) => ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error updating section {}: {}", section_id, err);
                ApiError::internal().into_response()
            }
        };
    }

    let mut data = serde_json::to_value(&body).expect("serializable body");
    data["waterway_id"] = serde_json::json!(waterway_id);
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
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_section_docs, op =>
    op.input::<Path<SectionPath>>()
        .description("Update a section (admin: immediate 200, others: proposal 202)")
        .response::<200, Json<Section>>()
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Section not found"))
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
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    if token.is_server_admin() {
        return match sections::delete_section(&app.pg_pool, waterway_id, section_id).await {
            Ok(true) => StatusCode::NO_CONTENT.into_response(),
            Ok(false) => ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error deleting section {}: {}", section_id, err);
                ApiError::internal().into_response()
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
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_section_docs, op =>
    op.input::<Path<SectionPath>>()
        .description("Delete a section (admin: immediate 204, others: proposal 202)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Section not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);

pub async fn list_section_descent_counts(
    State(app): State<AppState>,
    Path(path): Path<WaterwayPath>,
    auth: Option<Extension<AuthToken>>,
) -> impl IntoApiResponse {
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());
    match descents::count_descents_per_section(&app.pg_pool, path.waterway_id, viewer_id.as_deref())
        .await
    {
        Ok(counts) => Json(counts).into_response(),
        Err(err) => {
            tracing::error!(
                "Error counting descents for waterway {}: {}",
                path.waterway_id,
                err
            );
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_section_descent_counts_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description(
            "Number of descents per section of the waterway, counting only \
             descents visible to the viewer. Sections without descents are omitted."
        )
        .response::<200, Json<Vec<SectionDescentCount>>>()
        .tag("Sections")
);

pub async fn list_sections(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
) -> impl IntoApiResponse {
    match sections::list_sections(&app.pg_pool, waterway_id).await {
        Ok(sections) => Json(sections).into_response(),
        Err(err) => ApiError::from_db("listing sections", err).into_response(),
    }
}

doc_fn!(list_sections_docs, op =>
    op.input::<Path<WaterwayPath>>()
        .description(
            "List the sections of a waterway. Returns the sections alone; use the \
             waterway endpoint when the features and translations are needed too."
        )
        .response::<200, Json<Vec<Section>>>()
        .tag("Sections")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpsertSectionNameBody {
    pub name: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct UpsertSectionDescriptionBody {
    pub description: String,
}

pub async fn upsert_section_name(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<SectionLocalePath>,
    Json(body): Json<UpsertSectionNameBody>,
) -> impl IntoApiResponse {
    let lang_code = match authorize_localization(auth, &path.lang_code) {
        Ok(code) => code,
        Err(error) => return error.into_response(),
    };

    match sections::section_exists(&app.pg_pool, path.waterway_id, path.section_id).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Section not found").into_response(),
        Err(err) => return ApiError::from_db("checking section", err).into_response(),
    }

    match sections::upsert_name(&app.pg_pool, path.section_id, &lang_code, &body.name).await {
        Ok(name) => Json(name).into_response(),
        Err(err) => ApiError::from_db("upserting section name", err).into_response(),
    }
}

doc_fn!(upsert_section_name_docs, op =>
    op.input::<Path<SectionLocalePath>>()
        .description("Add or update a localized name for a section")
        .response::<200, Json<SectionName>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Section not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);

pub async fn delete_section_name(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<SectionLocalePath>,
) -> impl IntoApiResponse {
    let lang_code = match authorize_localization(auth, &path.lang_code) {
        Ok(code) => code,
        Err(error) => return error.into_response(),
    };

    match sections::delete_name(&app.pg_pool, path.waterway_id, path.section_id, &lang_code).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("No name in that language").into_response(),
        Err(err) => ApiError::from_db("deleting section name", err).into_response(),
    }
}

doc_fn!(delete_section_name_docs, op =>
    op.input::<Path<SectionLocalePath>>()
        .description("Remove a localized name from a section")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("No name in that language"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);

pub async fn upsert_section_description(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<SectionLocalePath>,
    Json(body): Json<UpsertSectionDescriptionBody>,
) -> impl IntoApiResponse {
    let lang_code = match authorize_localization(auth, &path.lang_code) {
        Ok(code) => code,
        Err(error) => return error.into_response(),
    };

    match sections::section_exists(&app.pg_pool, path.waterway_id, path.section_id).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Section not found").into_response(),
        Err(err) => return ApiError::from_db("checking section", err).into_response(),
    }

    match sections::upsert_description(&app.pg_pool, path.section_id, &lang_code, &body.description)
        .await
    {
        Ok(description) => Json(description).into_response(),
        Err(err) => ApiError::from_db("upserting section description", err).into_response(),
    }
}

doc_fn!(upsert_section_description_docs, op =>
    op.input::<Path<SectionLocalePath>>()
        .description("Add or update a localized description for a section")
        .response::<200, Json<SectionDescription>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Section not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);

pub async fn delete_section_description(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(path): Path<SectionLocalePath>,
) -> impl IntoApiResponse {
    let lang_code = match authorize_localization(auth, &path.lang_code) {
        Ok(code) => code,
        Err(error) => return error.into_response(),
    };

    match sections::delete_description(&app.pg_pool, path.waterway_id, path.section_id, &lang_code)
        .await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("No description in that language").into_response(),
        Err(err) => ApiError::from_db("deleting section description", err).into_response(),
    }
}

doc_fn!(delete_section_description_docs, op =>
    op.input::<Path<SectionLocalePath>>()
        .description("Remove a localized description from a section")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("No description in that language"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Sections")
);
