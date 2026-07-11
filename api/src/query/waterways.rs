use sqlx::PgPool;

/// Case-insensitive check whether a waterway with this name already exists.
pub async fn name_exists(pool: &PgPool, name: &str) -> Result<bool, sqlx::Error> {
    let row: (bool,) =
        sqlx::query_as("SELECT EXISTS(SELECT 1 FROM waterways WHERE lower(name) = lower($1))")
            .bind(name)
            .fetch_one(pool)
            .await?;
    Ok(row.0)
}
