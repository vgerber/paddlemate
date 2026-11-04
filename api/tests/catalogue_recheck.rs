//! The Playak re-check and quality migration (0080): what it corrected, and
//! that it leaves a user's edit alone.

use sqlx::PgPool;

const FIX: &str = include_str!("../migrations/0080_catalogue_playak_recheck.sql");

async fn weight(pool: &PgPool, size: &str) -> Option<f64> {
    sqlx::query_scalar(
        "SELECT weight_kg FROM materials WHERE brand = 'Dagger' AND model = 'Axiom' AND size = $1",
    )
    .bind(size)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test]
async fn a_correction_lands_and_a_user_edit_is_kept(pool: PgPool) {
    assert_eq!(weight(&pool, "6.9").await, Some(11.0));
    assert_eq!(weight(&pool, "8.0").await, Some(17.0));

    sqlx::query("INSERT INTO users (id, username) VALUES ('mara-1', 'mara')")
        .execute(&pool)
        .await
        .unwrap();
    // One entry was edited by a user, the other drifted from the data.
    sqlx::query(
        "UPDATE materials SET weight_kg = 99, updated_by = 'mara-1' \
         WHERE brand = 'Dagger' AND model = 'Axiom' AND size = '6.9'",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "UPDATE materials SET weight_kg = 98 \
         WHERE brand = 'Dagger' AND model = 'Axiom' AND size = '8.0'",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::raw_sql(FIX).execute(&pool).await.unwrap();
    assert_eq!(weight(&pool, "6.9").await, Some(99.0), "the edit is kept");
    assert_eq!(weight(&pool, "8.0").await, Some(17.0), "the correction lands");
}

#[sqlx::test]
async fn a_playak_value_is_confirmed_or_corrected_by_a_maker_source(pool: PgPool) {
    // Nomad 8.1 was 240 cm from Playak; the maker's archived page says 246.
    let (length, source): (f64, String) = sqlx::query_as(
        "SELECT length_cm, sources->>'length_cm' FROM materials \
         WHERE brand = 'Dagger' AND model = 'Nomad' AND size = '8.1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(length, 246.0);
    assert!(source.contains("dagger.com"), "{source}");
}

#[sqlx::test]
async fn availability_needs_the_maker(pool: PgPool) {
    let weak: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM materials WHERE availability <> 'unknown' \
         AND availability_source ~* '://([^/]*[.])?(kayak-shop[.]eu|aldercreek[.]com|coloradokayak[.]com|\
paddlingmag[.]com|paddlinglife[.]net|seakayakinguk[.]com|kayaksandpaddles[.]co[.]uk|playak[.]com)/'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(weak, 0, "no retailer, magazine or Playak proof");
    let known: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM materials WHERE brand = 'Wave Sport' AND model = 'Diesel' \
         AND size IN ('65', '75') AND availability <> 'unknown'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(known, 0, "the maker lists only Diesel 60, 70 and 80");
}

#[sqlx::test]
async fn wrong_photos_are_retired(pool: PgPool) {
    let live: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM material_images i JOIN materials m ON m.id = i.material_id \
         WHERE i.status <> 'removed' AND ( \
               i.source_url ~* '(paddling[.]com|kayaksession[.]com)' \
            OR i.page_url ~* '(paddling[.]com|kayaksession[.]com)' \
            OR (m.brand = 'Prijon' AND m.model = 'Beast') \
            OR (m.brand = 'Spade' AND m.model = 'Spicy') \
            OR (m.brand = 'Liquidlogic' AND m.model = 'Vision' AND m.size = '44' \
                AND i.source_url LIKE '%vision56%'))",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(live, 0);
    let kept: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM material_images i JOIN materials m ON m.id = i.material_id \
         WHERE i.status <> 'removed' AND m.brand = 'Liquidlogic' AND m.model = 'Vision' \
           AND m.size = '56'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(kept > 0, "the 56 keeps its own banner");
}

#[sqlx::test]
async fn construction_without_a_source_is_empty(pool: PgPool) {
    let guessed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM materials WHERE construction IS NOT NULL \
         AND brand IN ('Eddyline', 'Perception', 'Wilderness Systems') \
         AND NOT (sources ? 'construction')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(guessed, 0);
    let paddle: Option<String> = sqlx::query_scalar(
        "SELECT shaft_material::text FROM materials \
         WHERE brand = 'Select' AND model = 'Wild Alium' AND shaft = 'bent'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(paddle.as_deref(), Some("carbon"));
}
