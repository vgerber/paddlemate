//! Every filter and sort of the wiki lists, alone and combined, on the entry
//! list, the model list and the tree.

mod common;

use std::collections::HashSet;

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

#[derive(Default)]
struct Spec {
    category: &'static str,
    brand: &'static str,
    model: &'static str,
    variant: Option<&'static str>,
    size: Option<&'static str>,
    discipline: Option<&'static str>,
    construction: Option<&'static str>,
    year: Option<i32>,
    approx: bool,
    length: Option<f64>,
    volume: Option<f64>,
    weight: Option<f64>,
    paddler: Option<(f64, f64)>,
}

fn kayak(brand: &'static str, model: &'static str) -> Spec {
    Spec {
        category: "kayak",
        brand,
        model,
        ..Spec::default()
    }
}

async fn put(pool: &PgPool, s: Spec) {
    sqlx::query(
        "INSERT INTO materials (category, brand, model, variant, size, disciplines, construction, \
         year_from, year_approximate, length_cm, volume_l, weight_kg, paddler_weight_min_kg, \
         paddler_weight_max_kg, created_by) \
         VALUES ($1::material_category, $2, $3, $4, $5, ARRAY[COALESCE($6::text, 'other')]::material_discipline[], \
         $7::material_construction, $8, $9, $10, $11, $12, $13, $14, 'system-catalogue')",
    )
    .bind(s.category)
    .bind(s.brand)
    .bind(s.model)
    .bind(s.variant)
    .bind(s.size)
    .bind(s.discipline)
    .bind(s.construction)
    .bind(s.year)
    .bind(s.approx)
    .bind(s.length)
    .bind(s.volume)
    .bind(s.weight)
    .bind(s.paddler.map(|p| p.0))
    .bind(s.paddler.map(|p| p.1))
    .execute(pool)
    .await
    .unwrap();
}

/// A small catalogue where every sort and filter has a clear answer. Rows are
/// inserted so that the order of adding is the reverse of the order of years.
async fn fixture(pool: &PgPool) {
    sqlx::query("DELETE FROM materials")
        .execute(pool)
        .await
        .unwrap();
    let plastic = Some("plastic");
    // Old models first, so created_at order differs from year order.
    put(
        pool,
        Spec {
            year: Some(2010),
            discipline: Some("playboat"),
            construction: Some("composite"),
            length: Some(200.0),
            volume: Some(60.0),
            weight: Some(15.0),
            ..kayak("Dagger", "Rewind")
        },
    )
    .await;
    put(
        pool,
        Spec {
            year: Some(2015),
            discipline: Some("creek"),
            construction: plastic,
            size: Some("M"),
            length: Some(260.0),
            volume: Some(85.0),
            weight: Some(21.0),
            paddler: Some((70.0, 100.0)),
            ..kayak("dagger ", "Mamba")
        },
    )
    .await;
    for (size, length, volume, weight, year) in [
        ("S", 250.0, 80.0, 20.0, 2026),
        ("L", 270.0, 100.0, 24.0, 2026),
    ] {
        put(
            pool,
            Spec {
                year: Some(year),
                discipline: Some("creek"),
                construction: plastic,
                size: Some(size),
                length: Some(length),
                volume: Some(volume),
                weight: Some(weight),
                paddler: Some(if size == "S" {
                    (55.0, 80.0)
                } else {
                    (80.0, 110.0)
                }),
                ..kayak("Pyranha", "Storm")
            },
        )
        .await;
    }
    // An old size of a model that was re-released: the model is as new as its
    // newest size.
    put(
        pool,
        Spec {
            year: Some(1998),
            discipline: Some("creek"),
            construction: plastic,
            size: Some("236"),
            ..kayak("Pyranha", "Storm")
        },
    )
    .await;
    put(
        pool,
        Spec {
            year: Some(2026),
            approx: true,
            discipline: Some("creek"),
            construction: plastic,
            length: Some(255.0),
            weight: Some(19.0),
            ..kayak("Waka Kayaks", "Manu")
        },
    )
    .await;
    put(
        pool,
        Spec {
            year: Some(2026),
            discipline: Some("river_runner"),
            construction: plastic,
            ..kayak("DragoRossi", "Naga")
        },
    )
    .await;
    put(
        pool,
        Spec {
            year: Some(2026),
            discipline: Some("river_runner"),
            construction: plastic,
            variant: Some("PR-X"),
            ..kayak("Prijon", "Drip")
        },
    )
    .await;
    put(
        pool,
        Spec {
            category: "canoe",
            brand: "Old Town",
            model: "Pack",
            year: Some(2024),
            discipline: Some("recreational"),
            construction: plastic,
            length: Some(430.0),
            weight: Some(30.0),
            ..Spec::default()
        },
    )
    .await;
    // No year, construction or discipline, added last.
    put(
        pool,
        Spec {
            weight: Some(10.0),
            ..kayak("Zed", "Mystery")
        },
    )
    .await;
}

