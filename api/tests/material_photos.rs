//! Photo upload to wiki entries: who may upload, what waits for review, what
//! is refused, and that files follow their rows.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode, header},
    middleware,
};
use common::{ADMIN, Who, add_user, call, fake_auth, people, state};
use paddlemate_api::{
    media,
    routes::{materials::materials_routes, proposals::proposals_routes},
};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

const MARA: Who = Who::User("mara-1");
const NOA: Who = Who::User("noa-1");

fn app(pool: PgPool) -> Router {
    let state = state(pool);
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/materials", materials_routes(state.clone()))
        .nest_api_service("/proposals", proposals_routes(state))
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

/// Same directory from every test of this file, so the race is harmless.
fn media_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join("paddlemate-test-material-photos");
    unsafe { std::env::set_var("MEDIA_DIR", &dir) };
    dir
}

struct Part<'a> {
    name: &'a str,
    bytes: Vec<u8>,
}

fn text<'a>(name: &'a str, value: &str) -> Part<'a> {
    Part {
        name,
        bytes: value.as_bytes().to_vec(),
    }
}

struct Reply {
    status: StatusCode,
    body: Value,
}

async fn send(
    app: &Router,
    method: Method,
    uri: &str,
    who: Who,
    parts: Option<Vec<Part<'_>>>,
) -> Reply {
    let mut req = Request::builder().method(method).uri(uri);
    match who {
        Who::Anyone => {}
        Who::Admin => req = req.header("x-test-user", ADMIN).header("x-test-admin", "1"),
        Who::User(id) => req = req.header("x-test-user", id),
    }
    let body = match parts {
        Some(parts) => {
            let mut out = Vec::new();
            for part in parts {
                out.extend(
                    format!(
                        "--XB\r\nContent-Disposition: form-data; name=\"{}\"",
                        part.name
                    )
                    .as_bytes(),
                );
                if part.name == "file" {
                    out.extend(b"; filename=\"p.png\"\r\nContent-Type: image/png");
                }
                out.extend(b"\r\n\r\n");
                out.extend(part.bytes);
                out.extend(b"\r\n");
            }
            out.extend(b"--XB--\r\n");
            req = req.header(header::CONTENT_TYPE, "multipart/form-data; boundary=XB");
            Body::from(out)
        }
        None => Body::empty(),
    };
    let res = app.clone().oneshot(req.body(body).unwrap()).await.unwrap();
    let status = res.status();
    let raw = to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap()
        .to_vec();
    Reply {
        status,
        body: serde_json::from_slice(&raw).unwrap_or(Value::Null),
    }
}

fn form(file: Vec<u8>) -> Vec<Part<'static>> {
    vec![
        Part {
            name: "file",
            bytes: file,
        },
        text("rights_confirmed", "true"),
    ]
}

async fn upload(app: &Router, id: i64, who: Who, parts: Vec<Part<'_>>) -> Reply {
    send(
        app,
        Method::POST,
        &format!("/materials/{id}/images"),
        who,
        Some(parts),
    )
    .await
}

/// Two sizes of one model, and an unrelated entry.
async fn sizes(pool: &PgPool) -> (i64, i64, i64) {
    let mut ids = Vec::new();
    for (model, size) in [
        ("Photo One", Some("S")),
        ("Photo One", Some("M")),
        ("Other", None),
    ] {
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO materials (category, brand, model, size, disciplines, created_by) \
             VALUES ('kayak', 'Photoboats', $1, $2, '{other}', 'system-catalogue') RETURNING id",
        )
        .bind(model)
        .bind(size)
        .fetch_one(pool)
        .await
        .unwrap();
        ids.push(id);
    }
    (ids[0], ids[1], ids[2])
}

async fn start(pool: &PgPool) -> (Router, i64, i64, i64) {
    media_dir();
    people(pool).await;
    add_user(pool, "noa-1", "noa").await;
    let (s, m, other) = sizes(pool).await;
    (app(pool.clone()), s, m, other)
}

async fn images_of(app: &Router, id: i64) -> Vec<Value> {
    let r = send(
        app,
        Method::GET,
        &format!("/materials/{id}"),
        Who::Anyone,
        None,
    )
    .await;
    r.body["images"].as_array().cloned().unwrap_or_default()
}

