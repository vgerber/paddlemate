use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{FromRequest, Multipart, Path, Request, State},
    http::StatusCode,
    response::IntoResponse,
};

/// aide cannot describe `Multipart`, so the upload takes it through a
/// wrapper that contributes nothing to the schema. The operation's
/// description carries the part names instead.
pub struct ImageUpload(pub Multipart);

impl<S: Send + Sync> FromRequest<S> for ImageUpload {
    type Rejection = <Multipart as FromRequest<S>>::Rejection;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        Ok(Self(Multipart::from_request(req, state).await?))
    }
}

impl aide::OperationInput for ImageUpload {}

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    media::{self, MAX_UPLOAD_BYTES},
    models::{
        image::{Image, ImageEntityType},
        path_params::{WaterwayImagePath, WaterwayPath},
    },
    query::images,
    state::AppState,
};

pub async fn list_waterway_images(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
) -> impl IntoApiResponse {
    match images::list_images(&app.pg_pool, ImageEntityType::Waterway, waterway_id).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing images for river {}: {}", waterway_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_waterway_images_docs, op =>
    op.description("Photos of a river, newest first")
        .response::<200, Json<Vec<Image>>>()
        .tag("Images")
);

pub async fn upload_waterway_image(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
    ImageUpload(mut multipart): ImageUpload,
) -> impl IntoApiResponse {
    let Some(Extension(token)) = auth else {
        return ApiError::unauthorized("Authentication required").into_response();
    };

    let mut file: Option<Vec<u8>> = None;
    let mut caption: Option<String> = None;
    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(err) => {
                return ApiError::validation(format!("Malformed upload: {err}")).into_response();
            }
        };
        match field.name() {
            Some("file") => match field.bytes().await {
                Ok(bytes) if bytes.len() > MAX_UPLOAD_BYTES => {
                    return ApiError::validation("Image must be 8 MB or smaller")
                        .with_target("file")
                        .into_response();
                }
                Ok(bytes) => file = Some(bytes.to_vec()),
                Err(err) => {
                    return ApiError::validation(format!("Could not read the file: {err}"))
                        .with_target("file")
                        .into_response();
                }
            },
            Some("caption") => caption = field.text().await.ok().filter(|t| !t.trim().is_empty()),
            _ => {}
        }
    }

    let Some(bytes) = file else {
        return ApiError::validation("A 'file' part is required")
            .with_target("file")
            .into_response();
    };

    // Decoding is also the validation: whatever the request claimed, only
    // real images get past this.
    let stored = match media::store_image(&bytes).await {
        Ok(stored) => stored,
        Err(err) => {
            return ApiError::validation(err.to_string())
                .with_target("file")
                .into_response();
        }
    };

    match images::insert_image(
        &app.pg_pool,
        ImageEntityType::Waterway,
        waterway_id,
        &stored.storage_key,
        &stored.mime_type,
        stored.width as i32,
        stored.height as i32,
        stored.byte_size as i64,
        caption.as_deref(),
        token.user_id(),
    )
    .await
    {
        Ok(image) => (StatusCode::CREATED, Json(image)).into_response(),
        Err(err) => {
            // The row is what makes the file reachable; without it the file
            // is litter, so take it back out.
            media::delete_image(&stored.storage_key).await;
            tracing::error!("Error storing image for river {}: {}", waterway_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(upload_waterway_image_docs, op =>
    op.description("Upload a photo of a river. Multipart with a 'file' part (jpeg, png or webp, 8 MB max) and an optional 'caption'. The image is re-encoded, which strips EXIF and caps it at 1600px.")
        .response_with::<201, Json<Image>, _>(|res| res.description("Image stored"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Not a readable image, or too large"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Images")
);

pub async fn delete_waterway_image(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(WaterwayImagePath { image_id, .. }): Path<WaterwayImagePath>,
) -> impl IntoApiResponse {
    let Some(Extension(token)) = auth else {
        return ApiError::unauthorized("Authentication required").into_response();
    };

    match images::delete_image(
        &app.pg_pool,
        image_id,
        token.user_id(),
        token.is_server_admin(),
    )
    .await
    {
        Ok(Some(storage_key)) => {
            media::delete_image(&storage_key).await;
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting image {}: {}", image_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_waterway_image_docs, op =>
    op.description("Delete a river photo (uploader or admin)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Image not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Images")
);