fn names(r: &common::Reply) -> Vec<String> {
    r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| {
            format!(
                "{} {}",
                m["brand"].as_str().unwrap().trim(),
                m["model"].as_str().unwrap()
            )
        })
        .collect()
}

#[sqlx::test]
async fn newest_means_the_newest_model_not_the_last_added(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    let r = get(
        &app,
        "/materials/models?category=kayak&construction=plastic&sort=newest",
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    // 2026 models by name, then 2015.
    assert_eq!(
        names(&r),
        [
            "DragoRossi Naga",
            "Prijon Drip",
            "Pyranha Storm",
            "Waka Kayaks Manu",
            "dagger Mamba"
        ]
    );
    let r = get(&app, "/materials/models?category=kayak&sort=newest").await;
    let all = names(&r);
    assert_eq!(
        &all[4..],
        ["dagger Mamba", "Dagger Rewind", "Zed Mystery"],
        "no year sorts last"
    );

    let r = get(&app, "/materials?category=kayak&sort=newest&per_page=3").await;
    let firsts: Vec<_> = r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["year_from"].as_i64().unwrap())
        .collect();
    assert_eq!(firsts, [2026, 2026, 2026]);
    let r = get(&app, "/materials?category=kayak&sort=newest").await;
    let years: Vec<_> = r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["year_from"].as_i64())
        .collect();
    assert_eq!(years.last().unwrap(), &None);
}

#[sqlx::test]
async fn recently_added_is_its_own_sort(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    let r = get(&app, "/materials/models?sort=added&per_page=2").await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(names(&r), ["Zed Mystery", "Old Town Pack"]);
    let r = get(&app, "/materials?sort=added&per_page=1").await;
    assert_eq!(r.body["items"][0]["model"], "Mystery");
}

#[sqlx::test]
async fn measure_sorts_order_models_by_their_smallest_size(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    let r = get(&app, "/materials/models?category=kayak&sort=weight").await;
    // Mystery 10, Rewind 15, Manu 19, Storm S 20, Mamba 21; Naga and Drip state none.
    assert_eq!(
        names(&r)[..5],
        [
            "Zed Mystery",
            "Dagger Rewind",
            "Waka Kayaks Manu",
            "Pyranha Storm",
            "dagger Mamba"
        ]
    );
    let r = get(&app, "/materials/models?category=kayak&sort=length").await;
    assert_eq!(names(&r)[0], "Dagger Rewind");
    assert_eq!(names(&r)[1], "Pyranha Storm");
    let r = get(&app, "/materials/models?category=kayak&sort=volume").await;
    assert_eq!(names(&r)[0], "Dagger Rewind");
    let last = names(&r).pop().unwrap();
    assert!(
        [
            "DragoRossi Naga",
            "Prijon Drip",
            "Waka Kayaks Manu",
            "Zed Mystery"
        ]
        .contains(&last.as_str()),
        "unstated last: {last}"
    );
}

const SORTS: [&str; 6] = ["name", "newest", "added", "length", "volume", "weight"];

fn keys(r: &common::Reply) -> Vec<String> {
    r.body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| {
            m.get("sizes")
                .map(|_| format!("{}|{}|{}", m["brand"], m["model"], m["variant"]))
                .unwrap_or_else(|| m["id"].to_string())
        })
        .collect()
}

