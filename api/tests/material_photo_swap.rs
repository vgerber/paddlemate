//! The swap from Playak photos to maker photos: no Playak photo stays live,
//! every credit names the real source, the new links are queued per size,
//! and running the migration again changes nothing.

use paddlemate_api::query::materials::images::allowed_hosts;
use sqlx::PgPool;

const SWAP: &str = include_str!("../migrations/0076_materials_maker_photos.sql");

const PLAYAK: &str = "(i.host ~ 'playak[.]com$' OR i.source_url ~* 'playak[.]com/' \
                      OR i.page_url ~* 'playak[.]com/')";

async fn one(pool: &PgPool, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

async fn snapshot(pool: &PgPool) -> String {
    sqlx::query_scalar("SELECT md5(string_agg(i::text, '|' ORDER BY id)) FROM material_images i")
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test]
async fn no_playak_photo_stays_live(pool: PgPool) {
    let live = one(
        &pool,
        &format!(
            "SELECT COUNT(*) FROM material_images i WHERE {PLAYAK} \
             AND (i.status <> 'removed' OR i.file IS NOT NULL)"
        ),
    )
    .await;
    assert_eq!(live, 0);
    // The rows are kept as removed, so a re-import cannot queue them again.
    let kept = one(
        &pool,
        &format!("SELECT COUNT(*) FROM material_images i WHERE {PLAYAK}"),
    )
    .await;
    assert!(kept > 0);
}

#[sqlx::test]
async fn the_allowlist_has_no_playak_host(pool: PgPool) {
    let hosts = allowed_hosts(&pool).await.unwrap();
    assert!(
        !hosts.iter().any(|h| h.ends_with("playak.com")),
        "{hosts:?}"
    );
    // The maker archive host carries the new links.
    assert!(hosts.iter().any(|h| h == "web.archive.org"));
    // User uploads never grant a host.
    assert!(!hosts.iter().any(|h| h == "upload.invalid"));
}

#[sqlx::test]
async fn a_maker_page_credits_the_brand(pool: PgPool) {
    let bad = one(
        &pool,
        "SELECT COUNT(*) FROM material_images i JOIN materials m ON m.id = i.material_id \
         WHERE i.status <> 'removed' AND i.page_url ~ '://(www[.])?(pyranha|wavesport|confluenceoutdoor)[.]com/' \
           AND (i.credit <> m.brand OR i.source_kind <> 'maker')",
    )
    .await;
    assert_eq!(bad, 0);
    // Confluence Outdoor owns Dagger: the photo credits Dagger.
    let dagger = one(
        &pool,
        "SELECT COUNT(*) FROM material_images i JOIN materials m ON m.id = i.material_id \
         WHERE i.page_url LIKE 'https://www.confluenceoutdoor.com/%' AND i.credit = 'Dagger' \
           AND i.source_kind = 'maker'",
    )
    .await;
    assert!(dagger > 0);
}

#[sqlx::test]
async fn a_shop_page_credits_the_shop(pool: PgPool) {
    for (like, shop) in [
        ("https://store.noc.com/%", "NOC"),
        ("https://wildernesssupply.ca/%", "Wilderness Supply"),
        ("%kayak-shop.eu/%", "kayak-shop.eu"),
    ] {
        let rows = one(
            &pool,
            &format!(
                "SELECT COUNT(*) FROM material_images WHERE status <> 'removed' \
                 AND page_url LIKE '{like}'"
            ),
        )
        .await;
        let right = one(
            &pool,
            &format!(
                "SELECT COUNT(*) FROM material_images WHERE status <> 'removed' \
                 AND page_url LIKE '{like}' AND credit = '{shop}' AND source_kind = 'retailer'"
            ),
        )
        .await;
        assert!(rows > 0, "{shop}");
        assert_eq!(rows, right, "{shop}");
    }
}

#[sqlx::test]
async fn an_archived_maker_page_is_looked_through(pool: PgPool) {
    let bad = one(
        &pool,
        "SELECT COUNT(*) FROM material_images i JOIN materials m ON m.id = i.material_id \
         WHERE i.status <> 'removed' AND i.page_url LIKE 'https://web.archive.org/%' \
           AND (i.source_kind <> 'maker' OR i.credit <> m.brand)",
    )
    .await;
    assert_eq!(bad, 0);
}

#[sqlx::test]
async fn maker_photos_are_queued_for_every_size(pool: PgPool) {
    // Every size of the Pyranha-less example: AIRE Force photo from the archive.
    let sizes = one(
        &pool,
        "SELECT COUNT(DISTINCT m.id) FROM materials m WHERE m.brand = 'AIRE' AND m.model = 'Force'",
    )
    .await;
    let with_photo = one(
        &pool,
        "SELECT COUNT(DISTINCT m.id) FROM materials m JOIN material_images i ON i.material_id = m.id \
         WHERE m.brand = 'AIRE' AND m.model = 'Force' AND i.status <> 'removed' \
           AND i.page_url LIKE '%aire.com%'",
    )
    .await;
    assert!(sizes >= 1);
    assert_eq!(sizes, with_photo);
    let new_rows = one(
        &pool,
        "SELECT COUNT(*) FROM material_images WHERE status = 'pending' AND source_kind = 'maker' \
         AND host = 'web.archive.org'",
    )
    .await;
    assert!(new_rows >= 100, "{new_rows}");
}

#[sqlx::test]
async fn running_it_again_changes_nothing(pool: PgPool) {
    let before = snapshot(&pool).await;
    sqlx::raw_sql(SWAP).execute(&pool).await.unwrap();
    assert_eq!(snapshot(&pool).await, before);
}

#[sqlx::test]
async fn a_user_photo_keeps_its_credit(pool: PgPool) {
    sqlx::query("INSERT INTO users (id, username) VALUES ('mara-1', 'mara')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO material_images (material_id, source_url, host, page_url, credit, status, \
         file, source_kind, uploaded_by, rights_confirmed_at) \
         SELECT id, 'https://upload.invalid/a', 'upload.invalid', '', 'mara', 'fetched', 'a.jpg', \
                'user', 'mara-1', NOW() FROM materials ORDER BY id LIMIT 1",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(SWAP).execute(&pool).await.unwrap();
    let credit: String =
        sqlx::query_scalar("SELECT credit FROM material_images WHERE source_kind = 'user'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(credit, "mara");
    let status: String =
        sqlx::query_scalar("SELECT status::text FROM material_images WHERE source_kind = 'user'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(status, "fetched");
}

#[sqlx::test]
async fn the_swap_clears_the_file_of_a_playak_photo(pool: PgPool) {
    // A fetched Playak row, as on a database that mirrored it.
    sqlx::query(
        "INSERT INTO material_images (material_id, source_url, host, page_url, credit, status, file) \
         SELECT id, 'https://playak.com/media/x.jpg', 'playak.com', \
                'https://playak.com/buyers-guide/x', brand, 'fetched', 'x.jpg' \
         FROM materials ORDER BY id LIMIT 1",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(SWAP).execute(&pool).await.unwrap();
    let (status, file): (String, Option<String>) = sqlx::query_as(
        "SELECT status::text, file FROM material_images WHERE source_url = 'https://playak.com/media/x.jpg'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((status.as_str(), file), ("removed", None));
}

#[test]
fn the_data_and_the_seed_hold_no_playak_photo_link() {
    // A re-import must not bring a Playak photo back. Spec sources in the
    // data may still cite Playak; only photo links matter.
    let seed = include_str!("sql/catalogue_seed.sql");
    assert!(
        !seed.contains("playak.com/media"),
        "seed has a Playak photo"
    );
    for data in [
        include_str!("../../data/materials/kayaks.json"),
        include_str!("../../data/materials/paddles.json"),
    ] {
        let rows: Vec<serde_json::Value> = serde_json::from_str(data).unwrap();
        for row in rows {
            for image in row["images"].as_array().unwrap() {
                let text = image.to_string();
                assert!(!text.contains("playak.com"), "{text}");
            }
        }
    }
}
