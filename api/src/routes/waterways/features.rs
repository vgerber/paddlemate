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
use serde_json::Value;

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        feature::{CreateFeatureBody, Feature, FeatureDescription, FeatureName, FeatureType},
        gauge::FeatureWaterRangeBody,
        geometry::Geometry,
        lang::{DEFAULT_LANG_CODE, normalize_lang_code},
        path_params::{FeatureLocalePath, FeaturePath, SectionPath},
        proposal::Proposal,
        water_section::SectionId,
        waterway::WaterwayId,
    },
    query::{features, gauges, proposals, sections},
    state::AppState,
};

pub async fn create_feature(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
    Json(mut body): Json<CreateFeatureBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    match sections::section_exists(&app.pg_pool, waterway_id, section_id).await {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error verifying section {}: {}", section_id, err);
            return ApiError::internal().into_response();
        }
    }

    for range in &body.water_ranges {
        if let Err(msg) = range.validate() {
            return ApiError::validation(msg).into_response();
        }
    }

    // Normalizing here means the proposal payload below is stored with the
    // canonical code, so approval never has to validate again.
    if let Err(msg) = body.normalize_lang_code() {
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
        let feature =
            features::create_feature_bundle(&mut tx, section_id, &body, token.user_id()).await;
        return match feature {
            Ok(feature) => match tx.commit().await {
                Ok(()) => {
                    // A range may have created + activated a gauge; wake the poller.
                    app.gauge_wake.notify_waiters();
                    (StatusCode::CREATED, Json(feature)).into_response()
                }
                Err(err) => {
                    tracing::error!("Error committing feature: {}", err);
                    ApiError::internal().into_response()
                }
            },
            Err(err) => {
                tracing::error!("Error creating feature: {}", err);
                ApiError::internal().into_response()
            }
        };
    }

    let mut data = serde_json::to_value(&body).expect("serializable body");
    data["waterway_id"] = serde_json::json!(waterway_id);
    data["section_id"] = serde_json::json!(section_id);
    match proposals::insert_proposal(
        &app.pg_pool,
        "feature",
        None,
        "create",
        data,
        token.user_id(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            tracing::error!("Error submitting feature proposal: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(create_feature_docs, op =>
    op.input::<Path<SectionPath>>()
        .description("Add a feature (admin: immediate 201, others: proposal 202)")
        .response_with::<201, Json<Feature>, _>(|res| res.description("Feature created"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Section not found"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code or water range thresholds"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpdateFeatureBody {
    pub feature_type: Option<FeatureType>,
    pub metadata: Option<Value>,
    pub location: Option<Geometry>,
    /// New name in `lang_code`; omit to leave names unchanged
    pub name: Option<String>,
    /// New description in `lang_code`; omit to leave descriptions unchanged
    pub description: Option<String>,
    /// Language tag for name/description, stored lowercase (default: "en")
    pub lang_code: Option<String>,
    /// Gauge thresholds upserted together with the update
    #[serde(default)]
    pub water_ranges: Vec<FeatureWaterRangeBody>,
}

pub async fn update_feature(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id, feature_id)): Path<(WaterwayId, SectionId, i64)>,
    Json(body): Json<UpdateFeatureBody>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    for range in &body.water_ranges {
        if let Err(msg) = range.validate() {
            return ApiError::validation(msg).into_response();
        }
    }
    let lang_code =
        match normalize_lang_code(body.lang_code.as_deref().unwrap_or(DEFAULT_LANG_CODE)) {
            Ok(code) => code,
            Err(msg) => return ApiError::validation(msg).into_response(),
        };

    if token.is_server_admin() {
        let location_json = body
            .location
            .as_ref()
            .map(|g| serde_json::to_string(g).expect("valid geometry"));

        let feature = match features::update_feature(
            &app.pg_pool,
            waterway_id,
            section_id,
            feature_id,
            body.feature_type,
            body.metadata.clone(),
            location_json,
        )
        .await
        {
            Ok(Some(feature)) => feature,
            Ok(None) => return ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error updating feature {}: {}", feature_id, err);
                return ApiError::internal().into_response();
            }
        };

        let name = body
            .name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        if let Some(name) = name {
            if let Err(err) =
                features::upsert_name(&app.pg_pool, feature_id, &lang_code, name).await
            {
                tracing::error!("Error updating feature {} name: {}", feature_id, err);
                return ApiError::internal().into_response();
            }
        }
        let description = body
            .description
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        if let Some(description) = description {
            if let Err(err) =
                features::upsert_description(&app.pg_pool, feature_id, &lang_code, description)
                    .await
            {
                tracing::error!("Error updating feature {} description: {}", feature_id, err);
                return ApiError::internal().into_response();
            }
        }
        for range in &body.water_ranges {
            // Resolve a catalog reference (creating + activating a gauge) or
            // pass through an existing series_id, then upsert the range.
            let mut conn = match app.pg_pool.acquire().await {
                Ok(c) => c,
                Err(err) => {
                    tracing::error!("Error acquiring connection: {}", err);
                    return ApiError::internal().into_response();
                }
            };
            let series_id = match crate::query::features::resolve_range_series(&mut conn, range)
                .await
            {
                Ok(id) => id,
                Err(err) => {
                    tracing::error!("Error resolving gauge for feature {}: {}", feature_id, err);
                    return ApiError::internal().into_response();
                }
            };
            if let Err(err) = gauges::upsert_feature_water_range_partial(
                &mut *conn,
                feature_id,
                series_id,
                range.range_low,
                range.range_medium,
                range.range_high,
            )
            .await
            {
                tracing::error!("Error updating feature {} ranges: {}", feature_id, err);
                return ApiError::internal().into_response();
            }
        }
        // A range may have created + activated a gauge; wake the poller.
        app.gauge_wake.notify_waiters();
        // Names/descriptions changed after the fetch; clients refetch anyway.
        return Json(feature).into_response();
    }

    let data = serde_json::json!({
        "waterway_id": waterway_id,
        "section_id": section_id,
        "feature_type": body.feature_type,
        "metadata": body.metadata,
        "location": body.location,
        "name": body.name,
        "description": body.description,
        "lang_code": lang_code,
        "water_ranges": body.water_ranges,
    });
    match proposals::insert_proposal(
        &app.pg_pool,
        "feature",
        Some(feature_id),
        "update",
        data,
        token.user_id(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            tracing::error!("Error submitting feature update proposal: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_feature_docs, op =>
    op.input::<Path<FeaturePath>>()
        .description("Update a feature (admin: immediate 200, others: proposal 202)")
        .response::<200, Json<Feature>>()
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Feature not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);

pub async fn delete_feature(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id, feature_id)): Path<(WaterwayId, SectionId, i64)>,
) -> impl IntoApiResponse {
    let Extension(token) = match auth {
        Some(a) => a,
        None => return ApiError::unauthorized("Authentication required").into_response(),
    };

    if token.is_server_admin() {
        return match features::delete_feature(&app.pg_pool, waterway_id, section_id, feature_id)
            .await
        {
            Ok(true) => StatusCode::NO_CONTENT.into_response(),
            Ok(false) => ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error deleting feature {}: {}", feature_id, err);
                ApiError::internal().into_response()
            }
        };
    }

    let data = serde_json::json!({ "waterway_id": waterway_id, "section_id": section_id });
    match proposals::insert_proposal(
        &app.pg_pool,
        "feature",
        Some(feature_id),
        "delete",
        data,
        token.user_id(),
    )
    .await
    {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            tracing::error!("Error submitting feature delete proposal: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_feature_docs, op =>
    op.input::<Path<FeaturePath>>()
        .description("Delete a feature (admin: immediate 204, others: proposal 202)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Feature not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpsertNameBody {
    pub name: String,
}

pub async fn upsert_feature_name(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id, feature_id, lang_code)): Path<(
        WaterwayId,
        SectionId,
        i64,
        String,
    )>,
    Json(body): Json<UpsertNameBody>,
) -> impl IntoApiResponse {
    let lang_code = match authorize_localization(auth, &lang_code) {
        Ok(code) => code,
        Err(error) => return error.into_response(),
    };

    match features::feature_belongs_to_section(&app.pg_pool, waterway_id, section_id, feature_id)
        .await
    {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error checking feature {}: {}", feature_id, err);
            return ApiError::internal().into_response();
        }
    }

    match features::upsert_name(&app.pg_pool, feature_id, &lang_code, &body.name).await {
        Ok(name) => Json(name).into_response(),
        Err(err) => {
            tracing::error!("Error upserting name for feature {}: {}", feature_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(upsert_feature_name_docs, op =>
    op.input::<Path<FeatureLocalePath>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code"))
        .description("Add or update a localized name for a feature")
        .response::<200, Json<FeatureName>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Feature not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);

pub async fn delete_feature_name(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id, feature_id, lang_code)): Path<(
        WaterwayId,
        SectionId,
        i64,
        String,
    )>,
) -> impl IntoApiResponse {
    let lang_code = match authorize_localization(auth, &lang_code) {
        Ok(code) => code,
        Err(error) => return error.into_response(),
    };

    match features::delete_name(
        &app.pg_pool,
        waterway_id,
        section_id,
        feature_id,
        &lang_code,
    )
    .await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting name for feature {}: {}", feature_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_feature_name_docs, op =>
    op.input::<Path<FeatureLocalePath>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code"))
        .description("Delete a localized name for a feature")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Name not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);

#[derive(Deserialize, JsonSchema)]
pub struct UpsertDescriptionBody {
    pub description: String,
}

pub async fn upsert_feature_description(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id, feature_id, lang_code)): Path<(
        WaterwayId,
        SectionId,
        i64,
        String,
    )>,
    Json(body): Json<UpsertDescriptionBody>,
) -> impl IntoApiResponse {
    let lang_code = match authorize_localization(auth, &lang_code) {
        Ok(code) => code,
        Err(error) => return error.into_response(),
    };

    match features::feature_belongs_to_section(&app.pg_pool, waterway_id, section_id, feature_id)
        .await
    {
        Ok(true) => {}
        Ok(false) => return ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error checking feature {}: {}", feature_id, err);
            return ApiError::internal().into_response();
        }
    }

    match features::upsert_description(&app.pg_pool, feature_id, &lang_code, &body.description)
        .await
    {
        Ok(desc) => Json(desc).into_response(),
        Err(err) => {
            tracing::error!(
                "Error upserting description for feature {}: {}",
                feature_id,
                err
            );
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(upsert_feature_description_docs, op =>
    op.input::<Path<FeatureLocalePath>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code"))
        .description("Add or update a localized description for a feature")
        .response::<200, Json<FeatureDescription>>()
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Feature not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);

pub async fn delete_feature_description(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path((waterway_id, section_id, feature_id, lang_code)): Path<(
        WaterwayId,
        SectionId,
        i64,
        String,
    )>,
) -> impl IntoApiResponse {
    let lang_code = match authorize_localization(auth, &lang_code) {
        Ok(code) => code,
        Err(error) => return error.into_response(),
    };

    match features::delete_description(
        &app.pg_pool,
        waterway_id,
        section_id,
        feature_id,
        &lang_code,
    )
    .await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!(
                "Error deleting description for feature {}: {}",
                feature_id,
                err
            );
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_feature_description_docs, op =>
    op.input::<Path<FeatureLocalePath>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid lang_code"))
        .description("Delete a localized description for a feature")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Description not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Features")
);