async fn file_of(pool: &PgPool, image_id: i64) -> Option<String> {
    sqlx::query_scalar("SELECT file FROM material_images WHERE id = $1")
        .bind(image_id)
        .fetch_optional(pool)
        .await
        .unwrap()
        .flatten()
}

fn exists(file: &str) -> bool {
    media::media_dir().join(file).exists()
}

#[sqlx::test]
async fn an_admin_photo_is_live_and_shows_on_every_size(pool: PgPool) {
    let (app, small, medium, other) = start(&pool).await;
    let r = upload(&app, small, Who::Admin, form(png())).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    assert_eq!(r.body["credit"], "root");
    assert_eq!(r.body["source_kind"], "user");
    assert!(r.body["page_url"].is_null());
    for id in [small, medium] {
        let images = images_of(&app, id).await;
        assert_eq!(images.len(), 1, "size {id}");
        assert_eq!(images[0]["id"], r.body["id"]);
    }
    assert!(images_of(&app, other).await.is_empty());
}

#[sqlx::test]
async fn a_custom_credit_is_stored_and_a_long_one_refused(pool: PgPool) {
    let (app, small, ..) = start(&pool).await;
    let mut parts = form(png());
    parts.push(text("credit", "Mara K."));
    let r = upload(&app, small, Who::Admin, parts).await;
    assert_eq!(r.body["credit"], "Mara K.");
    let mut parts = form(png());
    parts.push(text("credit", &"x".repeat(81)));
    let r = upload(&app, small, Who::Admin, parts).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(r.body["error"]["target"], "credit");
}

