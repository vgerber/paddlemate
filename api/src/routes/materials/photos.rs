//! Photo upload to a wiki entry. An admin's photo is live at once; anyone
//! else's waits for review as a `material_photo` proposal and answers 202.

use aide::axum::IntoApiResponse;
use axum::{
    Extension, Json,
    extract::{Multipart, Path, State},
    http::{StatusCode, header},
    response::IntoResponse,
};

use crate::{
    doc_fn,
    error::{ApiError, ErrorResponse},
    layers::auth::AuthToken,
    media::{self, MAX_UPLOAD_BYTES},
    models::{
        material::MaterialImage,
        path_params::{MaterialImagePath, MaterialPath},
        proposal::{Proposal, clean_note},
    },
    query::{
        materials::photos::{self, MAX_CREDIT_CHARS, UploadError},
        proposals,
    },
    routes::{access, waterways::media::MediaUpload},
    state::AppState,
};

#[derive(Default)]
struct PhotoForm {
    file: Option<Vec<u8>>,
    credit: Option<String>,
    rights_confirmed: bool,
    note: Option<String>,
}

async fn read_form(multipart: &mut Multipart) -> Result<PhotoForm, ApiError> {
    let mut form = PhotoForm::default();
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
            Some(text_field @ ("credit" | "rights_confirmed" | "proposal_note")) => {
                let value = field.text().await.unwrap_or_default();
                let value = value.trim().to_string();
                match text_field {
                    "credit" => form.credit = (!value.is_empty()).then_some(value),
                    "rights_confirmed" => form.rights_confirmed = value == "true",
                    _ => form.note = (!value.is_empty()).then_some(value),
                }
            }
            _ => {}
        }
    }
    Ok(form)
}

fn upload_error(err: UploadError, what: &str) -> axum::response::Response {
    match err {
        UploadError::OverLimit(message) => ApiError::too_many_requests(message).into_response(),
        UploadError::Gone => ApiError::not_found("Not found").into_response(),
        UploadError::Db(err) => ApiError::from_db(what, err).into_response(),
    }
}

pub async fn add_photo(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(MaterialPath { material_id }): Path<MaterialPath>,
    MediaUpload(mut multipart): MediaUpload,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };
    let form = match read_form(&mut multipart).await {
        Ok(form) => form,
        Err(err) => return err.into_response(),
    };
    if !form.rights_confirmed {
        return ApiError::validation("Confirm that the photo is yours or that you may share it")
            .with_target("rights_confirmed")
            .into_response();
    }
    if let Some(credit) = &form.credit {
        if credit.chars().count() > MAX_CREDIT_CHARS || credit.chars().any(char::is_control) {
            return ApiError::validation(format!(
                "credit must be at most {MAX_CREDIT_CHARS} characters on one line"
            ))
            .with_target("credit")
            .into_response();
        }
    }
    let Some(bytes) = form.file.as_deref() else {
        return ApiError::validation("A 'file' part is required")
            .with_target("file")
            .into_response();
    };
    let note = match clean_note(form.note.clone()) {
        Ok(note) => note,
        Err(err) => return err.into_response(),
    };
    let admin = token.is_server_admin();
    let user_id = token.user_id();

    // Refuse before the CPU work when the caps are already hit; the caps are
    // checked again under their locks when the row goes in.
    let early = match app.pg_pool.acquire().await {
        Ok(mut conn) => photos::check_in(&mut conn, material_id, user_id, admin, false).await,
        Err(err) => Err(UploadError::Db(err)),
    };
    if let Err(err) = early {
        return upload_error(err, "Error checking photo caps");
    }

    // Decoding is the validation: only real images get past this.
    let stored = match media::store_image(bytes).await {
        Ok(stored) => stored,
        Err(err) => {
            return ApiError::validation(err.to_string())
                .with_target("file")
                .into_response();
        }
    };
    let credit = match form.credit {
        Some(credit) => credit,
        None => match photos::username(&app.pg_pool, user_id).await {
            Ok(name) => name.chars().take(MAX_CREDIT_CHARS).collect(),
            Err(err) => {
                media::delete_image(&stored.storage_key).await;
                return ApiError::from_db("Error reading the uploader", err).into_response();
            }
        },
    };

    if admin {
        let result = photos::add_live(&app.pg_pool, material_id, &stored, &credit, user_id).await;
        return match result {
            Ok(image) => (StatusCode::CREATED, Json(image)).into_response(),
            Err(err) => {
                media::delete_image(&stored.storage_key).await;
                upload_error(err, "Error storing material photo")
            }
        };
    }
    let result = proposals::material::submit_photo(
        &app.pg_pool,
        material_id,
        &stored,
        &credit,
        user_id,
        note.as_deref(),
    )
    .await;
    match result {
        Ok(proposal) => (StatusCode::ACCEPTED, Json(proposal)).into_response(),
        Err(err) => {
            media::delete_image(&stored.storage_key).await;
            upload_error(err, "Error submitting material photo")
        }
    }
}

