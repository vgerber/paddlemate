//! The error body every failing request returns.
//!
//! Clients get a machine readable `code` they can branch on and a `message`
//! meant for a human, instead of a bare status and a sentence of plain text.
//! Validation problems also name the offending field in `target`.

use axum::{Json, http::StatusCode, response::IntoResponse};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Wrapper object, so that a body can grow more members later without
/// breaking clients that read `error`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ErrorResponse {
    pub error: ErrorBody,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ErrorBody {
    /// Stable identifier, e.g. "not_found" or "validation_failed".
    pub code: String,
    /// Human readable explanation. Not stable, do not parse it.
    pub message: String,
    /// The request field the error refers to, when it is about one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

/// A failure that is ready to be returned from a handler.
#[derive(Debug, Clone)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
    target: Option<String>,
}

impl ApiError {
    fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            target: None,
        }
    }

    /// Name the request field this error is about.
    pub fn with_target(mut self, target: impl Into<String>) -> Self {
        self.target = Some(target.into());
        self
    }

    /// The request itself is malformed or fails a rule. Used for every
    /// validation failure, so clients only have one status to handle.
    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "validation_failed", message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthorized", message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "forbidden", message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, "conflict", message)
    }

    pub fn too_many_requests(message: impl Into<String>) -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, "too_many_requests", message)
    }

    /// Something broke on our side. The cause belongs in the log, not in the
    /// response, so the message stays deliberately vague.
    pub fn internal() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
            "The request could not be completed",
        )
    }

    /// Log the cause and return the opaque internal error. Keeps the two from
    /// drifting apart at the ~100 call sites that need both.
    pub fn from_db(context: &str, err: impl std::fmt::Display) -> Self {
        tracing::error!("{}: {}", context, err);
        Self::internal()
    }

    pub fn status(&self) -> StatusCode {
        self.status
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            Json(ErrorResponse {
                error: ErrorBody {
                    code: self.code.to_string(),
                    message: self.message,
                    target: self.target,
                },
            }),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::ApiError;
    use axum::http::StatusCode;

    #[test]
    fn validation_errors_use_400_not_422() {
        assert_eq!(
            ApiError::validation("bad").status(),
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn internal_errors_do_not_leak_the_cause() {
        let err = ApiError::from_db("loading section", "relation does not exist");
        assert_eq!(err.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert!(!format!("{err:?}").contains("relation does not exist"));
    }
}
