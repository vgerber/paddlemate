use sqlx::{PgPool, Row};

/// Tiles of a tier the browse layer has never fetched from OSM.
pub async fn missing_tiles(
    pool: &PgPool,
    tier: &str,
    tiles: &[(i32, i32)],
) -> Result<Vec<(i32, i32)>, sqlx::Error> {
    let (xs, ys): (Vec<i32>, Vec<i32>) = tiles.iter().copied().unzip();
    let rows = sqlx::query(
        "SELECT t.x, t.y
         FROM unnest($2::int[], $3::int[]) AS t(x, y)
         WHERE NOT EXISTS (
             SELECT 1 FROM region_tiles r
             WHERE r.tier = $1 AND r.x = t.x AND r.y = t.y
         )",
    )
    .bind(tier)
    .bind(&xs)
    .bind(&ys)
    .fetch_all(pool)
    .await?;
    rows.iter()
        .map(|row| Ok((row.try_get("x")?, row.try_get("y")?)))
        .collect()
}

/// Record tiles as fetched, so panning back over them costs no OSM request.
pub async fn mark_tiles(
    pool: &PgPool,
    tier: &str,
    tiles: &[(i32, i32)],
) -> Result<(), sqlx::Error> {
    let (xs, ys): (Vec<i32>, Vec<i32>) = tiles.iter().copied().unzip();
    sqlx::query(
        "INSERT INTO region_tiles (tier, x, y)
         SELECT $1, t.x, t.y FROM unnest($2::int[], $3::int[]) AS t(x, y)
         ON CONFLICT (tier, x, y) DO UPDATE SET fetched_at = NOW()",
    )
    .bind(tier)
    .bind(&xs)
    .bind(&ys)
    .execute(pool)
    .await?;
    Ok(())
}