doc_fn!(add_photo_docs, op =>
    op.input::<Path<MaterialPath>>()
        .description("Add a photo to an entry. Multipart: a 'file' part (jpeg, png, webp or gif, 8 MB max; re-encoded, which strips EXIF and caps it at 1600px), 'rights_confirmed=true' (the photo is yours or you may share it; required), optional 'credit' (80 characters, default the uploader's username) and, for non-admins, 'proposal_note'. The photo shows on every size of the model. An admin's photo is live (201); anyone else's waits for review as a proposal (202). Caps: 10 photos per day, 5 waiting, 6 uploaded per model (429).")
        .response_with::<201, Json<MaterialImage>, _>(|res| res.description("Photo added"))
        .response_with::<202, Json<Proposal>, _>(|res| res.description("Sent for review"))
        .response_with::<400, Json<ErrorResponse>, _>(|res| res.description("Not a readable image, too large, or the rights statement missing"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("Entry not found"))
        .response_with::<429, Json<ErrorResponse>, _>(|res| res.description("Over a photo cap"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Materials")
);

pub async fn preview_photo(
    State(app): State<AppState>,
    auth: Option<Extension<AuthToken>>,
    Path(MaterialImagePath {
        material_id,
        image_id,
    }): Path<MaterialImagePath>,
) -> impl IntoApiResponse {
    let token = match access::signed_in(auth) {
        Ok(token) => token,
        Err(err) => return err.into_response(),
    };
    let file = photos::preview_file(
        &app.pg_pool,
        material_id,
        image_id,
        token.user_id(),
        token.is_server_admin(),
    )
    .await;
    let file = match file {
        Ok(Some(file)) => file,
        Ok(None) => return ApiError::not_found("Not found").into_response(),
        Err(err) => return ApiError::from_db("Error reading photo preview", err).into_response(),
    };
    match tokio::fs::read(media::media_dir().join(&file)).await {
        Ok(bytes) => (
            [
                (header::CONTENT_TYPE, "image/jpeg"),
                (header::CACHE_CONTROL, "private, no-store"),
            ],
            bytes,
        )
            .into_response(),
        Err(_) => ApiError::not_found("Not found").into_response(),
    }
}

doc_fn!(preview_photo_docs, op =>
    op.input::<Path<MaterialImagePath>>()
        .description("The image of a photo that is still waiting for review (its uploader or an admin only). Not cached.")
        .response_with::<200, Vec<u8>, _>(|res| res.description("The JPEG"))
        .response_with::<401, Json<ErrorResponse>, _>(|res| res.description("Unauthorized"))
        .response_with::<404, Json<ErrorResponse>, _>(|res| res.description("No such photo under review, or not yours"))
        .security_requirement_multi(["Bearer", "ApiKey"])
        .tag("Materials")
);
