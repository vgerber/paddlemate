//! The round-2 import (touring, sea, racing boats, canoes, packrafts and
//! more paddles): what it added and the rules its rows must keep.

use sqlx::PgPool;

#[sqlx::test]
async fn the_import_added_every_category(pool: PgPool) {
    let counts: Vec<(String, i64)> = sqlx::query_as(
        "SELECT category::text, COUNT(*) FROM materials \
         WHERE created_by = 'system-catalogue' GROUP BY 1 ORDER BY 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let of = |name: &str| counts.iter().find(|c| c.0 == name).map_or(0, |c| c.1);
    assert!(of("canoe") >= 70, "{counts:?}");
    assert!(of("packraft") >= 35, "{counts:?}");
    assert!(of("paddle") >= 350, "{counts:?}");
    assert!(of("kayak") >= 700, "{counts:?}");
}

#[sqlx::test]
async fn a_boat_listed_by_two_files_is_one_row(pool: PgPool) {
    let n: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM materials WHERE brand = 'Venture' \
         AND model IN ('Flex', 'Islay', 'Islay Cruiser')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(n, 4, "Flex, Islay 12, Islay 14 and Islay Cruiser once each");
}

#[sqlx::test]
async fn a_contradictory_length_is_not_imported(pool: PgPool) {
    let length: Option<f64> = sqlx::query_scalar(
        "SELECT length_cm FROM materials \
         WHERE brand = 'Eddyline' AND model = 'Sky' AND size = '120'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(length, None, "336 cm against 12 ft stays empty");
}

#[sqlx::test]
async fn imported_photos_are_queued_from_makers_never_playak(pool: PgPool) {
    let (queued, bad): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE m.brand = ANY(ARRAY['Esquif', 'Alpacka Raft', 'Nova Craft'])), \
                COUNT(*) FILTER (WHERE source_url ~* 'playak' OR page_url ~* 'playak' \
                                 OR source_url !~ '^https://') \
         FROM material_images i JOIN materials m ON m.id = i.material_id WHERE i.status <> 'removed'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(queued > 50, "canoe and packraft photos queued, {queued}");
    assert_eq!(bad, 0);
    let unknown: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM material_images WHERE source_kind NOT IN ('maker', 'retailer', 'user')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(unknown, 0);
}

#[sqlx::test]
async fn availability_is_kept_as_researched(pool: PgPool) {
    let (current, unknown_with_source): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE availability = 'current' AND availability_source IS NOT NULL), \
                COUNT(*) FILTER (WHERE availability = 'unknown' AND availability_source IS NOT NULL \
                                 AND category IN ('canoe', 'packraft') AND brand = 'Esquif') \
         FROM materials WHERE category IN ('canoe', 'packraft')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(current > 30, "{current}");
    assert_eq!(unknown_with_source, 0, "unknown rows name no source");
}