#[sqlx::test]
async fn a_member_photo_waits_for_review_and_shows_after_approval(pool: PgPool) {
    let (app, small, medium, _) = start(&pool).await;
    let r = upload(&app, small, MARA, form(png())).await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    assert_eq!(r.body["entity_type"], "material_photo");
    assert_eq!(r.body["status"], "pending");
    assert!(r.body["proposed_data"].get("url").is_none());
    let proposal = r.body["id"].as_i64().unwrap();
    let image: i64 = r.body["proposed_data"]["image_id"].as_i64().unwrap();
    assert!(images_of(&app, small).await.is_empty());

    // The proposals screen's "Wiki" filter lists photo proposals too.
    let wiki = call(
        &app,
        Method::GET,
        "/proposals?entity_type=material",
        Who::Admin,
        None,
    )
    .await;
    let listed: Vec<i64> = wiki.body["items"]
        .as_array()
        .map(|a| a.iter().filter_map(|p| p["id"].as_i64()).collect())
        .unwrap_or_default();
    assert!(listed.contains(&proposal), "{}", wiki.body);

    let preview = format!("/materials/{small}/images/{image}/preview");
    assert_eq!(
        send(&app, Method::GET, &preview, MARA, None).await.status,
        StatusCode::OK
    );
    assert_eq!(
        send(&app, Method::GET, &preview, Who::Admin, None)
            .await
            .status,
        StatusCode::OK
    );
    assert_eq!(
        send(&app, Method::GET, &preview, NOA, None).await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        send(&app, Method::GET, &preview, Who::Anyone, None)
            .await
            .status,
        StatusCode::UNAUTHORIZED
    );

    let approve = call(
        &Router::new().merge(app.clone()),
        Method::PATCH,
        &format!("/proposals/{proposal}"),
        Who::Admin,
        Some(json!({"status": "approved"})),
    )
    .await;
    assert_eq!(approve.status, StatusCode::OK, "{}", approve.body);
    for id in [small, medium] {
        let images = images_of(&app, id).await;
        assert_eq!(images.len(), 1);
        assert_eq!(images[0]["credit"], "mara");
    }
    // Live now, so the review preview is closed.
    assert_eq!(
        send(&app, Method::GET, &preview, MARA, None).await.status,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn a_rejected_photo_is_deleted_with_its_file(pool: PgPool) {
    let (app, small, ..) = start(&pool).await;
    let r = upload(&app, small, MARA, form(png())).await;
    let proposal = r.body["id"].as_i64().unwrap();
    let image = r.body["proposed_data"]["image_id"].as_i64().unwrap();
    let file = file_of(&pool, image).await.unwrap();
    assert!(exists(&file) && exists(&media::thumb_key(&file)));
    let reject = call(
        &app,
        Method::PATCH,
        &format!("/proposals/{proposal}"),
        Who::Admin,
        Some(json!({"status": "rejected"})),
    )
    .await;
    assert_eq!(reject.status, StatusCode::OK, "{}", reject.body);
    assert!(file_of(&pool, image).await.is_none());
    assert!(!exists(&file) && !exists(&media::thumb_key(&file)));
}

#[sqlx::test]
async fn a_withdrawn_photo_is_deleted_with_its_file(pool: PgPool) {
    let (app, small, ..) = start(&pool).await;
    let r = upload(&app, small, MARA, form(png())).await;
    let proposal = r.body["id"].as_i64().unwrap();
    let image = r.body["proposed_data"]["image_id"].as_i64().unwrap();
    let file = file_of(&pool, image).await.unwrap();
    let other = call(
        &app,
        Method::DELETE,
        &format!("/proposals/{proposal}"),
        NOA,
        None,
    )
    .await;
    assert_eq!(other.status, StatusCode::FORBIDDEN);
    assert!(exists(&file));
    let gone = call(
        &app,
        Method::DELETE,
        &format!("/proposals/{proposal}"),
        MARA,
        None,
    )
    .await;
    assert_eq!(gone.status, StatusCode::NO_CONTENT);
    assert!(file_of(&pool, image).await.is_none());
    assert!(!exists(&file) && !exists(&media::thumb_key(&file)));
}

#[sqlx::test]
async fn the_rights_statement_is_required(pool: PgPool) {
    let (app, small, ..) = start(&pool).await;
    for who in [Who::Admin, MARA] {
        let parts = vec![Part {
            name: "file",
            bytes: png(),
        }];
        let r = upload(&app, small, who, parts).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST);
        assert_eq!(r.body["error"]["target"], "rights_confirmed");
        let parts = vec![
            Part {
                name: "file",
                bytes: png(),
            },
            text("rights_confirmed", "false"),
        ];
        assert_eq!(
            upload(&app, small, who, parts).await.status,
            StatusCode::BAD_REQUEST
        );
    }
}

#[sqlx::test]
async fn only_real_images_within_the_size_limit_are_accepted(pool: PgPool) {
    let (app, small, ..) = start(&pool).await;
    let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"/>"#.to_vec();
    for bytes in [svg, b"not a picture".to_vec()] {
        let r = upload(&app, small, Who::Admin, form(bytes)).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST);
        assert_eq!(r.body["error"]["target"], "file");
    }
    let big = vec![0u8; media::MAX_UPLOAD_BYTES + 1];
    let r = upload(&app, small, Who::Admin, form(big)).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(r.body["error"]["target"], "file");
    let none = vec![text("rights_confirmed", "true")];
    assert_eq!(
        upload(&app, small, Who::Admin, none).await.status,
        StatusCode::BAD_REQUEST
    );
    assert!(images_of(&app, small).await.is_empty());
}

#[sqlx::test]
async fn uploads_need_sign_in_and_an_existing_entry(pool: PgPool) {
    let (app, small, ..) = start(&pool).await;
    assert_eq!(
        upload(&app, small, Who::Anyone, form(png())).await.status,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        upload(&app, 987_654_321, MARA, form(png())).await.status,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn a_member_may_have_five_photos_waiting(pool: PgPool) {
    let (app, small, medium, _) = start(&pool).await;
    for i in 0..5 {
        let target = if i % 2 == 0 { small } else { medium };
        let r = upload(&app, target, MARA, form(png())).await;
        assert_eq!(r.status, StatusCode::ACCEPTED, "{i}: {}", r.body);
    }
    let r = upload(&app, small, MARA, form(png())).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);
    // The cap is per user.
    assert_eq!(
        upload(&app, small, NOA, form(png())).await.status,
        StatusCode::ACCEPTED
    );
}

#[sqlx::test]
async fn a_user_may_upload_ten_photos_a_day(pool: PgPool) {
    let (app, small, ..) = start(&pool).await;
    for i in 0..10 {
        sqlx::query(
            "INSERT INTO material_images (material_id, source_url, host, page_url, credit, \
             status, source_kind, uploaded_by, rights_confirmed_at) \
             VALUES ($1, $2, 'upload.invalid', '', 'x', 'removed', 'user', 'mara-1', NOW())",
        )
        .bind(small)
        .bind(format!("https://upload.invalid/{i}"))
        .execute(&pool)
        .await
        .unwrap();
    }
    let r = upload(&app, small, MARA, form(png())).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);
    let r = upload(&app, small, Who::Admin, form(png())).await;
    assert_eq!(r.status, StatusCode::CREATED);
}

