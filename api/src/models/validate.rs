//! Length checks shared by the write routes, each a 400 naming the field.

use crate::error::ApiError;

/// `text` may hold at most `max` characters. `label` opens the message,
/// `target` names the field in the error.
pub fn max_chars(label: &str, target: &str, text: &str, max: usize) -> Result<(), ApiError> {
    if text.chars().count() > max {
        return Err(
            ApiError::validation(format!("{label} must be at most {max} characters"))
                .with_target(target),
        );
    }
    Ok(())
}

/// `text` must say something once trimmed.
pub fn not_blank(label: &str, target: &str, text: &str) -> Result<(), ApiError> {
    if text.trim().is_empty() {
        return Err(ApiError::validation(format!("{label} must not be empty")).with_target(target));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_chars_counts_characters() {
        assert!(max_chars("Name", "name", "aaaa", 4).is_ok());
        assert!(max_chars("Name", "name", "aaaaa", 4).is_err());
        assert!(max_chars("Name", "name", "aa\u{e4}\u{e4}", 4).is_ok());
    }

    #[test]
    fn not_blank_trims() {
        assert!(not_blank("Name", "name", "a").is_ok());
        assert!(not_blank("Name", "name", "  ").is_err());
    }
}
