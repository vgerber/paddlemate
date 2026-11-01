//! The photo-link migration: every size of a model is queued, the mirror
//! allowlist grows only by the hosts in the data, and a re-run adds nothing.

use paddlemate_api::query::materials::images::allowed_hosts;
use sqlx::PgPool;

const PHOTOS: [&str; 2] = [
    include_str!("../migrations/0066_materials_photo_links.sql"),
    include_str!("../migrations/0067_materials_photo_links_https.sql"),
];

const NEW_HOSTS: [&str; 8] = [
    "playak.com",
    "cdn.myshoptet.com",
    "www.kajakshop.sk",
    "www.kayaksession.com",
    "s2s-shop.com",
    "images.wildernesssupply.ca",
    "lettmann-shop.de",
    "cdn.shopify.com",
];

async fn count(pool: &PgPool) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM material_images")
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test]
async fn every_size_of_a_model_gets_the_photos(pool: PgPool) {
    // The Axiom comes in four sizes, each with its own copy of the photos.
    let sizes: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT m.id) FROM materials m JOIN material_images i ON i.material_id = m.id \
         WHERE m.brand = 'Dagger' AND m.model = 'Axiom'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(sizes, 4);
    let jitsu: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT m.id) FROM materials m JOIN material_images i ON i.material_id = m.id \
         WHERE m.brand = 'Dagger' AND m.model = 'Jitsu'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(jitsu, 3);
}

#[sqlx::test]
async fn the_credit_is_the_brand_and_the_page_is_kept(pool: PgPool) {
    let bad: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM material_images i JOIN materials m ON m.id = i.material_id \
         WHERE i.credit <> m.brand OR i.page_url !~ '^https?://'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(bad, 0);
}

#[sqlx::test]
async fn a_signed_link_is_kept_whole(pool: PgPool) {
    let n: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM material_images WHERE source_url LIKE \
         'https://cdn.myshoptet.com/%.png?ff=1&x=1024&y=768&q=85&ts=667e35ec&sg=161563f2'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(n >= 1);
    let host: String = sqlx::query_scalar(
        "SELECT host FROM material_images WHERE source_url LIKE '%sg=161563f2' LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(host, "cdn.myshoptet.com");
}

#[sqlx::test]
async fn the_allowlist_covers_the_new_hosts_and_nothing_else(pool: PgPool) {
    let hosts = allowed_hosts(&pool).await.unwrap();
    for h in NEW_HOSTS {
        assert!(hosts.iter().any(|x| x == h), "{h} missing");
    }
    assert!(!hosts.iter().any(|h| h == "evil.test"));
    // Every allowed host is the host of a seeded link, never a wildcard.
    let stray: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM material_images WHERE source_url NOT LIKE 'https://' || host || '/%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(stray, 0);
}

#[sqlx::test]
async fn running_it_again_inserts_nothing(pool: PgPool) {
    let before = count(&pool).await;
    for sql in PHOTOS {
        sqlx::raw_sql(sql).execute(&pool).await.unwrap();
    }
    assert_eq!(count(&pool).await, before);
}

#[sqlx::test]
async fn a_model_with_an_image_is_skipped(pool: PgPool) {
    // Strip every size of a model but one; the one left keeps the model out.
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT m.id FROM materials m JOIN material_images i ON i.material_id = m.id \
         WHERE m.brand = 'Dagger' AND m.model = 'Axiom' ORDER BY m.id",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(ids.len() >= 2);
    sqlx::query("DELETE FROM material_images WHERE material_id = ANY($1) AND material_id <> $2")
        .bind(&ids)
        .bind(ids[0])
        .execute(&pool)
        .await
        .unwrap();
    let before = count(&pool).await;
    sqlx::raw_sql(PHOTOS[0]).execute(&pool).await.unwrap();
    assert_eq!(count(&pool).await, before, "the model already has an image");
}
