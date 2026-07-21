use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use crate::{
    doc_fn,
    layers::auth::AuthToken,
    models::{
        descent::SectionDescentCount,
        feature::Feature,
        path_params::{SectionPath, WaterwayPath},
        proposal::Proposal,
        water_section::{
            CreateSectionBody, Section, SectionId, SectionWithFeatures, UpdateSectionBody,
        },
        waterway::WaterwayId,
    },
    query::{descents, features, proposals, sections},
    state::AppState,
};

pub async fn get_section(
    State(app): State<AppState>,
    Path((waterway_id, section_id)): Path<(WaterwayId, SectionId)>,
) -> impl IntoApiResponse {
    let section = match sections::fetch_section(&app.pg_pool, waterway_id, section_id).await {
        Ok(Some(s)) => s,
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

    for feature in &body.features {
        for range in &feature.water_ranges {
            if let Err(msg) = range.validate() {
                return (StatusCode::UNPROCESSABLE_ENTITY, msg).into_response();
            }
        }
    }

    if token.is_server_admin() {
        let mut tx = match app.pg_pool.begin().await {
            Ok(tx) => tx,
            Err(err) => {
                tracing::error!("Error starting transaction: {}", err);
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        };
        let section =
            sections::create_section_bundle(&mut tx, waterway_id, &body, token.user_id()).await;
        return match section {
            Ok(section) => match tx.commit().await {
                Ok(()) => (StatusCode::CREATED, Json(section)).into_response(),
                Err(err) => {
                    tracing::error!("Error committing section: {}", err);
                    StatusCode::INTERNAL_SERVER_ERROR.into_response()
                }
            },
            Err(err) => {
                tracing::error!("Error creating section: {}", err);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
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
        .response_with::<422, (), _>(|res| res.description("Invalid water range thresholds"))
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
        None => return (StatusCode::UNAUTHORIZED, "Authentication required").into_response(),
    };

    if token.is_server_admin() {
        return match sections::update_section(&app.pg_pool, waterway_id, section_id, &body).await
        {
            Ok(Some(section)) => Json(section).into_response(),
            Ok(None) => StatusCode::NOT_FOUND.into_response(),
            Err(err) => {
                tracing::error!("Error updating section {}: {}", section_id, err);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
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
        return match sections::delete_section(&app.pg_pool, waterway_id, section_id).await {
            Ok(true) => StatusCode::NO_CONTENT.into_response(),
            Ok(false) => StatusCode::NOT_FOUND.into_response(),
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

pub async fn list_section_descent_counts(
    State(app): State<AppState>,
    Path(path): Path<WaterwayPath>,
    auth: Option<Extension<AuthToken>>,
) -> impl IntoApiResponse {
    let viewer_id = auth.as_ref().map(|Extension(t)| t.user_id().to_string());
    match descents::count_descents_per_section(
        &app.pg_pool,
        path.waterway_id,
        viewer_id.as_deref(),
    )
    .await
    {
        Ok(counts) => Json(counts).into_response(),
        Err(err) => {
            tracing::error!(
                "Error counting descents for waterway {}: {}",
                path.waterway_id,
                err
            );
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
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