#[sqlx::test]
async fn paging_has_no_duplicates_or_gaps_under_every_sort(pool: PgPool) {
    fixture(&pool).await;
    // Many ties: same year, no measures.
    for i in 0..9 {
        let model: &'static str = Box::leak(format!("Tie {i}").into_boxed_str());
        put(
            &pool,
            Spec {
                year: Some(2020),
                ..kayak("Tied", model)
            },
        )
        .await;
        put(
            &pool,
            Spec {
                year: Some(2020),
                size: Some("M"),
                ..kayak("Tied", model)
            },
        )
        .await;
    }
    let app = app(pool);
    for path in ["models", ""] {
        for sort in SORTS {
            for filter in ["", "&category=kayak", "&q=tie", "&q=storm"] {
                let base = format!("/materials/{path}?sort={sort}{filter}");
                let whole = get(&app, &format!("{base}&per_page=100")).await;
                assert_eq!(whole.status, StatusCode::OK, "{base}: {}", whole.body);
                let want = keys(&whole);
                let total = whole.body["total"].as_i64().unwrap() as usize;
                assert_eq!(want.len(), total, "{base}");
                for per in [1usize, 3, 4] {
                    let mut got = Vec::new();
                    let mut page = 1;
                    loop {
                        let r = get(&app, &format!("{base}&per_page={per}&page={page}")).await;
                        let k = keys(&r);
                        if k.is_empty() {
                            break;
                        }
                        assert!(k.len() <= per);
                        got.extend(k);
                        page += 1;
                    }
                    let unique: HashSet<_> = got.iter().collect();
                    assert_eq!(unique.len(), got.len(), "duplicates: {base} per={per}");
                    assert_eq!(got, want, "order differs across pages: {base} per={per}");
                }
            }
        }
    }
}

#[sqlx::test]
async fn bad_values_are_400_in_the_envelope(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    for path in ["/materials", "/materials/models", "/materials/tree"] {
        for bad in [
            "sort=bogus",
            "category=boat",
            "discipline=nope",
            "construction=nope",
            "min_length_cm=abc",
            "max_volume_l=NaN",
            "min_weight_kg=inf",
            "fits_paddler_kg=NaN",
            "page=abc",
            "per_page=1.5",
        ] {
            let r = get(&app, &format!("{path}?{bad}")).await;
            assert_eq!(r.status, StatusCode::BAD_REQUEST, "{path}?{bad}");
            assert!(
                r.body["error"]["code"].is_string(),
                "{path}?{bad} lacks the envelope: {}",
                r.body
            );
        }
    }
}

#[sqlx::test]
async fn empty_and_odd_ranges_answer_with_nothing(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    for path in ["/materials", "/materials/models"] {
        for q in [
            "min_length_cm=300&max_length_cm=200",
            "min_weight_kg=999",
            "fits_paddler_kg=500&construction=composite&discipline=creek",
            "q=zzzzzz",
            "category=paddle",
            "max_volume_l=-5",
            "brand=nobody",
        ] {
            let r = get(&app, &format!("{path}?{q}")).await;
            assert_eq!(r.status, StatusCode::OK, "{path}?{q}");
            assert_eq!(r.body["total"], 0, "{path}?{q}");
            assert_eq!(r.body["total_pages"], 0);
            assert_eq!(r.body["items"].as_array().unwrap().len(), 0);
        }
    }
}

#[sqlx::test]
async fn each_filter_keeps_exactly_what_it_says(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    let total = |r: &common::Reply| r.body["total"].as_i64().unwrap();
    let cases = [
        ("category=canoe", 1, 1),
        ("discipline=creek", 3, 5),
        ("construction=composite", 1, 1),
        ("brand=DAGGER", 2, 2),
        ("brand=%20pyranha%20", 1, 3),
        ("min_length_cm=260", 3, 3),
        ("max_length_cm=250", 2, 2),
        ("min_weight_kg=20&max_weight_kg=21", 2, 2),
        ("min_volume_l=85", 2, 2),
        ("fits_paddler_kg=60", 7, 8),
        ("q=drip", 1, 1),
        ("q=PR-X", 1, 1),
        ("q=pyranah", 1, 3),
        ("q=drip%20pr-x", 1, 1),
        ("q=storm%20pyranha", 1, 3),
        ("q=PYRANHA%20STORM", 1, 3),
    ];
    for (q, models, entries) in cases {
        let m = get(&app, &format!("/materials/models?{q}")).await;
        let e = get(&app, &format!("/materials?{q}")).await;
        assert_eq!(total(&m), models, "models {q}: {}", m.body);
        assert_eq!(total(&e), entries, "entries {q}: {}", e.body);
    }
}

