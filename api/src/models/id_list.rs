use crate::error::ApiError;

/// Most ids a batch lookup takes in one call.
pub const MAX_BATCH_IDS: usize = 100;

/// Parse a comma separated list of ids from the query string `param`. Empty
/// lists, non-numbers, non-positive ids and more than `MAX_BATCH_IDS` are
/// 400s. Repeated ids are dropped, order is kept.
pub fn parse_id_list(raw: &str, param: &'static str) -> Result<Vec<i64>, ApiError> {
    let mut ids: Vec<i64> = Vec::new();
    for part in raw.split(',') {
        let id = part
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|id| *id > 0)
            .ok_or_else(|| {
                ApiError::validation(format!("{param} must be comma separated ids"))
                    .with_target(param)
            })?;
        if !ids.contains(&id) {
            ids.push(id);
        }
        if ids.len() > MAX_BATCH_IDS {
            return Err(
                ApiError::validation(format!("{param} takes at most {MAX_BATCH_IDS} ids"))
                    .with_target(param),
            );
        }
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_dedupes() {
        assert_eq!(parse_id_list("3, 1,3,2", "ids").unwrap(), vec![3, 1, 2]);
    }

    #[test]
    fn rejects_bad_lists() {
        for raw in ["", "1,,2", "a", "0", "-4", "1,2,x"] {
            assert!(parse_id_list(raw, "ids").is_err(), "{raw}");
        }
    }

    #[test]
    fn bounds_the_count() {
        let ok: Vec<String> = (1..=MAX_BATCH_IDS).map(|i| i.to_string()).collect();
        assert_eq!(parse_id_list(&ok.join(","), "ids").unwrap().len(), 100);
        let many: Vec<String> = (1..=MAX_BATCH_IDS + 1).map(|i| i.to_string()).collect();
        assert!(parse_id_list(&many.join(","), "ids").is_err());
    }
}
