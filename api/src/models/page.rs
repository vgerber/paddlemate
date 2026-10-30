//! Paging for every listing: bounds, the page count and the response shape.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// The last page any listing serves. Far past what a person pages to, and
/// low enough that `(page - 1) * per_page` cannot overflow.
pub const MAX_PAGE: i64 = 10_000;

/// A listing's `page` and `per_page`, defaulted and bounded.
pub fn page_bounds(page: Option<i64>, per_page: Option<i64>, default_per_page: i64) -> (i64, i64) {
    (
        page.unwrap_or(1).clamp(1, MAX_PAGE),
        per_page.unwrap_or(default_per_page).clamp(1, 100),
    )
}

/// Pages needed for `total` rows at `per_page` each.
pub fn total_pages(total: i64, per_page: i64) -> i64 {
    (total + per_page - 1) / per_page
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PaginatedResponse<T: JsonSchema> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
    pub total_pages: i64,
}

/// One page of `items` out of `total` rows.
pub fn page_of<T: JsonSchema>(
    items: Vec<T>,
    total: i64,
    page: i64,
    per_page: i64,
) -> PaginatedResponse<T> {
    PaginatedResponse {
        items,
        total,
        page,
        per_page,
        total_pages: total_pages(total, per_page),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounds_default_and_clamp() {
        assert_eq!(page_bounds(None, None, 25), (1, 25));
        assert_eq!(page_bounds(Some(0), Some(0), 25), (1, 1));
        assert_eq!(page_bounds(Some(i64::MAX), Some(1000), 25), (MAX_PAGE, 100));
    }

    #[test]
    fn pages_round_up() {
        assert_eq!(total_pages(0, 10), 0);
        assert_eq!(total_pages(10, 10), 1);
        assert_eq!(total_pages(11, 10), 2);
    }

    #[test]
    fn page_of_counts_pages() {
        let page = page_of(vec![1_i64], 21, 2, 10);
        assert_eq!((page.total, page.page, page.total_pages), (21, 2, 3));
    }
}
