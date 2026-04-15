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
        feature::{Feature, FeatureDescription, FeatureName, FeatureType},
        geometry::Geometry,
        water_section::SectionId,
        waterway::WaterwayId,
    },
    query::features,
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

    match features::section_belongs_to_waterway(&app.pg_pool, section_id, waterway_id).await {
        Ok(true) => {}
        Ok(false) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error verifying section {}: {}", section_id, err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    let location_json = serde_json::to_string(&body.location).expect("valid geometry");

    match features::insert_feature(
        &app.pg_pool,
        section_id,
        body.feature_type,
        body.metadata,
        &location_json,
        token.user_id(),
    )
    .await
    {
        Ok(feature) => (StatusCode::CREATED, Json(feature)).into_response(),
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

    match features::update_feature(
        &app.pg_pool,
        waterway_id,
        section_id,
        feature_id,
        body.feature_type,
        body.metadata,
        location_json,
    )
    .await
    {
        Ok(Some(feature)) => Json(feature).into_response(),
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

    match features::delete_feature(&app.pg_pool, waterway_id, section_id, feature_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
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
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    match features::feature_belongs_to_section(&app.pg_pool, waterway_id, section_id, feature_id)
        .await
    {
        Ok(true) => {}
        Ok(false) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error checking feature {}: {}", feature_id, err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    match features::upsert_name(&app.pg_pool, feature_id, &lang_code, &body.name).await {
        Ok(name) => Json(name).into_response(),
        Err(err) => {
            tracing::error!("Error upserting name for feature {}: {}", feature_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(upsert_feature_name_docs, op =>
    op.description("Add or update a localized name for a feature")
        .response::<200, Json<FeatureName>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Feature not found"))
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
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
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
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error deleting name for feature {}: {}", feature_id, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(delete_feature_name_docs, op =>
    op.description("Delete a localized name for a feature")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Name not found"))
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
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    match features::feature_belongs_to_section(&app.pg_pool, waterway_id, section_id, feature_id)
        .await
    {
        Ok(true) => {}
        Ok(false) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!("Error checking feature {}: {}", feature_id, err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
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
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(upsert_feature_description_docs, op =>
    op.description("Add or update a localized description for a feature")
        .response::<200, Json<FeatureDescription>>()
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Feature not found"))
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
    let Extension(_token) = match auth {
        Some(a) => a,
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
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
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            tracing::error!(
                "Error deleting description for feature {}: {}",
                feature_id,
                err
            );
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

doc_fn!(delete_feature_description_docs, op =>
    op.description("Delete a localized description for a feature")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, (), _>(|res| res.description("Unauthorized"))
        .response_with::<404, (), _>(|res| res.description("Description not found"))
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

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct UpsertNameBodyDoc {
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(dead_code)]
struct UpsertDescriptionBodyDoc {
    description: String,
}
