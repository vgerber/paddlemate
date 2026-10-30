//! Small helpers for SQL built by hand.

/// Escape the characters LIKE treats as wildcards, so a query containing "%"
/// searches for a literal percent sign instead of matching every row.
pub fn escape_like(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::escape_like;

    #[test]
    fn escapes_wildcards() {
        assert_eq!(escape_like("salzach"), "salzach");
        assert_eq!(escape_like("100%"), "100\\%");
        assert_eq!(escape_like("a_b"), "a\\_b");
        assert_eq!(escape_like("back\\slash"), "back\\\\slash");
    }
}
