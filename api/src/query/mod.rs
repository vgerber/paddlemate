pub mod descents;
pub mod gauges;
pub mod groups;
pub mod history;
pub mod materials;
pub mod proposals;
pub mod regions;
pub mod trips;
pub mod users;
pub mod util;
pub mod waterways;

// Temporary: proposals queries are edited by another agent.

/// Shortest search term that may match approximately. Below this a single
/// typo leaves too few correct characters for trigram scoring to mean
/// anything.
pub const FUZZY_MIN_CHARS: usize = 4;

/// True when the error is a Postgres unique constraint violation (23505).
pub fn is_unique_violation(err: &sqlx::Error) -> bool {
    matches!(err, sqlx::Error::Database(db) if db.code().as_deref() == Some("23505"))
}
