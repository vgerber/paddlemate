//! The imported catalogue: its size, and that re-running the seed neither
//! changes a row nor undoes a user's edit.

use sqlx::PgPool;

const SEED: &str = include_str!("../migrations/0059_materials_catalogue_reseed.sql");

async fn fingerprint(pool: &PgPool) -> (String, i64) {
    sqlx::query_as(
        "SELECT (SELECT md5(string_agg(m::text, '|' ORDER BY id)) FROM materials m), \
                (SELECT COUNT(*) FROM material_images)",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test]
async fn the_seed_fills_the_wiki(pool: PgPool) {
    let counts: Vec<(String, i64)> =
        sqlx::query_as("SELECT category::text, COUNT(*) FROM materials GROUP BY 1 ORDER BY 1")
            .fetch_all(&pool)
            .await
            .unwrap();
    let of = |name: &str| counts.iter().find(|c| c.0 == name).map_or(0, |c| c.1);
    assert!(of("kayak") >= 500, "{counts:?}");
    assert!(of("paddle") >= 150, "{counts:?}");
}

#[sqlx::test]
async fn running_the_seed_again_changes_nothing(pool: PgPool) {
    let before = fingerprint(&pool).await;
    sqlx::raw_sql(SEED).execute(&pool).await.unwrap();
    assert_eq!(fingerprint(&pool).await, before);
}

#[sqlx::test]
async fn an_edited_entry_survives_a_reseed(pool: PgPool) {
    sqlx::query("INSERT INTO users (id, username) VALUES ('mara-1', 'mara')")
        .execute(&pool)
        .await
        .unwrap();
    let (id, untouched): (i64, i64) = sqlx::query_as(
        "SELECT id, id + 1 FROM materials WHERE category = 'kayak' ORDER BY id LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    // A user corrects one entry; a second, untouched one drifts from the data.
    sqlx::query("UPDATE materials SET length_cm = 123, updated_by = 'mara-1' WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE materials SET length_cm = 124 WHERE id = $1")
        .bind(untouched)
        .execute(&pool)
        .await
        .unwrap();

    sqlx::raw_sql(SEED).execute(&pool).await.unwrap();
    let edited: f64 = sqlx::query_scalar("SELECT length_cm FROM materials WHERE id = $1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(edited, 123.0, "a user's edit is kept");
    let drifted: Option<f64> = sqlx::query_scalar("SELECT length_cm FROM materials WHERE id = $1")
        .bind(untouched)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_ne!(
        drifted,
        Some(124.0),
        "an untouched import is brought back to the data"
    );
}
