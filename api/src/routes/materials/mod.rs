use aide::axum::IntoApiResponse;

mod images;
mod models;
mod photos;
mod tree;
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    models::{
        id_list::parse_id_list,
        material::{
            MAX_QUERY_CHARS, Material, MaterialBody, MaterialBrand, MaterialCategory,
            MaterialFilters,
        },
        page::{PaginatedResponse, page_bounds, page_of},
        path_params::MaterialPath,
        proposal::{Proposable, Proposal, clean_note},
    },
    query::{
        is_unique_violation,
        materials::{self, CreateError, MAX_COMPARE_IDS, MAX_NEW_PER_DAY},
        proposals::{self, material::SubmitError},
    },
    routes::access,
    state::AppState,
};

/// The message an entry that already exists gets. The unique index folds case
/// and spacing, so "already there" can mean a differently written duplicate.
const DUPLICATE_MESSAGE: &str =
    "This brand, model and variant is already in the wiki - edit that entry instead";

/// Reject search text and brand filters long enough to be abuse.
pub(super) fn check_filters(filters: &MaterialFilters) -> Result<(), ApiError> {
    for (name, value) in [("q", &filters.q), ("brand", &filters.brand)] {
        if value
            .as_deref()
            .is_some_and(|v| v.chars().count() > MAX_QUERY_CHARS)
        {
            return Err(ApiError::validation(format!(
                "{name} is longer than {MAX_QUERY_CHARS} characters"
            ))
            .with_target(name));
        }
    }
    let bounds = [
        filters.min_length_cm,
        filters.max_length_cm,
        filters.min_volume_l,
        filters.max_volume_l,
        filters.min_weight_kg,
        filters.max_weight_kg,
        filters.fits_paddler_kg,
    ];
    if bounds.iter().flatten().any(|v| !v.is_finite()) {
        return Err(ApiError::validation("Measurement filters must be numbers"));
    }
    Ok(())
}

pub async fn list_materials(
    State(app): State<AppState>,
    Query(filters): Query<MaterialFilters>,
) -> impl IntoApiResponse {
    if let Err(err) = check_filters(&filters) {
        return err.into_response();
    }
    let (page, per_page) = page_bounds(filters.page, filters.per_page, 24);

    // The comparison asks for named entries and wants exactly those, in the
    // order it listed them, with no filter or paging applied on top.
    if let Some(raw) = filters.ids.as_deref() {
        let ids = match parse_id_list(raw, "ids") {
            Ok(ids) if ids.len() <= MAX_COMPARE_IDS => ids,
            Ok(_) => {
                return ApiError::validation(format!(
                    "ids takes at most {MAX_COMPARE_IDS} entries"
                ))
                .with_target("ids")
                .into_response();
            }
            Err(err) => return err.into_response(),
        };
        return match materials::fetch_many(&app.pg_pool, &ids).await {
            Ok(items) => {
                let total = items.len() as i64;
                Json(PaginatedResponse {
                    items,
                    total,
                    page: 1,
                    per_page: total.max(1),
                    total_pages: 1,
                })
                .into_response()
            }
            Err(err) => ApiError::from_db("Error fetching materials by id", err).into_response(),
        };
    }

    match materials::search(&app.pg_pool, &filters, page, per_page).await {
        Ok((items, total)) => Json(page_of(items, total, page, per_page)).into_response(),
        Err(err) => ApiError::from_db("Error listing materials", err).into_response(),
    }
}

doc_fn!(list_materials_docs, op =>
    op.description("Search the material wiki. `ids` returns exactly the entries listed, in that order, for a comparison.")
        .response::<200, Json<PaginatedResponse<Material>>>()
        .tag("Materials")
);

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct BrandsQuery {
    /// Count only the entries in this category.
    pub category: Option<MaterialCategory>,
}

pub async fn list_brands(
    State(app): State<AppState>,
    Query(query): Query<BrandsQuery>,
) -> impl IntoApiResponse {
    match materials::list_brands(&app.pg_pool, query.category).await {
        Ok(brands) => Json(brands).into_response(),
        Err(err) => ApiError::from_db("Error listing material brands", err).into_response(),
    }
}

doc_fn!(list_brands_docs, op =>
    op.description("Brands in the wiki with their entry counts, most entries first")
        .response::<200, Json<Vec<MaterialBrand>>>()
        .tag("Materials")
);

/// An admin's read of an entry carries the editors' note; nobody else's does.
async fn with_editor_note(
    app: &AppState,
    token: Option<&AuthToken>,
    mut material: Material,
) -> Result<Material, sqlx::Error> {
    if token.is_some_and(AuthToken::is_server_admin) {
        material.editor_note = materials::editor_note(&app.pg_pool, material.id).await?;
    }
    Ok(material)
}