#[sqlx::test]
async fn a_model_holds_six_uploaded_photos_across_its_sizes(pool: PgPool) {
    let (app, small, medium, other) = start(&pool).await;
    for i in 0..6 {
        let target = if i % 2 == 0 { small } else { medium };
        let r = upload(&app, target, Who::Admin, form(png())).await;
        assert_eq!(r.status, StatusCode::CREATED, "{i}: {}", r.body);
    }
    assert_eq!(
        upload(&app, small, Who::Admin, form(png())).await.status,
        StatusCode::TOO_MANY_REQUESTS
    );
    assert_eq!(
        upload(&app, medium, MARA, form(png())).await.status,
        StatusCode::TOO_MANY_REQUESTS
    );
    assert_eq!(
        upload(&app, other, Who::Admin, form(png())).await.status,
        StatusCode::CREATED
    );
}

#[sqlx::test]
async fn a_capped_upload_is_refused_before_decoding_and_leaves_no_file(pool: PgPool) {
    let (app, small, ..) = start(&pool).await;
    for _ in 0..5 {
        upload(&app, small, MARA, form(png())).await;
    }
    let count = |dir: &std::path::Path| std::fs::read_dir(dir).map(|d| d.count()).unwrap_or(0);
    let before = count(&media::media_dir());
    let r = upload(&app, small, MARA, form(png())).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(count(&media::media_dir()), before);
    // Refused on the cap alone: garbage bytes are never decoded.
    let r = upload(&app, small, MARA, form(b"not a picture".to_vec())).await;
    assert_eq!(r.status, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn an_admin_takes_down_any_photo_and_the_file_goes(pool: PgPool) {
    let (app, small, medium, _) = start(&pool).await;
    let r = upload(&app, small, Who::Admin, form(png())).await;
    let image = r.body["id"].as_i64().unwrap();
    let file = file_of(&pool, image).await.unwrap();
    // Reached through a sibling size, because that is where the user sees it.
    let uri = format!("/materials/{medium}/images/{image}");
    assert_eq!(
        send(&app, Method::DELETE, &uri, MARA, None).await.status,
        StatusCode::FORBIDDEN
    );
    assert!(exists(&file));
    assert_eq!(
        send(&app, Method::DELETE, &uri, Who::Admin, None)
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    assert!(!exists(&file));
    assert!(images_of(&app, small).await.is_empty());
}

#[sqlx::test]
async fn a_photo_is_not_reachable_through_another_model(pool: PgPool) {
    let (app, small, _, other) = start(&pool).await;
    let r = upload(&app, small, Who::Admin, form(png())).await;
    let image = r.body["id"].as_i64().unwrap();
    let uri = format!("/materials/{other}/images/{image}");
    assert_eq!(
        send(&app, Method::DELETE, &uri, Who::Admin, None)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(images_of(&app, small).await.len(), 1);
}

#[sqlx::test]
async fn the_sweeper_keeps_files_under_review(pool: PgPool) {
    let (app, small, ..) = start(&pool).await;
    let r = upload(&app, small, MARA, form(png())).await;
    let image = r.body["proposed_data"]["image_id"].as_i64().unwrap();
    let file = file_of(&pool, image).await.unwrap();
    let stray = media::media_dir().join("stray-upload.jpg");
    std::fs::write(&stray, b"x").unwrap();
    let old = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
    for path in [
        media::media_dir().join(&file),
        media::media_dir().join(media::thumb_key(&file)),
        stray.clone(),
    ] {
        std::fs::File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(old)
            .unwrap();
    }
    media::sweep_orphans(&pool).await.unwrap();
    assert!(exists(&file) && exists(&media::thumb_key(&file)));
    assert!(!stray.exists());
}
