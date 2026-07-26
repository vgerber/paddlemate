//! Canonical form for the `lang_code` columns of the localization tables.

/// Longest tag the localization columns can hold (`VARCHAR(10)`).
const MAX_LEN: usize = 10;

/// Language assumed when a client submits a name without a tag.
pub const DEFAULT_LANG_CODE: &str = "en";

/// Bring a submitted language tag into the single form stored in the database:
/// lowercase, `-` separated. Callers must normalize before writing, otherwise
/// "de", "DE" and "de_DE" become separate rows and defeat the unique
/// constraint on (entity, lang_code).
///
/// The shape is checked, not the membership in a list of known languages: the
/// clients decide which languages they offer, while the API only guarantees
/// that what it stores is a well formed tag that fits the column.
pub fn normalize_lang_code(input: &str) -> Result<String, &'static str> {
    let normalized = input.trim().replace('_', "-").to_lowercase();

    if !is_well_formed(&normalized) {
        return Err("lang_code must be a language tag such as \"de\" or \"pt-br\"");
    }
    if normalized.len() > MAX_LEN {
        return Err("lang_code must be at most 10 characters");
    }
    Ok(normalized)
}

/// Guard for the write paths: every caller is expected to have normalized the
/// tag at the API boundary, so reaching the database with anything else is a
/// bug. Only checked in debug builds; the database CHECK is the real backstop.
pub fn debug_assert_normalized(lang_code: &str) {
    debug_assert!(
        normalize_lang_code(lang_code).as_deref() == Ok(lang_code),
        "lang_code {lang_code:?} reached the query layer un-normalized"
    );
}

/// A primary subtag of two or three letters, followed by any number of
/// alphanumeric subtags of two to eight characters. This is the subset of
/// BCP-47 that fits the column; it accepts "de", "ces", "pt-br", "zh-hant".
fn is_well_formed(tag: &str) -> bool {
    let mut subtags = tag.split('-');

    let primary = match subtags.next() {
        Some(s) => s,
        None => return false,
    };
    if !matches!(primary.len(), 2..=3) || !primary.chars().all(|c| c.is_ascii_alphabetic()) {
        return false;
    }

    subtags.all(|s| matches!(s.len(), 2..=8) && s.chars().all(|c| c.is_ascii_alphanumeric()))
}

#[cfg(test)]
mod tests {
    use super::normalize_lang_code;

    #[test]
    fn accepts_and_lowercases_plain_codes() {
        assert_eq!(normalize_lang_code("de").unwrap(), "de");
        assert_eq!(normalize_lang_code("DE").unwrap(), "de");
        assert_eq!(normalize_lang_code("  De  ").unwrap(), "de");
        assert_eq!(normalize_lang_code("ces").unwrap(), "ces");
    }

    #[test]
    fn accepts_subtags_and_unifies_the_separator() {
        assert_eq!(normalize_lang_code("pt-BR").unwrap(), "pt-br");
        assert_eq!(normalize_lang_code("de_CH").unwrap(), "de-ch");
        assert_eq!(normalize_lang_code("zh-Hant").unwrap(), "zh-hant");
    }

    #[test]
    fn rejects_tags_that_are_not_language_tags() {
        for input in [
            "", "e", "english", "d1", "de-", "-de", "de--ch", "de ch", "dé",
        ] {
            assert!(
                normalize_lang_code(input).is_err(),
                "expected {input:?} to be rejected"
            );
        }
    }

    #[test]
    fn rejects_tags_that_do_not_fit_the_column() {
        assert_eq!(normalize_lang_code("zh-hant-hk").unwrap(), "zh-hant-hk");
        assert!(normalize_lang_code("deu-latn-de-1996").is_err());
    }
}
