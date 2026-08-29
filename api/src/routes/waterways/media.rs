use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{FromRequest, Multipart, Path, Request, State},
    http::StatusCode,
    response::IntoResponse,
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    media::{self, MAX_UPLOAD_BYTES},
    models::{
        media_item::{Media, MediaDetails, MediaEntityType, MediaKind},
        path_params::{WaterwayMediaPath, WaterwayPath},
    },
    query::media::{self as media_query, NewMedia},
    state::AppState,
};

/// aide cannot describe `Multipart`, so uploads take it through a wrapper
/// that contributes nothing to the schema. The operation's description
/// carries the part names instead.
pub struct MediaUpload(pub Multipart);

impl<S: Send + Sync> FromRequest<S> for MediaUpload {
    type Rejection = <Multipart as FromRequest<S>>::Rejection;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        Ok(Self(Multipart::from_request(req, state).await?))
    }
}

impl aide::OperationInput for MediaUpload {}

pub async fn list_waterway_media(
    State(app): State<AppState>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
) -> impl IntoApiResponse {
    match media_query::list_media(&app.pg_pool, MediaEntityType::Waterway, waterway_id).await {
        Ok(list) => Json(list).into_response(),
        Err(err) => {
            tracing::error!("Error listing media for river {}: {}", waterway_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(list_waterway_media_docs, op =>
    op.description("Photos, videos and linked write-ups for a river, in gallery order")
        .response::<200, Json<Vec<Media>>>()
        .tag("Media")
);

/// Everything the multipart form can carry.
#[derive(Default)]
struct UploadForm {
    file: Option<Vec<u8>>,
    kind: Option<String>,
    url: Option<String>,
    details: MediaDetails,
}

async fn read_form(multipart: &mut Multipart) -> Result<UploadForm, ApiError> {
    let mut form = UploadForm::default();
    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(err) => return Err(ApiError::validation(format!("Malformed upload: {err}"))),
        };
        let name = field.name().map(str::to_string);
        match name.as_deref() {
            Some("file") => {
                let bytes = field.bytes().await.map_err(|err| {
                    ApiError::validation(format!("Could not read the file: {err}"))
                })?;
                if bytes.len() > MAX_UPLOAD_BYTES {
                    return Err(
                        ApiError::validation("Image must be 8 MB or smaller").with_target("file")
                    );
                }
                form.file = Some(bytes.to_vec());
            }
            Some(text_field) => {
                let value = field.text().await.unwrap_or_default();
                let value = value.trim().to_string();
                let filled = (!value.is_empty()).then_some(value.clone());
                match text_field {
                    "kind" => form.kind = filled,
                    "url" => form.url = filled,
                    "caption" => form.details.caption = filled,
                    "copyright" => form.details.copyright = filled,
                    "license_name" => form.details.license_name = filled,
                    "license_url" => form.details.license_url = filled,
                    "weight" => form.details.weight = value.parse().ok(),
                    _ => {}
                }
            }
            None => {}
        }
    }
    Ok(form)
}

pub async fn add_waterway_media(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(WaterwayPath { waterway_id }): Path<WaterwayPath>,
    MediaUpload(mut multipart): MediaUpload,
) -> impl IntoApiResponse {
    let Some(Extension(token)) = auth else {
        return ApiError::unauthorized("Authentication required").into_response();
    };

    let form = match read_form(&mut multipart).await {
        Ok(form) => form,
        Err(err) => return err.into_response(),
    };

    let kind = match form.kind.as_deref() {
        None => MediaKind::Photo,
        Some(raw) => match MediaKind::parse(raw) {
            Some(kind) => kind,
            None => {
                return ApiError::validation("kind must be 'photo', 'video' or 'blog'")
                    .with_target("kind")
                    .into_response();
            }
        },
    };

    // A photo is a file we store; a video or blog is somebody else's URL.
    let stored = if kind == MediaKind::Photo {
        let Some(bytes) = form.file.as_deref() else {
            return ApiError::validation("A 'file' part is required for a photo")
                .with_target("file")
                .into_response();
        };
        // Decoding is also the validation: whatever the request claimed,
        // only real images get past this.
        match media::store_image(bytes).await {
            Ok(stored) => Some(stored),
            Err(err) => {
                return ApiError::validation(err.to_string())
                    .with_target("file")
                    .into_response();
            }
        }
    } else {
        match form.url.as_deref() {
            None => {
                return ApiError::validation("A 'url' is required for a video or blog")
                    .with_target("url")
                    .into_response();
            }
            Some(url) if !url.starts_with("https://") && !url.starts_with("http://") => {
                return ApiError::validation("url must be http(s)")
                    .with_target("url")
                    .into_response();
            }
            Some(_) => None,
        }
    };

    let new = NewMedia {
        entity_type: MediaEntityType::Waterway,
        entity_id: waterway_id,
        kind,
        storage_key: stored.as_ref().map(|s| s.storage_key.as_str()),
        external_url: stored.is_none().then_some(form.url.as_deref()).flatten(),
        mime_type: stored.as_ref().map(|s| s.mime_type.as_str()),
        width: stored.as_ref().map(|s| s.width as i32),
        height: stored.as_ref().map(|s| s.height as i32),
        byte_size: stored.as_ref().map(|s| s.byte_size as i64),
        details: form.details,
        uploaded_by: token.user_id(),
    };

    match media_query::insert_media(&app.pg_pool, new).await {
        Ok(item) => (StatusCode::CREATED, Json(item)).into_response(),
        Err(err) => {
            // The row is what makes the file reachable; without it the file
            // is litter, so take it back out.
            if let Some(stored) = &stored {
                media::delete_image(&stored.storage_key).await;
            }
            tracing::error!("Error storing media for river {}: {}", waterway_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(add_waterway_media_docs, op =>
    op.description("Add a photo, video or write-up to a river. Multipart: 'kind' (photo, default / video / blog), a 'file' part for a photo (jpeg, png or webp, 8 MB max) or a 'url' for a video or blog, plus optional 'caption', 'copyright', 'license_name', 'license_url' and 'weight'. An uploaded photo is re-encoded, which strips EXIF and caps it at 1600px.")
        .response_with::<201, Json<Media>, _>(|res| res.description("Media added"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Not a readable image, too large, or a bad url"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Media")
);

pub async fn delete_waterway_media(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(WaterwayMediaPath { media_id, .. }): Path<WaterwayMediaPath>,
) -> impl IntoApiResponse {
    let Some(Extension(token)) = auth else {
        return ApiError::unauthorized("Authentication required").into_response();
    };

    match media_query::delete_media(
        &app.pg_pool,
        media_id,
        token.user_id(),
        token.is_server_admin(),
    )
    .await
    {
        Ok(Some(storage_key)) => {
            if let Some(key) = storage_key {
                media::delete_image(&key).await;
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(None) => ApiError::not_found("Not found").into_response(),
        Err(err) => {
            tracing::error!("Error deleting media {}: {}", media_id, err);
            ApiError::internal().into_response()
        }
    }
}

doc_fn!(delete_waterway_media_docs, op =>
    op.description("Delete a river photo, video or write-up (uploader or admin)")
        .response_with::<204, (), _>(|res| res.description("Deleted"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Media not found"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Media")
);
