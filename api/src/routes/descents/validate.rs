use crate::{error::ApiError, models::validate::max_chars};

/// Longest name or place label; matches the `name` column.
const MAX_NAME_CHARS: usize = 255;
/// Longest note.
const MAX_NOTE_CHARS: usize = 10_000;

pub(super) fn check_text(field: &str, text: Option<&str>, max: usize) -> Result<(), ApiError> {
    match text {
        Some(t) => max_chars(field, field, t, max),
        None => Ok(()),
    }
}

pub(super) fn check_point(
    field: &str,
    label: Option<&str>,
    lat: Option<f64>,
    lon: Option<f64>,
) -> Result<(), ApiError> {
    check_text(&format!("{field}_label"), label, MAX_NAME_CHARS)?;
    if lat.is_some_and(|v| !(-90.0..=90.0).contains(&v)) {
        return Err(ApiError::validation("Latitude must be between -90 and 90")
            .with_target(format!("{field}_lat")));
    }
    if lon.is_some_and(|v| !(-180.0..=180.0).contains(&v)) {
        return Err(
            ApiError::validation("Longitude must be between -180 and 180")
                .with_target(format!("{field}_lon")),
        );
    }
    Ok(())
}

/// Bounds on the free text and coordinates of a create or patch body.
pub(super) fn check_fields(
    name: Option<&str>,
    note: Option<&str>,
    put_in: (Option<&str>, Option<f64>, Option<f64>),
    take_out: (Option<&str>, Option<f64>, Option<f64>),
) -> Result<(), ApiError> {
    check_text("name", name, MAX_NAME_CHARS)?;
    check_text("note", note, MAX_NOTE_CHARS)?;
    check_point("put_in", put_in.0, put_in.1, put_in.2)?;
    check_point("take_out", take_out.0, take_out.1, take_out.2)
}

/// Sections are numbered from 1; the column check would only say so generically.
pub(super) fn check_section_order(
    sections: &[crate::models::descent::DescentSectionInput],
) -> Result<(), ApiError> {
    if sections.iter().any(|s| s.sort_order < 1) {
        return Err(ApiError::validation("sort_order must be at least 1")
            .with_target("sections.sort_order"));
    }
    Ok(())
}

pub(super) fn validate_put_in(feature_id: Option<i64>, lat: Option<f64>, lon: Option<f64>) -> bool {
    matches!(
        (feature_id.is_some(), lat.is_some(), lon.is_some()),
        (true, false, false) | (false, true, true)
    )
}

#[cfg(test)]
mod tests {
    use super::{check_fields, validate_put_in};

    #[test]
    fn a_point_is_either_a_feature_or_coordinates() {
        assert!(validate_put_in(Some(1), None, None));
        assert!(validate_put_in(None, Some(47.0), Some(11.0)));
    }

    #[test]
    fn a_point_is_never_both_partial_nor_empty() {
        assert!(!validate_put_in(None, None, None), "nothing given");
        assert!(
            !validate_put_in(Some(1), Some(47.0), Some(11.0)),
            "both given"
        );
        assert!(!validate_put_in(None, Some(47.0), None), "latitude only");
        assert!(!validate_put_in(None, None, Some(11.0)), "longitude only");
    }

    #[test]
    fn text_and_coordinates_are_bounded() {
        let none = (None, None, None);
        assert!(check_fields(Some(&"n".repeat(255)), None, none, none).is_ok());
        assert!(check_fields(Some(&"n".repeat(256)), None, none, none).is_err());
        assert!(check_fields(None, Some(&"n".repeat(10_001)), none, none).is_err());
        assert!(check_fields(None, None, (Some(&"l".repeat(256)), None, None), none).is_err());
        assert!(check_fields(None, None, (None, Some(90.0), Some(-180.0)), none).is_ok());
        assert!(check_fields(None, None, (None, Some(999.0), Some(10.0)), none).is_err());
        assert!(check_fields(None, None, none, (None, Some(10.0), Some(181.0))).is_err());
        assert!(check_fields(None, None, (None, Some(f64::NAN), Some(0.0)), none).is_err());
    }
}
