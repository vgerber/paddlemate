//! Puts the error envelope on the rejections axum produces itself.
//!
//! A malformed query string, path or JSON body is turned away by an extractor
//! before any handler runs, with a plain text body. Clients read
//! `error.code`, so those answers are rewrapped here, once, for every route.

use axum::{
    body::to_bytes,
    extract::Request,
    http::{StatusCode, header::CONTENT_TYPE},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::error::ApiError;

/// Rejection messages are one short line.
const MAX_MESSAGE_BYTES: usize = 2048;

/// The field a rejection names, from "missing field `bbox`" or
/// "unknown field `x`".
fn field_of(message: &str) -> Option<&str> {
    let rest = message.split_once("field `")?.1;
    rest.split_once('`').map(|(field, _)| field)
}

/// Rewrap a plain text 400 or 422 as a validation error. Responses that are
/// already JSON (every handler's own errors) pass untouched.
pub async fn envelope_rejections(req: Request, next: Next) -> Response {
    let res = next.run(req).await;
    let rejected = matches!(
        res.status(),
        StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY
    );
    let plain = res
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("text/plain"));
    if !(rejected && plain) {
        return res;
    }
    let bytes = to_bytes(res.into_body(), MAX_MESSAGE_BYTES)
        .await
        .unwrap_or_default();
    let message = String::from_utf8_lossy(&bytes).into_owned();
    let mut err = ApiError::validation(message.clone());
    if let Some(field) = field_of(&message) {
        err = err.with_target(field);
    }
    err.into_response()
}

#[cfg(test)]
mod tests {
    use super::field_of;

    #[test]
    fn names_the_field_a_rejection_is_about() {
        let msg = "Failed to deserialize query string: missing field `bbox`";
        assert_eq!(field_of(msg), Some("bbox"));
        assert_eq!(field_of("page: invalid digit found in string"), None);
    }
}
