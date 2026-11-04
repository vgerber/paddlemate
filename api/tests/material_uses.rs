//! The use level of the kayak browse tree and its filter.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, call, fake_auth, state};
use paddlemate_api::routes::materials::materials_routes;
use serde_json::Value;
use sqlx::PgPool;

fn app(pool: PgPool) -> Router {
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/materials", materials_routes(state(pool)))
        .layer(middleware::from_fn(fake_auth))
        .layer(middleware::from_fn(
            paddlemate_api::layers::rejection::envelope_rejections,
        ))
        .finish_api(&mut api)
}

async fn get(app: &Router, uri: &str) -> common::Reply {
    call(app, Method::GET, uri, Who::Anyone, None).await
}

async fn put(pool: &PgPool, category: &str, brand: &str, model: &str, groups: &[&str]) {
    let groups: Vec<String> = groups.iter().map(|g| g.to_string()).collect();
    sqlx::query(
        "INSERT INTO materials (category, brand, model, disciplines, created_by) \
         VALUES ($1::material_category, $2, $3, $4::text[]::material_discipline[], 'system-catalogue')",
    )
    .bind(category)
    .bind(brand)
    .bind(model)
    .bind(groups)
    .execute(pool)
    .await
    .unwrap();
}

async fn fixture(pool: &PgPool) {
    sqlx::query("DELETE FROM materials")
        .execute(pool)
        .await
        .unwrap();
    put(
        pool,
        "kayak",
        "Pyranha",
        "Ripper",
        &["playboat", "half_slice"],
    )
    .await;
    put(pool, "kayak", "Pyranha", "Burn", &["creek", "river_runner"]).await;
    put(pool, "kayak", "Dagger", "Mamba", &["creek"]).await;
    put(
        pool,
        "kayak",
        "Dagger",
        "Crossy",
        &["river_runner", "crossover"],
    )
    .await;
    put(pool, "kayak", "Prijon", "Seayak", &["sea"]).await;
    put(pool, "kayak", "Jantex", "Blade", &["slalom"]).await;
    put(pool, "kayak", "Zed", "Odd", &["other"]).await;
    put(pool, "paddle", "Werner", "Sho", &["whitewater"]).await;
}

fn find<'a>(list: &'a Value, key: &str, want: &str) -> &'a Value {
    list.as_array()
        .unwrap()
        .iter()
        .find(|x| x[key] == want)
        .unwrap_or_else(|| panic!("no {key}={want} in {list}"))
}

fn use_order(kayak: &Value) -> Vec<&str> {
    kayak["uses"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["use"].as_str().unwrap())
        .collect()
}

#[test]
fn every_group_has_a_use_and_the_lists_agree() {
    use MaterialDiscipline::*;
    use paddlemate_api::models::material::{MaterialDiscipline, MaterialUse};
    for d in [Creek, RiverRunner, Playboat, HalfSlice] {
        assert_eq!(d.use_of(), MaterialUse::Whitewater);
    }
    for d in [Slalom, Downriver] {
        assert_eq!(d.use_of(), MaterialUse::Racing);
    }
    for d in [Crossover, Sea, Touring, Expedition, Recreational] {
        assert_eq!(d.use_of(), MaterialUse::Touring);
    }
    for d in [Other, Polo, Freestyle] {
        assert_eq!(d.use_of(), MaterialUse::Other);
    }
    let total: usize = [
        MaterialUse::Whitewater,
        MaterialUse::Racing,
        MaterialUse::Touring,
        MaterialUse::Other,
    ]
    .iter()
    .map(|u| u.disciplines().len())
    .sum();
    assert_eq!(total, MaterialDiscipline::ALL.len());
}

#[sqlx::test]
async fn kayaks_group_by_use_in_order_with_distinct_counts(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    let tree = get(&app, "/materials/tree").await;
    assert_eq!(tree.status, StatusCode::OK);
    let kayak = find(&tree.body["categories"], "category", "kayak");
    assert_eq!(kayak["models"], 7);
    assert!(kayak["disciplines"].as_array().unwrap().is_empty());
    assert_eq!(
        use_order(kayak),
        ["whitewater", "racing", "touring", "other"]
    );
    let uses = kayak["uses"].as_array().unwrap();
    // Burn and Ripper sit in two whitewater groups each and count once.
    let ww = &uses[0];
    assert_eq!(ww["models"], 4);
    let mut got: Vec<(String, i64)> = ww["disciplines"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            (
                d["discipline"].as_str().unwrap().to_string(),
                d["models"].as_i64().unwrap(),
            )
        })
        .collect();
    got.sort();
    assert_eq!(
        got,
        [
            ("creek".to_string(), 2),
            ("half_slice".to_string(), 1),
            ("playboat".to_string(), 1),
            ("river_runner".to_string(), 2),
        ]
    );
    let creek = find(&ww["disciplines"], "discipline", "creek");
    assert_eq!(find(&creek["brands"], "brand", "Dagger")["models"], 1);
    // Crossy sits in whitewater (river runner) and touring (crossover).
    assert_eq!(uses[1]["models"], 1);
    assert_eq!(uses[2]["models"], 2);
    assert_eq!(uses[3]["models"], 1);
}

#[sqlx::test]
async fn a_use_with_no_models_is_left_out_and_paddles_have_none(pool: PgPool) {
    fixture(&pool).await;
    sqlx::query(
        "DELETE FROM materials WHERE disciplines && ARRAY['slalom']::material_discipline[]",
    )
    .execute(&pool)
    .await
    .unwrap();
    let app = app(pool);
    let tree = get(&app, "/materials/tree").await;
    let kayak = find(&tree.body["categories"], "category", "kayak");
    assert_eq!(use_order(kayak), ["whitewater", "touring", "other"]);
    let paddle = find(&tree.body["categories"], "category", "paddle");
    assert!(paddle.get("uses").is_none());
    assert_eq!(paddle["disciplines"][0]["discipline"], "whitewater");
}

#[sqlx::test]
async fn the_use_filter_matches_the_tree_and_combines(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    for (use_, models) in [
        ("whitewater", 4),
        ("racing", 1),
        ("touring", 2),
        ("other", 1),
    ] {
        let m = get(
            &app,
            &format!("/materials/models?use={use_}&category=kayak"),
        )
        .await;
        assert_eq!(m.status, StatusCode::OK);
        assert_eq!(m.body["total"], models, "{use_}");
        let e = get(&app, &format!("/materials?use={use_}&category=kayak")).await;
        assert_eq!(e.body["total"], models, "{use_} entries");
    }
    // Without a category the paddle filed under a paddle-only group counts.
    let any = get(&app, "/materials/models?use=whitewater").await;
    assert_eq!(any.body["total"], 4);
    let other = get(&app, "/materials/models?use=other").await;
    assert_eq!(other.body["total"], 2);
    let both = get(
        &app,
        "/materials/models?use=whitewater&discipline=creek&brand=pyranha",
    )
    .await;
    assert_eq!(both.body["total"], 1);
    let none = get(&app, "/materials/models?use=racing&discipline=creek").await;
    assert_eq!(none.body["total"], 0);
    let bad = get(&app, "/materials/models?use=nope").await;
    assert_eq!(bad.status, StatusCode::BAD_REQUEST);
}
