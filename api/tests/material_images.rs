//! The catalogue's photo mirror and takedown: which hosts the job may
//! contact, what it keeps, and what an admin can take down. The network is a
//! fake fetcher; nothing here leaves the machine.

mod common;

use std::sync::Mutex;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, call, fake_auth, people, state};
use paddlemate_api::{
    jobs::material_images::{FetchError, Fetched, Fetcher, MAX_BYTES, run_round},
    routes::materials::materials_routes,
};
use serde_json::json;
use sqlx::PgPool;

fn app(pool: PgPool) -> Router {
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/materials", materials_routes(state(pool)))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

fn png() -> Vec<u8> {
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(8, 8)
        .write_to(&mut out, image::ImageFormat::Png)
        .unwrap();
    out.into_inner()
}

/// Answers from a script and records every URL it was asked for.
struct Fake {
    calls: Mutex<Vec<String>>,
    reply: fn(&str) -> Result<Fetched, FetchError>,
}

impl Fake {
    fn new(reply: fn(&str) -> Result<Fetched, FetchError>) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            reply,
        }
    }
    fn called(&self) -> usize {
        self.calls.lock().unwrap().len()
    }
}

impl Fetcher for Fake {
    async fn fetch(&self, url: &str) -> Result<Fetched, FetchError> {
        self.calls.lock().unwrap().push(url.to_string());
        (self.reply)(url)
    }
}

fn ok_png(_: &str) -> Result<Fetched, FetchError> {
    Ok(Fetched {
        content_type: Some("image/png".into()),
        bytes: png(),
    })
}