pub async fn get_material(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(MaterialPath { material_id }): Path<MaterialPath>,
) -> impl IntoApiResponse {
    let fetched = match materials::fetch(&app.pg_pool, material_id).await {
        Ok(Some(material)) => with_editor_note(&app, auth.as_ref().map(|a| &a.0), material).await,
        Ok(None) => return ApiError::not_found("Not found").into_response(),
        Err(err) => Err(err),
    };
    match fetched {
        Ok(material) => Json(material).into_response(),
        Err(err) => ApiError::from_db("Error fetching material", err).into_response(),
    }
}

doc_fn!(get_material_docs, op =>
    op.input::<Path<MaterialPath>>()
        .description("Get one wiki entry. An admin's read also carries editor_note.")
        .response::<200, Json<Material>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Entry not found"))
        .tag("Materials")
);

/// Answer a stored proposal with 202, or say why it was not stored.
fn proposal_reply(result: Result<Proposal, SubmitError>, what: &str) -> axum::response::Response {
    match result {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(SubmitError::OverLimit) => ApiError::too_many_requests(format!(
            "At most {} proposals per day and {} waiting for review",
            proposals::material::MAX_PER_DAY,
            proposals::material::MAX_PENDING
        ))
        .into_response(),
        Err(SubmitError::AlreadyPending) => {
            ApiError::conflict("You already have a change waiting for review on this entry")
                .with_target("id")
                .into_response()
        }
        Err(SubmitError::Gone) => ApiError::not_found("Not found").into_response(),
        Err(SubmitError::Db(err)) => ApiError::from_db(what, err).into_response(),
    }
}

/// Clean and check a body; the error is the 400 to answer.
fn checked(mut body: MaterialBody) -> Result<MaterialBody, ApiError> {
    body.normalize();
    match body.validation_error() {
        Some((field, message)) => Err(ApiError::validation(message).with_target(field)),
        None => Ok(body),
    }
}

/// The 409 for a body whose model, variant and size another entry holds.
async fn check_free(
    app: &AppState,
    body: &MaterialBody,
    except: Option<i64>,
) -> Result<(), ApiError> {
    match materials::key_taken(&app.pg_pool, body, except).await {
        Ok(false) => Ok(()),
        Ok(true) => Err(ApiError::conflict(DUPLICATE_MESSAGE)),
        Err(err) => Err(ApiError::from_db("Error checking material name", err)),
    }
}

pub async fn create_material(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(Proposable {
        body,
        proposal_note,
    }): Json<Proposable<MaterialBody>>,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };
    let note = match clean_note(proposal_note) {
        Ok(note) => note,
        Err(err) => return err.into_response(),
    };
    let body = match checked(body) {
        Ok(body) => body,
        Err(err) => return err.into_response(),
    };
    if let Err(err) = check_free(&app, &body, None).await {
        return err.into_response();
    }

    if !token.is_server_admin() {
        let mut body = body;
        body.editor_note = None;
        let data = serde_json::to_value(&body).unwrap_or_default();
        let result = proposals::material::submit(
            &app.pg_pool,
            "create",
            None,
            data,
            token.user_id(),
            note.as_deref(),
        )
        .await;
        return proposal_reply(result, "Error submitting material proposal");
    }

    let id = match materials::create(&app.pg_pool, &body, token.user_id()).await {
        Ok(id) => id,
        Err(CreateError::DailyLimit) => {
            return ApiError::too_many_requests(format!(
                "At most {MAX_NEW_PER_DAY} new entries per day"
            ))
            .into_response();
        }
        Err(CreateError::Db(err)) if is_unique_violation(&err) => {
            return ApiError::conflict(DUPLICATE_MESSAGE).into_response();
        }
        Err(CreateError::Db(err)) => {
            return ApiError::from_db("Error creating material", err).into_response();
        }
    };
    match materials::fetch(&app.pg_pool, id).await {
        Ok(Some(material)) => match with_editor_note(&app, Some(&token), material).await {
            Ok(material) => (StatusCode::CREATED, Json(material)).into_response(),
            Err(err) => ApiError::from_db("Error reading back material", err).into_response(),
        },
        Ok(None) => ApiError::internal().into_response(),
        Err(err) => ApiError::from_db("Error reading back material", err).into_response(),
    }
}

