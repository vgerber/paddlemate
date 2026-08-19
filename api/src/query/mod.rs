pub mod comments;
pub mod descents;
pub mod favorites;
pub mod features;
pub mod follows;
pub mod gauges;
pub mod groups;
pub mod osm_geometry;
pub mod proposals;
pub mod sections;
pub mod tokens;
pub mod users;
pub mod waterways;

/// True when the error is a Postgres unique constraint violation (23505).
pub fn is_unique_violation(err: &sqlx::Error) -> bool {
    matches!(err, sqlx::Error::Database(db) if db.code().as_deref() == Some("23505"))
}
