//! The gauges API: admin-only CRUD of gauges and series, the public reads
//! (list, search, catalog, map, readings). The readings summary route has its
//! own file.

mod common;

use aide::{axum::ApiRouter, openapi::OpenApi};
use axum::{Router, http::Method, http::StatusCode, middleware};
use common::{Who, add_user, call, fake_auth, get, state};
use paddlemate_api::routes::gauges::gauges_routes;
use serde_json::{Value, json};
use sqlx::PgPool;

const MARA: Who = Who::User("mara-1");

async fn app(pool: PgPool) -> Router {
    add_user(&pool, common::ADMIN, "root").await;
    add_user(&pool, "mara-1", "mara").await;
    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest_api_service("/gauges", gauges_routes(state(pool)))
        .layer(middleware::from_fn(fake_auth))
        .finish_api(&mut api)
}

fn gauge_body(name: &str, source: &str) -> Value {
    json!({ "name": name, "provider": "rivermap", "source_id": source, "lat": 47.0, "lon": 11.0 })
}

async fn make_gauge(app: &Router, name: &str, source: &str) -> i64 {
    let r = call(
        app,
        Method::POST,
        "/gauges",
        Who::Admin,
        Some(gauge_body(name, source)),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    r.body["id"].as_i64().unwrap()
}

async fn make_series(app: &Router, gauge: i64, kind: &str) -> i64 {
    let r = call(
        app,
        Method::POST,
        &format!("/gauges/{gauge}/series"),
        Who::Admin,
        Some(json!({ "measurement_type": kind, "unit": "cm", "label": "Pegel" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    r.body["id"].as_i64().unwrap()
}

async fn readings(pool: &PgPool, series: i64, n: i32) {
    sqlx::query(
        "INSERT INTO gauge_readings (series_id, measured_at, value) \
         SELECT $1, '2026-05-01T00:00:00Z'::timestamptz + n * interval '1 hour', n \
         FROM generate_series(0, $2 - 1) n",
    )
    .bind(series)
    .bind(n)
    .execute(pool)
    .await
    .unwrap();
}

fn names(r: &common::Reply) -> Vec<String> {
    r.body
        .as_array()
        .unwrap()
        .iter()
        .map(|g| g["name"].as_str().unwrap().to_string())
        .collect()
}

#[sqlx::test]
async fn gauge_writes_are_for_admins_only(pool: PgPool) {
    let app = app(pool).await;
    let g = make_gauge(&app, "Kufstein", "k1").await;
    let s = make_series(&app, g, "water_level").await;
    let writes = [
        (Method::POST, "/gauges".to_string(), gauge_body("x", "x")),
        (
            Method::PUT,
            format!("/gauges/{g}"),
            json!({ "name": "x", "provider": "p", "source_id": "x", "active": true, "fetch_interval_secs": 60 }),
        ),
        (Method::DELETE, format!("/gauges/{g}"), json!({})),
        (
            Method::POST,
            format!("/gauges/{g}/series"),
            json!({ "measurement_type": "discharge", "unit": "m3s" }),
        ),
        (
            Method::PUT,
            format!("/gauges/{g}/series/{s}"),
            json!({ "measurement_type": "discharge", "unit": "m3s" }),
        ),
        (Method::DELETE, format!("/gauges/{g}/series/{s}"), json!({})),
        (
            Method::POST,
            format!("/gauges/{g}/backfill"),
            json!({ "from": "2026-01-01T00:00:00Z", "to": "2026-01-02T00:00:00Z" }),
        ),
    ];
    for (method, uri, body) in writes {
        let anon = call(&app, method.clone(), &uri, Who::Anyone, Some(body.clone())).await;
        assert_eq!(anon.status, StatusCode::UNAUTHORIZED, "{method} {uri}");
        let user = call(&app, method.clone(), &uri, MARA, Some(body)).await;
        assert_eq!(user.status, StatusCode::FORBIDDEN, "{method} {uri}");
    }
    // Nothing changed.
    let r = get(&app, &format!("/gauges/{g}")).await;
    assert_eq!(r.body["name"], "Kufstein");
    assert_eq!(r.body["series"].as_array().unwrap().len(), 1);
}

#[sqlx::test]
async fn a_gauge_is_created_read_updated_and_deleted(pool: PgPool) {
    let app = app(pool).await;
    let r = call(
        &app,
        Method::POST,
        "/gauges",
        Who::Admin,
        Some(gauge_body("Kufstein", "k1")),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED);
    let g = &r.body;
    assert_eq!(g["name"], "Kufstein");
    assert_eq!(g["provider"], "rivermap");
    assert_eq!(g["source_id"], "k1");
    assert_eq!(g["lat"], 47.0);
    assert_eq!(g["active"], true, "active defaults to true");
    assert_eq!(g["fetch_interval_secs"], 600, "interval defaults to 600");
    assert_eq!(g["data_source_id"], Value::Null);
    assert!(g["created_at"].is_string() && g["updated_at"].is_string());
    let id = g["id"].as_i64().unwrap();

    let r = call(
        &app,
        Method::PUT,
        &format!("/gauges/{id}"),
        Who::Admin,
        Some(json!({
            "name": "Kufstein 2", "provider": "rivermap", "source_id": "k1",
            "active": false, "fetch_interval_secs": 120
        })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["name"], "Kufstein 2");
    assert_eq!(r.body["active"], false);
    assert_eq!(r.body["fetch_interval_secs"], 120);
    assert_eq!(
        r.body["lat"],
        Value::Null,
        "a PUT replaces: omitted coordinates are cleared"
    );

    let r = call(
        &app,
        Method::PUT,
        &format!("/gauges/{id}"),
        Who::Admin,
        Some(json!({ "name": "x" })),
    )
    .await;
    assert!(r.status.is_client_error(), "a PUT needs the whole body");
    let r = call(&app, Method::PUT, "/gauges/999999", Who::Admin, Some(json!({
        "name": "x", "provider": "p", "source_id": "x", "active": true, "fetch_interval_secs": 60
    }))).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("/gauges/{id}"),
            Who::Admin,
            None
        )
        .await
        .status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        get(&app, &format!("/gauges/{id}")).await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("/gauges/{id}"),
            Who::Admin,
            None
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn a_duplicate_gauge_is_a_conflict(pool: PgPool) {
    let app = app(pool).await;
    make_gauge(&app, "Kufstein", "k1").await;
    let r = call(
        &app,
        Method::POST,
        "/gauges",
        Who::Admin,
        Some(gauge_body("Again", "k1")),
    )
    .await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    assert_eq!(r.body["error"]["code"], "conflict");
    assert_eq!(r.body["error"]["target"], "source_id");
    let r = call(
        &app,
        Method::POST,
        "/gauges",
        Who::Admin,
        Some(json!({ "name": "x" })),
    )
    .await;
    assert!(r.status.is_client_error(), "missing required fields");
}

#[sqlx::test]
async fn gauges_are_public_and_listed_by_name(pool: PgPool) {
    let app = app(pool).await;
    make_gauge(&app, "Zirl", "z").await;
    let a = make_gauge(&app, "Achenrain", "a").await;
    call(&app, Method::PUT, &format!("/gauges/{a}"), Who::Admin, Some(json!({
        "name": "Achenrain", "provider": "rivermap", "source_id": "a", "active": false, "fetch_interval_secs": 60
    }))).await;

    // The plain list includes inactive gauges, the search does not.
    let r = get(&app, "/gauges").await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(names(&r), ["Achenrain", "Zirl"]);
    let r = get(&app, "/gauges/search").await;
    assert_eq!(names(&r), ["Zirl"]);
}

#[sqlx::test]
async fn a_gauge_carries_its_series(pool: PgPool) {
    let app = app(pool).await;
    let g = make_gauge(&app, "Kufstein", "k1").await;
    let s = make_series(&app, g, "water_level").await;

    let r = get(&app, &format!("/gauges/{g}")).await;
    assert_eq!(r.status, StatusCode::OK);
    let series = r.body["series"].as_array().unwrap();
    assert_eq!(series.len(), 1);
    assert_eq!(series[0]["id"], s);
    assert_eq!(series[0]["gauge_id"], g);
    assert_eq!(series[0]["measurement_type"], "water_level");
    assert_eq!(series[0]["unit"], "cm");
    assert_eq!(series[0]["label"], "Pegel");
    assert!(
        r.body.get("source").is_none(),
        "no source without a data_source_id"
    );
    assert_eq!(
        get(&app, "/gauges/999999").await.status,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn series_are_unique_per_type_and_editable(pool: PgPool) {
    let app = app(pool).await;
    let g = make_gauge(&app, "Kufstein", "k1").await;
    let s = make_series(&app, g, "water_level").await;
    let uri = format!("/gauges/{g}/series");

    let r = call(
        &app,
        Method::POST,
        &uri,
        Who::Admin,
        Some(json!({ "measurement_type": "water_level", "unit": "cm" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    assert_eq!(r.body["error"]["target"], "measurement_type");
    let r = call(
        &app,
        Method::POST,
        &uri,
        Who::Admin,
        Some(json!({ "measurement_type": "salinity", "unit": "x" })),
    )
    .await;
    assert!(r.status.is_client_error(), "unknown measurement type");
    let r = call(
        &app,
        Method::POST,
        "/gauges/999999/series",
        Who::Admin,
        Some(json!({ "measurement_type": "discharge", "unit": "m3s" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    let r = call(
        &app,
        Method::PUT,
        &format!("{uri}/{s}"),
        Who::Admin,
        Some(json!({ "measurement_type": "water_level", "unit": "m", "label": null })),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["unit"], "m");
    assert_eq!(r.body["label"], Value::Null);
    let r = call(
        &app,
        Method::PUT,
        &format!("{uri}/999999"),
        Who::Admin,
        Some(json!({ "measurement_type": "water_level", "unit": "m" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);

    // A series is looked up inside its gauge: a path naming another gauge is 404.
    let other = make_gauge(&app, "Other", "o").await;
    let r = call(
        &app,
        Method::PUT,
        &format!("/gauges/{other}/series/{s}"),
        Who::Admin,
        Some(json!({ "measurement_type": "water_level", "unit": "ft" })),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("/gauges/{other}/series/{s}"),
            Who::Admin,
            None
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    let r = get(&app, &format!("/gauges/{g}")).await;
    assert_eq!(r.body["series"][0]["unit"], "m", "series untouched");

    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("{uri}/{s}"),
            Who::Admin,
            None
        )
        .await
        .status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(
            &app,
            Method::DELETE,
            &format!("{uri}/{s}"),
            Who::Admin,
            None
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    let r = get(&app, &format!("/gauges/{g}")).await;
    assert_eq!(r.body["series"], json!([]));
}

#[sqlx::test]
async fn readings_come_newest_first_and_are_bounded(pool: PgPool) {
    let app = app(pool.clone()).await;
    let g = make_gauge(&app, "Kufstein", "k1").await;
    let s = make_series(&app, g, "water_level").await;
    readings(&pool, s, 10).await;
    let base = format!("/gauges/{g}/series/{s}/readings");

    let r = get(&app, &base).await;
    assert_eq!(r.status, StatusCode::OK);
    let items = r.body.as_array().unwrap();
    assert_eq!(items.len(), 10);
    assert_eq!(items[0]["value"], 9.0);
    assert_eq!(items[0]["series_id"], s);
    assert_eq!(items[0]["measured_at"], "2026-05-01T09:00:00Z");
    assert_eq!(items[9]["value"], 0.0);

    let r = get(&app, &format!("{base}?limit=3")).await;
    assert_eq!(r.body.as_array().unwrap().len(), 3);
    let r = get(&app, &format!("{base}?limit=0")).await;
    assert_eq!(
        r.body.as_array().unwrap().len(),
        1,
        "limit is clamped to at least 1"
    );
    let r = get(
        &app,
        &format!("{base}?from=2026-05-01T03:00:00Z&to=2026-05-01T05:00:00Z"),
    )
    .await;
    let values: Vec<f64> = r
        .body
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x["value"].as_f64().unwrap())
        .collect();
    assert_eq!(values, [5.0, 4.0, 3.0], "both bounds are inclusive");
    assert!(
        get(&app, &format!("{base}?from=yesterday"))
            .await
            .status
            .is_client_error()
    );

    let r = get(&app, &format!("{base}/latest")).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["value"], 9.0);

    // Readings are looked up inside their gauge: another gauge's path finds none.
    let other = make_gauge(&app, "Other", "o").await;
    let r = get(&app, &format!("/gauges/{other}/series/{s}/readings/latest")).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    let r = get(&app, &format!("/gauges/{other}/series/{s}/readings")).await;
    assert_eq!(r.body, json!([]));

    // A series without readings: empty list, 404 for latest.
    let empty = make_series(&app, other, "discharge").await;
    let r = get(&app, &format!("/gauges/{other}/series/{empty}/readings")).await;
    assert_eq!(r.body, json!([]));
    let r = get(
        &app,
        &format!("/gauges/{other}/series/{empty}/readings/latest"),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn search_matches_names_and_ranks_by_distance(pool: PgPool) {
    let app = app(pool).await;
    for (name, src, lat, lon) in [
        ("Inn Kufstein", "a", 47.58, 12.17),
        ("Inn Innsbruck", "b", 47.26, 11.39),
        ("Salzach", "c", 47.8, 13.0),
    ] {
        let r = call(
            &app,
            Method::POST,
            "/gauges",
            Who::Admin,
            Some(json!({
                "name": name, "provider": "rivermap", "source_id": src, "lat": lat, "lon": lon
            })),
        )
        .await;
        assert_eq!(r.status, StatusCode::CREATED);
    }
    let r = get(&app, "/gauges/search?q=inn").await;
    assert_eq!(
        names(&r),
        ["Inn Innsbruck", "Inn Kufstein"],
        "case-insensitive, by name"
    );
    let r = get(&app, "/gauges/search?q=%20%20").await;
    assert_eq!(
        r.body.as_array().unwrap().len(),
        3,
        "a blank query is no query"
    );
    let r = get(&app, "/gauges/search?lat=47.3&lon=11.4").await;
    assert_eq!(
        names(&r),
        ["Inn Innsbruck", "Inn Kufstein", "Salzach"],
        "nearest first"
    );
    let r = get(&app, "/gauges/search?limit=1").await;
    assert_eq!(r.body.as_array().unwrap().len(), 1);
    let r = get(&app, "/gauges/search?limit=0").await;
    assert_eq!(
        r.body.as_array().unwrap().len(),
        1,
        "limit is clamped to 1..50"
    );
    assert!(r.body[0].get("series").is_some());
}

#[sqlx::test]
async fn the_catalog_lists_gauges_then_stations_not_yet_fetched(pool: PgPool) {
    let app = app(pool.clone()).await;
    make_gauge(&app, "Kufstein", "k1").await;
    for (st, name, river, country, lat, lon) in [
        ("k1", "Kufstein", "Inn", "AT", 47.58, 12.17),
        ("s1", "Salzburg", "Salzach", "AT", 47.8, 13.04),
        ("m1", "Muenchen", "Isar", "DE", 48.1, 11.5),
    ] {
        sqlx::query(
            "INSERT INTO gauge_catalog (provider, station_id, name, river, country, lat, lon, geom, params) \
             VALUES ('rivermap', $1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($6, $5), 4326), '{W,Q}')",
        )
        .bind(st).bind(name).bind(river).bind(country).bind(lat).bind(lon)
        .execute(&pool).await.unwrap();
    }

    let r = get(&app, "/gauges/catalog").await;
    assert_eq!(r.status, StatusCode::OK);
    let items = r.body.as_array().unwrap();
    assert_eq!(items.len(), 3);
    assert_eq!(items[0]["kind"], "gauge");
    assert_eq!(items[0]["gauge"]["name"], "Kufstein");
    assert_eq!(items[1]["kind"], "catalog");
    assert_eq!(items[1]["name"], "Muenchen");
    assert_eq!(items[1]["station_id"], "m1");
    assert_eq!(items[1]["river"], "Isar");
    assert_eq!(items[1]["country"], "DE");
    assert_eq!(items[1]["params"], json!(["W", "Q"]));
    assert_eq!(items[2]["name"], "Salzburg");

    // Naming a river leaves out real gauges and filters stations by river.
    let r = get(&app, "/gauges/catalog?river=isar").await;
    let items = r.body.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["kind"], "catalog");

    // Radius around a point, in km.
    let r = get(&app, "/gauges/catalog?lat=48.1&lon=11.5&radius_km=20").await;
    let kinds: Vec<(&str, &str)> = r
        .body
        .as_array()
        .unwrap()
        .iter()
        .map(|i| {
            let name = match i["kind"].as_str().unwrap() {
                "gauge" => &i["gauge"]["name"],
                _ => &i["name"],
            };
            (i["kind"].as_str().unwrap(), name.as_str().unwrap())
        })
        .collect();
    assert_eq!(kinds, [("gauge", "Kufstein"), ("catalog", "Muenchen")]);
}

#[sqlx::test]
async fn catalog_rivers_are_counted_and_ranked(pool: PgPool) {
    let app = app(pool.clone()).await;
    for (st, river) in [("a", "Inn"), ("b", "Inn"), ("c", "Isar"), ("d", "Innerste")] {
        sqlx::query(
            "INSERT INTO gauge_catalog (provider, station_id, name, river, country, lat, lon) \
             VALUES ('rivermap', $1, $1, $2, 'AT', 47.0, 11.0)",
        )
        .bind(st)
        .bind(river)
        .execute(&pool)
        .await
        .unwrap();
    }
    sqlx::query("INSERT INTO gauge_catalog (provider, station_id, name) VALUES ('rivermap', 'e', 'no river')")
        .execute(&pool).await.unwrap();

    let r = get(&app, "/gauges/catalog/rivers").await;
    assert_eq!(r.status, StatusCode::OK);
    let rivers: Vec<(&str, i64)> = r
        .body
        .as_array()
        .unwrap()
        .iter()
        .map(|x| {
            (
                x["river"].as_str().unwrap(),
                x["gauge_count"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(rivers, [("Inn", 2), ("Innerste", 1), ("Isar", 1)]);
    let first = &r.body[0];
    assert_eq!(first["country"], "AT");
    for f in ["min_lat", "min_lon", "max_lat", "max_lon"] {
        assert!(first.get(f).is_some(), "{f}");
    }
    let r = get(&app, "/gauges/catalog/rivers?q=inn").await;
    assert_eq!(r.body.as_array().unwrap().len(), 2);
    let r = get(&app, "/gauges/catalog/rivers?limit=1").await;
    assert_eq!(r.body.as_array().unwrap().len(), 1);
}

#[sqlx::test]
async fn the_map_marks_stations_used_fetched_or_available(pool: PgPool) {
    let app = app(pool.clone()).await;
    let used = make_gauge(&app, "Used", "u:W").await;
    let used_series = make_series(&app, used, "water_level").await;
    make_gauge(&app, "Fetched", "f:W").await;
    let inactive = make_gauge(&app, "Inactive", "i:W").await;
    sqlx::query("UPDATE gauges SET active = FALSE WHERE id = $1")
        .bind(inactive)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO gauge_catalog (provider, station_id, name, river, lat, lon, params) VALUES ('rivermap', 'avail', 'Avail', 'Inn', 47.0, 11.0, '{W}')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO gauge_catalog (provider, station_id, name, lat, lon) VALUES ('rivermap', 'f', 'Fetched twin', 47.0, 11.0)")
        .execute(&pool).await.unwrap();

    let waterway: i64 = sqlx::query_scalar(
        "INSERT INTO waterways (waterway_type, name) VALUES ('river', 'W') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let section: i64 = sqlx::query_scalar(
        "INSERT INTO water_sections (waterway_id, name, location) \
         VALUES ($1, 'Run', ST_GeomFromText('LINESTRING(9.8 46.4, 9.9 46.5)', 4326)) RETURNING id",
    )
    .bind(waterway)
    .fetch_one(&pool)
    .await
    .unwrap();
    let feature: i64 = sqlx::query_scalar(
        "INSERT INTO features (section_id, feature_type, location, created_by) \
         VALUES ($1, 'whitewater', ST_GeomFromText('POINT(9.8 46.4)', 4326), 'test') RETURNING id",
    )
    .bind(section)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO feature_water_ranges (feature_id, series_id, range_low) VALUES ($1, $2, 1)",
    )
    .bind(feature)
    .bind(used_series)
    .execute(&pool)
    .await
    .unwrap();

    let r = get(&app, "/gauges/map").await;
    assert_eq!(r.status, StatusCode::OK);
    let points: Vec<(&str, &str)> = r
        .body
        .as_array()
        .unwrap()
        .iter()
        .map(|p| {
            (
                p["station_id"].as_str().unwrap(),
                p["state"].as_str().unwrap(),
            )
        })
        .collect();
    let mut sorted = points.clone();
    sorted.sort();
    assert_eq!(
        sorted,
        [("avail", "available"), ("f", "fetched"), ("u", "used"),]
    );
    let avail = r
        .body
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["station_id"] == "avail")
        .unwrap();
    assert_eq!(avail["params"], json!(["W"]));
    assert_eq!(avail["river"], "Inn");
    assert_eq!(avail["lat"], 47.0);
    let u = r
        .body
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["station_id"] == "u")
        .unwrap();
    assert_eq!(u["params"], json!(["water_level"]));
    assert_eq!(u["provider"], "rivermap");
}