fn tree_path(tree: &Value, f: &[&str]) -> (i64, i64) {
    let cat = tree["categories"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["category"] == f[0]);
    let Some(cat) = cat else { return (0, 0) };
    let mut node = cat;
    if let Some(d) = f.get(1) {
        // Kayaks keep their groups under a use.
        let groups: Vec<&Value> = match cat.get("uses") {
            Some(uses) => uses
                .as_array()
                .unwrap()
                .iter()
                .flat_map(|u| u["disciplines"].as_array().unwrap())
                .collect(),
            None => cat["disciplines"].as_array().unwrap().iter().collect(),
        };
        let disc = groups.into_iter().find(|x| x["discipline"] == *d);
        let Some(disc) = disc else { return (0, 0) };
        node = disc;
        if let Some(b) = f.get(2) {
            let brand = disc["brands"]
                .as_array()
                .unwrap()
                .iter()
                .find(|x| x["brand"].as_str().unwrap().eq_ignore_ascii_case(b));
            let Some(brand) = brand else { return (0, 0) };
            node = brand;
        }
    }
    (
        node["models"].as_i64().unwrap(),
        node["entries"].as_i64().unwrap(),
    )
}

#[sqlx::test]
async fn tree_counts_match_the_lists_for_every_path_and_filter(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    let paths: [&[&str]; 6] = [
        &["kayak"],
        &["kayak", "creek"],
        &["kayak", "creek", "Pyranha"],
        &["kayak", "river_runner", "Prijon"],
        &["canoe", "recreational"],
        &["kayak", "playboat", "Dagger"],
    ];
    for extra in [
        "",
        "construction=plastic",
        "fits_paddler_kg=90",
        "min_length_cm=255",
        "q=storm",
        "q=pyranah",
        "min_weight_kg=19&max_weight_kg=24&construction=plastic",
    ] {
        let tree = get(&app, &format!("/materials/tree?{extra}")).await;
        assert_eq!(tree.status, StatusCode::OK);
        for path in paths {
            let mut qs = format!("category={}", path[0]);
            if let Some(d) = path.get(1) {
                qs += &format!("&discipline={d}");
            }
            if let Some(b) = path.get(2) {
                qs += &format!("&brand={b}");
            }
            let m = get(&app, &format!("/materials/models?{qs}&{extra}")).await;
            let e = get(&app, &format!("/materials?{qs}&{extra}")).await;
            let (tm, te) = tree_path(&tree.body, path);
            assert_eq!(
                (
                    m.body["total"].as_i64().unwrap(),
                    e.body["total"].as_i64().unwrap()
                ),
                (tm, te),
                "{path:?} with {extra}"
            );
        }
    }
}

#[sqlx::test]
async fn a_model_without_facts_is_found_and_nothing_breaks(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    let r = get(&app, "/materials/models?q=mystery").await;
    assert_eq!(r.body["total"], 1);
    let item = &r.body["items"][0];
    assert!(item.get("year_from").is_none() && item.get("construction").is_none());
    let tree = get(&app, "/materials/tree").await;
    assert_eq!(
        tree_path(&tree.body, &["kayak"]).0,
        7,
        "an entry filed under other counts toward the category"
    );
}

#[sqlx::test]
async fn paging_bounds_hold_on_the_filtered_lists(pool: PgPool) {
    fixture(&pool).await;
    let app = app(pool);
    for path in ["/materials", "/materials/models"] {
        let r = get(&app, &format!("{path}?per_page=0&page=0")).await;
        assert_eq!(
            (r.body["page"].as_i64(), r.body["per_page"].as_i64()),
            (Some(1), Some(1))
        );
        let r = get(&app, &format!("{path}?per_page=5000")).await;
        assert_eq!(r.body["per_page"], 100);
        let r = get(&app, &format!("{path}?category=kayak&per_page=4&page=2")).await;
        let total = r.body["total"].as_i64().unwrap();
        assert_eq!(r.body["total_pages"].as_i64().unwrap(), (total + 3) / 4);
        let last = get(
            &app,
            &format!("{path}?category=kayak&per_page=4&page={}", (total + 3) / 4),
        )
        .await;
        assert_eq!(
            last.body["items"].as_array().unwrap().len() as i64,
            total - 4 * ((total + 3) / 4 - 1)
        );
        let past = get(
            &app,
            &format!(
                "{path}?category=kayak&per_page=4&page={}",
                (total + 3) / 4 + 1
            ),
        )
        .await;
        assert_eq!(past.body["items"].as_array().unwrap().len(), 0);
        assert_eq!(past.body["total"], total, "total survives an empty page");
    }
}
