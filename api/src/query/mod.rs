pub mod comments;
pub mod descents;
pub mod favorites;
pub mod features;
pub mod follows;
pub mod gauges;
pub mod groups;
pub mod history;
pub mod media;
pub mod notifications;
pub mod osm_geometry;
pub mod proposals;
pub mod push_subscriptions;
pub mod regions;
pub mod section_order;
pub mod sections;
pub mod tokens;
pub mod trips;
pub mod users;
pub mod waterways;

/// Shortest search term that may match approximately. Below this a single
/// typo leaves too few correct characters for trigram scoring to mean
/// anything.
pub const FUZZY_MIN_CHARS: usize = 4;

/// True when the error is a Postgres unique constraint violation (23505).
pub fn is_unique_violation(err: &sqlx::Error) -> bool {
    matches!(err, sqlx::Error::Database(db) if db.code().as_deref() == Some("23505"))
}