async fn material(pool: &PgPool, brand: &str, model: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO materials (category, brand, model, created_by) \
         VALUES ('kayak', $1, $2, 'system-catalogue') RETURNING id",
    )
    .bind(brand)
    .bind(model)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn image(pool: &PgPool, material_id: i64, host: &str, name: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO material_images (material_id, source_url, host, page_url, credit) \
         VALUES ($1, $2, $3, 'https://example.test/page', 'Maker') RETURNING id",
    )
    .bind(material_id)
    .bind(format!("https://{host}/{name}.png"))
    .bind(host)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn status_of(pool: &PgPool, id: i64) -> String {
    sqlx::query_scalar("SELECT status::text FROM material_images WHERE id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

/// Empties the seeded catalogue (its 900 pending photos would join every
/// round) and points MEDIA_DIR at a scratch directory.
async fn fresh(pool: &PgPool) -> std::path::PathBuf {
    sqlx::query("DELETE FROM materials")
        .execute(pool)
        .await
        .unwrap();
    let dir = std::env::temp_dir().join("paddlemate-test-material-media");
    // Same value from every test of this file, so the race is harmless.
    unsafe { std::env::set_var("MEDIA_DIR", &dir) };
    dir
}

#[sqlx::test]
async fn a_fetched_photo_is_served_with_its_credit(pool: PgPool) {
    fresh(&pool).await;
    let m = material(&pool, "Acme", "One").await;
    let img = image(&pool, m, "cdn.acme.test", "a").await;
    let fake = Fake::new(ok_png);
    run_round(&pool, &fake).await.unwrap();
    assert_eq!(status_of(&pool, img).await, "fetched");

    let app = app(pool);
    let r = call(
        &app,
        Method::GET,
        &format!("/materials/{m}"),
        Who::Anyone,
        None,
    )
    .await;
    let shown = &r.body["images"][0];
    assert_eq!(shown["credit"], "Maker");
    assert_eq!(shown["page_url"], "https://example.test/page");
    assert!(shown["url"].as_str().unwrap().contains("/media/"));
}

#[sqlx::test]
async fn a_link_outside_the_allowlist_is_never_fetched(pool: PgPool) {
    fresh(&pool).await;
    let m = material(&pool, "Acme", "One").await;
    // The row claims one host, the link points at another.
    let img = image(&pool, m, "cdn.acme.test", "a").await;
    sqlx::query("UPDATE material_images SET source_url = 'https://evil.test/a.png' WHERE id = $1")
        .bind(img)
        .execute(&pool)
        .await
        .unwrap();
    // Another host is allowed, so the mismatched link would pass a plain
    // allowlist check; the row's own host must match the link too.
    let legit = image(&pool, m, "evil.test", "b").await;
    sqlx::query("UPDATE material_images SET status = 'fetched', file = 'x.jpg' WHERE id = $1")
        .bind(legit)
        .execute(&pool)
        .await
        .unwrap();
    let fake = Fake::new(ok_png);
    run_round(&pool, &fake).await.unwrap();
    assert_eq!(fake.called(), 0);
    assert_eq!(status_of(&pool, img).await, "failed");
}

#[sqlx::test]
async fn a_429_stops_the_host_for_a_day(pool: PgPool) {
    fresh(&pool).await;
    let m = material(&pool, "Acme", "One").await;
    let first = image(&pool, m, "slow.test", "a").await;
    let second = image(&pool, m, "slow.test", "b").await;
    let fine = image(&pool, m, "fine.test", "c").await;
    let fake = Fake::new(|url| {
        if url.contains("slow.test") {
            Err(FetchError::Status(429))
        } else {
            ok_png(url)
        }
    });
    run_round(&pool, &fake).await.unwrap();
    assert_eq!(status_of(&pool, fine).await, "fetched");
    let after_first = fake.called();

    run_round(&pool, &fake).await.unwrap();
    run_round(&pool, &fake).await.unwrap();
    assert_eq!(fake.called(), after_first, "the host is left alone");
    assert_eq!(status_of(&pool, first).await, "pending");
    assert_eq!(status_of(&pool, second).await, "pending");

    // The cooldown is 24 hours, not forever.
    sqlx::query("UPDATE material_image_hosts SET blocked_until = NOW() - INTERVAL '1 minute'")
        .execute(&pool)
        .await
        .unwrap();
    run_round(&pool, &fake).await.unwrap();
    assert!(fake.called() > after_first);
}

#[sqlx::test]
async fn only_images_within_the_cap_are_kept(pool: PgPool) {
    fresh(&pool).await;
    let m = material(&pool, "Acme", "One").await;
    let html = image(&pool, m, "html.test", "a").await;
    let big = image(&pool, m, "big.test", "b").await;
    let junk = image(&pool, m, "junk.test", "c").await;
    let fake = Fake::new(|url| {
        if url.contains("html.test") {
            Ok(Fetched {
                content_type: Some("text/html".into()),
                bytes: png(),
            })
        } else if url.contains("big.test") {
            Ok(Fetched {
                content_type: Some("image/png".into()),
                // A real picture, padded past the cap.
                bytes: [png(), vec![0; MAX_BYTES]].concat(),
            })
        } else {
            Ok(Fetched {
                content_type: Some("image/png".into()),
                bytes: b"not an image".to_vec(),
            })
        }
    });
    run_round(&pool, &fake).await.unwrap();
    for id in [html, big, junk] {
        assert_eq!(status_of(&pool, id).await, "failed");
    }
}

#[sqlx::test]
async fn takedown_deletes_the_file_and_is_never_refetched(pool: PgPool) {
    let dir = fresh(&pool).await;
    people(&pool).await;
    let m = material(&pool, "Acme", "One").await;
    let other = material(&pool, "Acme", "Two").await;
    let img = image(&pool, m, "cdn.acme.test", "a").await;
    let fake = Fake::new(ok_png);
    run_round(&pool, &fake).await.unwrap();
    let file: String = sqlx::query_scalar("SELECT file FROM material_images WHERE id = $1")
        .bind(img)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(dir.join(&file).exists());

    let app = app(pool.clone());
    let uri = format!("/materials/{m}/images/{img}");
    let r = call(&app, Method::DELETE, &uri, Who::Anyone, None).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    let r = call(&app, Method::DELETE, &uri, Who::User("mara-1"), None).await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    // An image is reached through its own entry only.
    let wrong = format!("/materials/{other}/images/{img}");
    let r = call(&app, Method::DELETE, &wrong, Who::Admin, None).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    assert!(dir.join(&file).exists());

    let r = call(&app, Method::DELETE, &uri, Who::Admin, None).await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    assert!(!dir.join(&file).exists(), "the file is gone");
    let r = call(
        &app,
        Method::GET,
        &format!("/materials/{m}"),
        Who::Anyone,
        None,
    )
    .await;
    assert_eq!(r.body["images"].as_array().unwrap().len(), 0);

    let r = call(&app, Method::DELETE, &uri, Who::Admin, None).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let calls = fake.called();
    run_round(&pool, &fake).await.unwrap();
    assert_eq!(fake.called(), calls, "a removed photo is not fetched again");
}

#[sqlx::test]
async fn a_brand_takedown_removes_pending_and_fetched_photos(pool: PgPool) {
    let dir = fresh(&pool).await;
    people(&pool).await;
    let acme = material(&pool, "Acme", "One").await;
    let rival = material(&pool, "Rival", "One").await;
    let fetched = image(&pool, acme, "cdn.acme.test", "a").await;
    let fake = Fake::new(ok_png);
    run_round(&pool, &fake).await.unwrap();
    let pending = image(&pool, acme, "cdn.acme.test", "b").await;
    let theirs = image(&pool, rival, "cdn.rival.test", "c").await;
    let file: String = sqlx::query_scalar("SELECT file FROM material_images WHERE id = $1")
        .bind(fetched)
        .fetch_one(&pool)
        .await
        .unwrap();

    let app = app(pool.clone());
    let r = call(
        &app,
        Method::DELETE,
        "/materials/images?brand=acme",
        Who::User("mara-1"),
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    let r = call(&app, Method::DELETE, "/materials/images", Who::Admin, None).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let r = call(
        &app,
        Method::DELETE,
        "/materials/images?brand=acme",
        Who::Admin,
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body, json!({ "removed": 2 }));
    assert!(!dir.join(&file).exists());
    assert_eq!(status_of(&pool, fetched).await, "removed");
    assert_eq!(status_of(&pool, pending).await, "removed");
    assert_eq!(status_of(&pool, theirs).await, "pending");
}

#[sqlx::test]
async fn files_of_the_mirror_survive_the_orphan_sweep(pool: PgPool) {
    let dir = fresh(&pool).await;
    let m = material(&pool, "Acme", "One").await;
    let img = image(&pool, m, "cdn.acme.test", "a").await;
    run_round(&pool, &Fake::new(ok_png)).await.unwrap();
    let file: String = sqlx::query_scalar("SELECT file FROM material_images WHERE id = $1")
        .bind(img)
        .fetch_one(&pool)
        .await
        .unwrap();
    // Age the files past the sweep's grace period.
    let old = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
    for name in [file.clone(), paddlemate_api::media::thumb_key(&file)] {
        std::fs::File::options()
            .write(true)
            .open(dir.join(name))
            .unwrap()
            .set_modified(old)
            .unwrap();
    }
    paddlemate_api::media::sweep_orphans(&pool).await.unwrap();
    assert!(dir.join(&file).exists());
}

#[sqlx::test]
async fn paddle_fields_round_trip_and_stay_with_paddles(pool: PgPool) {
    people(&pool).await;
    let app = app(pool);
    let paddle = json!({
        "category": "paddle", "brand": "Werner", "model": "Powerhouse",
        "colors": ["Black", "Blue"], "year_approximate": true, "notes": "n",
        "blade_area_cm2": 742, "shaft": "bent", "shaft_material": "carbon",
        "lengths_cm": [191, 194], "feather_deg": [0, 30], "pieces": 1
    });
    let r = call(&app, Method::POST, "/materials", Who::Admin, Some(paddle)).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    assert_eq!(r.body["colors"], json!(["Black", "Blue"]));
    assert_eq!(r.body["year_approximate"], true);
    assert_eq!(r.body["shaft"], "bent");
    assert_eq!(r.body["lengths_cm"], json!([191.0, 194.0]));

    let boat = json!({ "category": "kayak", "brand": "A", "model": "B", "blade_area_cm2": 700 });
    let r = call(
        &app,
        Method::POST,
        "/materials",
        Who::User("mara-1"),
        Some(boat),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}
