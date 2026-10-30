use aide::axum::IntoApiResponse;
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
    },
    query::{
        is_unique_violation,
        materials::{self, CreateError, MAX_COMPARE_IDS, MAX_NEW_PER_DAY},
    },
    routes::access,
    state::AppState,
};

/// The message an entry that already exists gets. The unique index folds case
/// and spacing, so "already there" can mean a differently written duplicate.
const DUPLICATE_MESSAGE: &str =
    "This brand, model and variant is already in the wiki - edit that entry instead";

/// Reject search text and brand filters long enough to be abuse.
fn check_filters(filters: &MaterialFilters) -> Result<(), ApiError> {
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
        Err(err) => {
            tracing::error!("Error listing material brands: {}", err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_brands_docs, op =>
    op.description("Brands in the wiki with their entry counts, most entries first")
        .response::<200, Json<Vec<MaterialBrand>>>()
        .tag("Materials")
);

pub async fn get_material(
    State(app): State<AppState>,
    Path(MaterialPath { material_id }): Path<MaterialPath>,
) -> impl IntoApiResponse {
    match materials::fetch(&app.pg_pool, material_id).await {
        Ok(Some(material)) => Json(material).into_response(),
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error fetching material {}: {}", material_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(get_material_docs, op =>
    op.input::<Path<MaterialPath>>()
        .description("Get one wiki entry")
        .response::<200, Json<Material>>()
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Entry not found"))
        .tag("Materials")
);

pub async fn create_material(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Json(mut body): Json<MaterialBody>,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };

    body.normalize();
    if let Some((field, message)) = body.validation_error() {
        return ApiError::validation(message)
            .with_target(field)
            .into_response();
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
        Ok(Some(material)) => (StatusCode::CREATED, Json(material)).into_response(),
        Ok(None) => ApiError::internal().into_response(),
        Err(err) => ApiError::from_db("Error reading back material", err).into_response(),
    }
}

doc_fn!(create_material_docs, op =>
    op.description("Add an entry to the wiki. Any signed-in paddler may add one.")
        .response::<201, Json<Material>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid entry"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<409, Json<ErrorResponse>, _>(|res| res.description("Entry already exists"))
        .response_with::<429, Json<ErrorResponse>, _>(|res| res.description("Daily limit of new entries reached"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Materials")
);

pub async fn update_material(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(MaterialPath { material_id }): Path<MaterialPath>,
    Json(mut body): Json<MaterialBody>,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };

    body.normalize();
    if let Some((field, message)) = body.validation_error() {
        return ApiError::validation(message)
            .with_target(field)
            .into_response();
    }

    match materials::update(&app.pg_pool, material_id, &body, token.user_id()).await {
        Ok(true) => match materials::fetch(&app.pg_pool, material_id).await {
            Ok(Some(material)) => Json(material).into_response(),
            Ok(None) => ApiError::not_found("Not found").into_response(),
            Err(err) => {
                tracing::error!("Error reading back material {}: {}", material_id, err);
                ApiError::internal().into_response()
            }
        },
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) if is_unique_violation(&err) => {
            ApiError::conflict(DUPLICATE_MESSAGE).into_response()
        }
        Err(err) => {
            tracing::error!("Error updating material {}: {}", material_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(update_material_docs, op =>
    op.input::<Path<MaterialPath>>()
        .description("Replace an entry. Any signed-in paddler may correct one - the wiki keeps who last did.")
        .response::<200, Json<Material>>()
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Invalid entry"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Entry not found"))
        .response_with::<409, Json<ErrorResponse>, _>(|res| res.description("Entry already exists"))
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
    // Removing an entry takes it away from everyone, unlike an edit, which
    // the next reader can correct again.
    if let Err(err) = access::require_server_admin(&token, "Not permitted") {
        return err.into_response();
    }

    match materials::delete(&app.pg_pool, material_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting material {}: {}", material_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_material_docs, op =>
    op.input::<Path<MaterialPath>>()
        .description("Delete a wiki entry (admin only)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<403, Json<ErrorResponse>, _>(|res| res.description("Forbidden"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Entry not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Materials")
);

pub fn materials_routes(state: AppState) -> aide::axum::ApiRouter {
    use aide::axum::routing::get_with;

    aide::axum::ApiRouter::new()
        .api_route(
            "/",
            get_with(list_materials, list_materials_docs)
                .post_with(create_material, create_material_docs),
        )
        .api_route("/brands", get_with(list_brands, list_brands_docs))
        .api_route(
            "/{material_id}",
            get_with(get_material, get_material_docs)
                .put_with(update_material, update_material_docs)
                .delete_with(delete_material, delete_material_docs),
        )
        .with_state(state)
}
