//! Selecting and requeueing mirrored photos for a fresh download. Only
//! `material_images` rows may change.

use paddlemate_api::query::materials::images::{RefetchFilter, requeue, select_refetch};
use sqlx::PgPool;

async fn seed(pool: &PgPool, brand: &str, url: &str, status: &str) -> i64 {
    sqlx::query("DELETE FROM material_images")
        .execute(pool)
        .await
        .ok();
    let m: i64 = sqlx::query_scalar(
        "INSERT INTO materials (category, brand, model, disciplines, created_by) \
         VALUES ('kayak', $1, $2, '{other}', 'system-catalogue') RETURNING id",
    )
    .bind(brand)
    .bind(url)
    .fetch_one(pool)
    .await
    .unwrap();
    add(pool, m, url, status).await
}

async fn add(pool: &PgPool, m: i64, url: &str, status: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO material_images (material_id, source_url, host, page_url, credit, status, file) \
         VALUES ($1, $2, 'h.test', 'https://h.test/p', 'C', $3::material_image_status, \
                 CASE WHEN $3 = 'fetched' THEN 'x.jpg' END) RETURNING id",
    )
    .bind(m)
    .bind(url)
    .bind(status)
    .fetch_one(pool)
    .await
    .unwrap()
}

fn transparent() -> RefetchFilter {
    RefetchFilter {
        transparent_sources: true,
        ..Default::default()
    }
}

#[sqlx::test]
async fn transparent_sources_match_by_extension_even_with_a_query(pool: PgPool) {
    let a = seed(&pool, "Acme", "https://h.test/a.PNG?v=3", "fetched").await;
    let m: i64 = sqlx::query_scalar("SELECT material_id FROM material_images WHERE id = $1")
        .bind(a)
        .fetch_one(&pool)
        .await
        .unwrap();
    let w = add(&pool, m, "https://h.test/b.webp", "fetched").await;
    let g = add(&pool, m, "https://h.test/c.gif", "fetched").await;
    add(&pool, m, "https://h.test/d.jpg", "fetched").await;
    add(&pool, m, "https://h.test/e.jpg?x=.png", "fetched").await;
    add(&pool, m, "https://h.test/f.png", "pending").await;
    add(&pool, m, "https://h.test/g.png", "failed").await;
    let ids: Vec<i64> = select_refetch(&pool, &transparent())
        .await
        .unwrap()
        .iter()
        .map(|r| r.id)
        .collect();
    assert_eq!(ids, [a, w, g]);
}

#[sqlx::test]
async fn brand_matches_case_insensitively_and_empty_selects_nothing(pool: PgPool) {
    let a = seed(&pool, "Dagger", "https://h.test/a.jpg", "fetched").await;
    let filter = RefetchFilter {
        brands: vec!["dagger".into()],
        ..Default::default()
    };
    let rows = select_refetch(&pool, &filter).await.unwrap();
    assert_eq!(rows.iter().map(|r| r.id).collect::<Vec<_>>(), [a]);
    let other = RefetchFilter {
        brands: vec!["Other".into()],
        ..Default::default()
    };
    assert!(select_refetch(&pool, &other).await.unwrap().is_empty());
    assert!(
        select_refetch(&pool, &RefetchFilter::default())
            .await
            .unwrap()
            .is_empty()
    );
}

#[sqlx::test]
async fn requeue_resets_only_the_chosen_rows(pool: PgPool) {
    let a = seed(&pool, "Acme", "https://h.test/a.png", "fetched").await;
    let m: i64 = sqlx::query_scalar("SELECT material_id FROM material_images WHERE id = $1")
        .bind(a)
        .fetch_one(&pool)
        .await
        .unwrap();
    let keep = add(&pool, m, "https://h.test/k.jpg", "fetched").await;
    assert_eq!(requeue(&pool, &[a]).await.unwrap(), 1);
    let row: (String, Option<String>, i32) =
        sqlx::query_as("SELECT status::text, file, attempts FROM material_images WHERE id = $1")
            .bind(a)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(row, ("pending".to_string(), None, 0));
    let kept: String = sqlx::query_scalar("SELECT status::text FROM material_images WHERE id = $1")
        .bind(keep)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(kept, "fetched");
    assert_eq!(requeue(&pool, &[a]).await.unwrap(), 0);
}