doc_fn!(create_material_docs, op =>
    op.description("Add an entry to the wiki (admin: immediate 201, other signed-in paddlers: proposal 202 for an admin to review)")
        .response::<201, Json<Material>>()
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid entry"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<409, Json<ErrorResponse>, _>(|res| res.description("Entry already exists"))
        .response_with::<429, Json<ErrorResponse>, _>(|res| res.description("Daily or pending limit reached"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Materials")
);

pub async fn update_material(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(MaterialPath { material_id }): Path<MaterialPath>,
    Json(Proposable {
        body,
        proposal_note,
    }): Json<Proposable<MaterialBody>>,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };
    let note = match clean_note(proposal_note) {
        Ok(note) => note,
        Err(err) => return err.into_response(),
    };
    let body = match checked(body) {
        Ok(body) => body,
        Err(err) => return err.into_response(),
    };
    if let Err(err) = check_free(&app, &body, Some(material_id)).await {
        return err.into_response();
    }

    if !token.is_server_admin() {
        let mut body = body;
        body.editor_note = None;
        let data = serde_json::to_value(&body).unwrap_or_default();
        let result = proposals::material::submit(
            &app.pg_pool,
            "update",
            Some(material_id),
            data,
            token.user_id(),
            note.as_deref(),
        )
        .await;
        return proposal_reply(result, "Error submitting material update proposal");
    }

    match materials::update(&app.pg_pool, material_id, &body, token.user_id()).await {
        Ok(true) => match materials::fetch(&app.pg_pool, material_id).await {
            Ok(Some(material)) => match with_editor_note(&app, Some(&token), material).await {
                Ok(material) => Json(material).into_response(),
                Err(err) => ApiError::from_db("Error reading back material", err).into_response(),
            },
            Ok(None) => ApiError::not_found("Not found").into_response(),
            Err(err) => ApiError::from_db("Error reading back material", err).into_response(),
        },
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) if is_unique_violation(&err) => {
            ApiError::conflict(DUPLICATE_MESSAGE).into_response()
        }
        Err(err) => ApiError::from_db("Error updating material", err).into_response(),
    }
}

doc_fn!(update_material_docs, op =>
    op.input::<Path<MaterialPath>>()
        .description("Replace an entry (admin: immediate 200, other signed-in paddlers: proposal 202 for an admin to review). An approved proposal replaces the entry as stored, whatever changed since.")
        .response::<200, Json<Material>>()
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid entry"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Entry not found"))
        .response_with::<409, Json<ErrorResponse>, _>(|res| res.description("Entry already exists"))
        .response_with::<429, Json<ErrorResponse>, _>(|res| res.description("Daily or pending limit reached"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Materials")
);

pub async fn delete_material(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(MaterialPath { material_id }): Path<MaterialPath>,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };

    // Removing an entry takes it away from everyone, so only an admin does it
    // outright; anyone else proposes it.
    if !token.is_server_admin() {
        let result = proposals::material::submit(
            &app.pg_pool,
            "delete",
            Some(material_id),
            serde_json::json!({}),
            token.user_id(),
            None,
        )
        .await;
        return proposal_reply(result, "Error submitting material delete proposal");
    }

    match materials::delete(&app.pg_pool, material_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => ApiError::from_db("Error deleting material", err).into_response(),
    }
}

doc_fn!(delete_material_docs, op =>
    op.input::<Path<MaterialPath>>()
        .description("Delete a wiki entry (admin: immediate 204, other signed-in paddlers: proposal 202 for an admin to review)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Proposal submitted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Entry not found"))
        .response_with::<429, Json<ErrorResponse>, _>(|res| res.description("Daily or pending limit reached"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Materials")
);

/// Mounts the wiki at `/materials`, or leaves `app` alone when it is off so
/// every wiki path is a 404.
pub fn mount_materials<S>(
    app: aide::axum::ApiRouter<S>,
    enabled: bool,
    state: AppState,
) -> aide::axum::ApiRouter<S>
where
    S: Clone + Send + Sync + 'static,
{
    if !enabled {
        return app;
    }
    app.nest_api_service(
        "/materials",
        materials_routes(state).layer(axum::middleware::from_fn(crate::metrics::tag_route)),
    )
}

pub fn materials_routes(state: AppState) -> aide::axum::ApiRouter {
    use aide::axum::routing::{delete_with, get_with, post_with};

    aide::axum::ApiRouter::new()
        .api_route(
            "/",
            get_with(list_materials, list_materials_docs)
                .post_with(create_material, create_material_docs),
        )
        .api_route("/brands", get_with(list_brands, list_brands_docs))
        .api_route(
            "/models",
            get_with(models::list_models, models::list_models_docs),
        )
        .api_route("/tree", get_with(tree::get_tree, tree::get_tree_docs))
        .api_route(
            "/images",
            delete_with(
                images::remove_brand_images,
                images::remove_brand_images_docs,
            ),
        )
        .api_route(
            "/{material_id}/images",
            post_with(photos::add_photo, photos::add_photo_docs)
                .layer(crate::routes::waterways::media::upload_body_limit()),
        )
        .api_route(
            "/{material_id}/images/{image_id}",
            delete_with(images::remove_image, images::remove_image_docs),
        )
        .api_route(
            "/{material_id}/images/{image_id}/preview",
            get_with(photos::preview_photo, photos::preview_photo_docs),
        )
        .api_route(
            "/{material_id}",
            get_with(get_material, get_material_docs)
                .put_with(update_material, update_material_docs)
                .delete_with(delete_material, delete_material_docs),
        )
        .with_state(state)
}
