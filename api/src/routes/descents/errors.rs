use crate::error::ApiError;

/// Turn the constraint violations a client can actually cause into validation
/// errors. Returns None for anything else, which stays an internal error.
pub(super) fn db_constraint_response(err: &sqlx::Error) -> Option<axum::response::Response> {
    use axum::response::IntoResponse;
    if let sqlx::Error::Database(db_err) = err {
        match db_err.code().as_deref() {
            // CHECK constraint violation
            Some("23514") => {
                return Some(
                    ApiError::validation(
                        db_err
                            .constraint()
                            .map(constraint_message)
                            .unwrap_or("Constraint violation"),
                    )
                    .into_response(),
                );
            }
            // Foreign key violation - invalid section_id, feature_id, user_id, or group_id
            Some("23503") => {
                return Some(
                    ApiError::validation("Referenced resource does not exist").into_response(),
                );
            }
            _ => {}
        }
    }
    None
}

pub(super) fn constraint_message(name: &str) -> &'static str {
    match name {
        "chk_descent_times" => "end_time must be on or after start_time",
        "chk_descent_put_in" => {
            "put_in must specify either feature_id or lat+lon, not both or neither"
        }
        "chk_descent_take_out" => {
            "take_out must specify either feature_id or lat+lon, not both or neither"
        }
        _ => "Constraint violation",
    }
}

#[cfg(test)]
mod tests {
    use super::constraint_message;

    #[test]
    fn known_constraints_explain_themselves() {
        assert!(constraint_message("chk_descent_times").contains("start_time"));
        assert!(constraint_message("chk_descent_put_in").contains("put_in"));
        assert_eq!(constraint_message("something_else"), "Constraint violation");
    }
}
