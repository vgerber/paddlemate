use std::{collections::HashMap, fs, path::PathBuf};

use anyhow::Context;
use river_gauge::{
    RivermapReadingsRange, RivermapSectionBundle, RivermapSource, RivermapStation, license,
};
use serde::Deserialize;
use serde_json::Value;
use sqlx::PgPool;

#[derive(Deserialize)]
struct RivermapSnapshot {
    sources: Vec<RivermapSource>,
    stations: Vec<RivermapStation>,
    sections: RivermapSectionBundle,
    readings: HashMap<String, RivermapReadingsRange>,
}

const STEPS: &[&str] = &["sources", "stations", "sections", "readings"];

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn default_snapshot_path() -> PathBuf {
    manifest_dir().join("../scripts/rivermap_snapshot.json")
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;

    let mut snapshot_path = default_snapshot_path();
    // Which import steps to run. The full set rewrites waterways, sections and
    // features too, so a targeted fix (e.g. re-linking gauges to their source)
    // can restrict itself with --only sources,stations.
    let mut only: Option<Vec<String>> = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--snapshot" => {
                snapshot_path = PathBuf::from(
                    args.next()
                        .ok_or_else(|| anyhow::anyhow!("--snapshot requires a path"))?,
                );
            }
            "--only" => {
                let list = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--only requires a comma separated list"))?;
                let steps: Vec<String> = list.split(',').map(|s| s.trim().to_lowercase()).collect();
                for step in &steps {
                    if !STEPS.contains(&step.as_str()) {
                        anyhow::bail!(
                            "unknown step '{step}', expected one of {}",
                            STEPS.join(", ")
                        );
                    }
                }
                only = Some(steps);
            }
            "--help" | "-h" => {
                println!(
                    "Usage: import_rivermap [--snapshot PATH] [--only {}]\n\n\
                     Default snapshot: {}\n\
                     Without --only every step runs, which also rewrites waterways,\n\
                     sections and features from the snapshot.",
                    STEPS.join(","),
                    snapshot_path.display()
                );
                return Ok(());
            }
            other => anyhow::bail!("unknown argument: {other}"),
        }
    }

    let raw = fs::read_to_string(&snapshot_path)
        .with_context(|| format!("reading snapshot from {}", snapshot_path.display()))?;
    let snapshot: RivermapSnapshot = serde_json::from_str(&raw).context("parsing snapshot JSON")?;

    let pool = PgPool::connect(&database_url).await?;

    let wanted = |step: &str| only.as_ref().is_none_or(|s| s.iter().any(|x| x == step));

    if wanted("sources") {
        import_sources(&pool, &snapshot.sources).await?;
    }
    if wanted("stations") {
        import_stations(&pool, &snapshot.stations, &snapshot.sources).await?;
    }
    if wanted("sections") {
        import_sections(&pool, &snapshot.sections).await?;
    }
    if wanted("readings") {
        import_readings(&pool, &snapshot.readings).await?;
    }

    println!(
        "Import complete ({})",
        match &only {
            Some(steps) => steps.join(", "),
            None => "all steps".to_string(),
        }
    );

    Ok(())
}

/// Directly-polled providers whose authority also publishes through Rivermap.
/// Mapped by short name so we do not duplicate license text for the same
/// organisation, and so the link survives a change of Rivermap's UUIDs.
const PROVIDER_SHORT_NAMES: &[(&str, &str)] = &[
    ("nve", "NVE"),
    ("bafu", "BAFU"),
    ("cz", "CHMI"),
    ("hubeau", "SCHAPI"),
    ("tirol", "Tirol"),
    ("vbg", "Vorarlberg"),
    ("bw", "HVZ (BW)"),
    ("sx", "Sachsen"),
    ("pl", "Poland"),
    ("by", "HND (BY)"),
];

async fn import_sources(pool: &PgPool, sources: &[RivermapSource]) -> anyhow::Result<()> {
    for s in sources {
        let license = s
            .licensing_terms
            .as_deref()
            .map(license::parse_license)
            .unwrap_or_default();

        sqlx::query(
            "INSERT INTO sources (id, name, short_name, licensing_terms, website, country_code,
                                  license_name, license_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name,
                 short_name = EXCLUDED.short_name,
                 licensing_terms = EXCLUDED.licensing_terms,
                 website = EXCLUDED.website,
                 country_code = EXCLUDED.country_code,
                 license_name = EXCLUDED.license_name,
                 license_url = EXCLUDED.license_url",
        )
        .bind(&s.id)
        .bind(&s.name)
        .bind(&s.short_name)
        .bind(&s.licensing_terms)
        .bind(&s.website)
        .bind(&s.country_code)
        .bind(&license.name)
        .bind(&license.url)
        .execute(pool)
        .await?;
    }
    println!("  Imported {} sources", sources.len());

    // Re-establish the provider mapping now that the source rows exist. The
    // migration seeds this too, but only matches on a database that already
    // had an import, so doing it here keeps a fresh database consistent.
    let mut linked = 0u64;
    for (provider, short_name) in PROVIDER_SHORT_NAMES {
        let res = sqlx::query(
            // ORDER BY + LIMIT keeps this deterministic (and non-fatal) if
            // Rivermap ever ships two sources with the same short name: a
            // multi-row insert would make DO UPDATE fail the whole import.
            "INSERT INTO provider_sources (provider, source_id)
             SELECT $1, id FROM sources WHERE short_name = $2 ORDER BY id LIMIT 1
             ON CONFLICT (provider) DO UPDATE SET source_id = EXCLUDED.source_id",
        )
        .bind(provider)
        .bind(short_name)
        .execute(pool)
        .await?;
        linked += res.rows_affected();
    }
    println!("  Linked {linked} direct providers to their source");
    Ok(())
}

async fn import_stations(
    pool: &PgPool,
    stations: &[RivermapStation],
    sources: &[RivermapSource],
) -> anyhow::Result<()> {
    // A station may reference a source the snapshot does not carry. Dropping
    // the link keeps the row importable; failing the FK would abort the lot.
    let known: std::collections::HashSet<&str> = sources.iter().map(|s| s.id.as_str()).collect();
    let mut unknown = 0usize;
    let mut count = 0usize;
    for st in stations {
        // Skip inactive and non-online stations
        if !st.is_active || st.station_type != "online" {
            continue;
        }

        let river_name = st
            .river
            .get("en")
            .or_else(|| st.river.get("de"))
            .or_else(|| st.river.get("fr"))
            .or_else(|| st.river.get("it"))
            .or_else(|| st.river.values().next())
            .cloned()
            .unwrap_or_default();

        let (lat, lon) = match &st.latlng {
            Some(v) if v.len() == 2 => (
                Some(v[0] as f64 / 1_000_000.0),
                Some(v[1] as f64 / 1_000_000.0),
            ),
            _ => (None, None),
        };

        // Build source_id entries for each sensor
        for sensor in &st.sensors {
            let param = match sensor.as_str() {
                "level" => "W",
                "flow" => "Q",
                _ => continue,
            };
            let source_id = format!("{}:{}", st.id, param);
            let data_source_id = st.data_source_id.as_deref().filter(|id| {
                let ok = known.contains(id);
                if !ok {
                    unknown += 1;
                }
                ok
            });
            let measurement_type = match param {
                "W" => "water_level",
                "Q" => "discharge",
                _ => continue,
            };
            let unit = match param {
                "W" => "cm",
                "Q" => "m3s",
                _ => continue,
            };
            let label = format!("{} ({})", st.name, param);

            // Upsert gauge
            sqlx::query(
                "INSERT INTO gauges (name, provider, source_id, data_source_id, lat, lon, active, fetch_interval_secs)
                 VALUES ($1, 'rivermap', $2, $3, $4, $5, TRUE, 600)
                 ON CONFLICT (provider, source_id) DO UPDATE
                 SET name = EXCLUDED.name,
                     data_source_id = EXCLUDED.data_source_id,
                     lat = EXCLUDED.lat,
                     lon = EXCLUDED.lon,
                     active = EXCLUDED.active,
                     updated_at = NOW()",
            )
            .bind(&river_name)
            .bind(&source_id)
            .bind(data_source_id)
            .bind(lat)
            .bind(lon)
            .execute(pool)
            .await?;

            // Get the gauge id
            let gauge_id: i64 = sqlx::query_scalar(
                "SELECT id FROM gauges WHERE provider = 'rivermap' AND source_id = $1",
            )
            .bind(&source_id)
            .fetch_one(pool)
            .await?;

            // Upsert gauge series
            sqlx::query(
                "INSERT INTO gauge_series (gauge_id, measurement_type, unit, label, source_id)
                 VALUES ($1, $2::measurement_type, $3, $4, $5)
                 ON CONFLICT (gauge_id, measurement_type) DO UPDATE
                 SET unit = EXCLUDED.unit,
                     label = EXCLUDED.label,
                     source_id = EXCLUDED.source_id",
            )
            .bind(gauge_id)
            .bind(measurement_type)
            .bind(unit)
            .bind(&label)
            .bind(&source_id)
            .execute(pool)
            .await?;

            count += 1;
        }
    }
    if unknown > 0 {
        println!("  {unknown} station series referenced an unknown source, left unlinked");
    }
    println!(
        "  Imported {count} gauge series from {} stations",
        stations.len()
    );
    Ok(())
}

async fn import_readings(
    pool: &PgPool,
    readings: &HashMap<String, RivermapReadingsRange>,
) -> anyhow::Result<()> {
    let mut total = 0usize;
    for (station_id, range) in readings {
        // cm readings -> W series
        if !range.cm.is_empty() {
            let source_id = format!("{station_id}:W");
            let series_id: Option<i64> = sqlx::query_scalar(
                "SELECT gs.id FROM gauge_series gs
                 JOIN gauges g ON g.id = gs.gauge_id
                 WHERE g.provider = 'rivermap' AND gs.source_id = $1",
            )
            .bind(&source_id)
            .fetch_optional(pool)
            .await?;

            if let Some(sid) = series_id {
                for tv in &range.cm {
                    let measured_at =
                        chrono::DateTime::from_timestamp(tv.ts, 0).unwrap_or_default();
                    sqlx::query(
                        "INSERT INTO gauge_readings (series_id, measured_at, value)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (series_id, measured_at) DO NOTHING",
                    )
                    .bind(sid)
                    .bind(measured_at)
                    .bind(tv.v)
                    .execute(pool)
                    .await?;
                    total += 1;
                }
            }
        }

        // m3s readings -> Q series
        if !range.m3s.is_empty() {
            let source_id = format!("{station_id}:Q");
            let series_id: Option<i64> = sqlx::query_scalar(
                "SELECT gs.id FROM gauge_series gs
                 JOIN gauges g ON g.id = gs.gauge_id
                 WHERE g.provider = 'rivermap' AND gs.source_id = $1",
            )
            .bind(&source_id)
            .fetch_optional(pool)
            .await?;

            if let Some(sid) = series_id {
                for tv in &range.m3s {
                    let measured_at =
                        chrono::DateTime::from_timestamp(tv.ts, 0).unwrap_or_default();
                    sqlx::query(
                        "INSERT INTO gauge_readings (series_id, measured_at, value)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (series_id, measured_at) DO NOTHING",
                    )
                    .bind(sid)
                    .bind(measured_at)
                    .bind(tv.v)
                    .execute(pool)
                    .await?;
                    total += 1;
                }
            }
        }
    }
    println!("  Imported {total} readings");
    Ok(())
}

fn preferred_name(map: &serde_json::Map<String, Value>) -> Option<String> {
    ["en", "de", "fr", "it", "es"]
        .iter()
        .find_map(|lang| map.get(*lang).and_then(|v| v.as_str()).map(String::from))
        .or_else(|| {
            map.values()
                .next()
                .and_then(|v| v.as_str())
                .map(String::from)
        })
}

fn latlng_to_f64(arr: &[Value]) -> (Option<f64>, Option<f64>) {
    if arr.len() == 2 {
        let lat = arr[0].as_f64().map(|v| v / 1_000_000.0);
        let lon = arr[1].as_f64().map(|v| v / 1_000_000.0);
        (lat, lon)
    } else {
        (None, None)
    }
}

async fn import_sections(pool: &PgPool, bundle: &RivermapSectionBundle) -> anyhow::Result<()> {
    let mut _waterway_count = 0usize;
    let mut section_count = 0usize;
    let mut feature_count = 0usize;
    let mut range_count = 0usize;

    // Build a POI lookup map for put-in / take-out alternatives.
    // Keys are POI UUID strings; values are references into the bundle.
    let poi_map: HashMap<&str, &Value> = bundle
        .pois
        .iter()
        .filter_map(|p| p.get("id").and_then(|id| id.as_str()).map(|id| (id, p)))
        .collect();

    for sec in &bundle.sections {
        let obj = sec
            .as_object()
            .ok_or_else(|| anyhow::anyhow!("section is not an object"))?;

        // Extract river name
        let river_map = match obj.get("river").and_then(|v| v.as_object()) {
            Some(m) => m,
            None => continue,
        };
        let river_name = match preferred_name(river_map) {
            Some(n) => n,
            None => continue,
        };

        // Extract section name
        let section_name_map = match obj.get("sectionName").and_then(|v| v.as_object()) {
            Some(m) => m,
            None => continue,
        };
        let section_name = preferred_name(section_name_map).unwrap_or_default();

        let country_code = obj
            .get("countryCode")
            .and_then(|v| v.as_str())
            .map(|s| &s[..s.len().min(2)]);

        let regions: Vec<String> = obj
            .get("regionName")
            .and_then(|v| v.as_str())
            .map(|r| vec![r.to_owned()])
            .unwrap_or_default();

        // Collect access-point coordinates from the section fields.
        let put_in = obj.get("putInLatLng").and_then(|v| v.as_array());
        let take_out = obj.get("takeOutLatLng").and_then(|v| v.as_array());

        let (put_lat, put_lon) = put_in.map(|a| latlng_to_f64(a)).unwrap_or((None, None));
        let (take_lat, take_lon) = take_out.map(|a| latlng_to_f64(a)).unwrap_or((None, None));

        // Need at least one valid endpoint to anchor the section.
        // Fall back to the take-out when the put-in is absent.
        let (p_lat, p_lon) = match (put_lat, put_lon) {
            (Some(lat), Some(lon)) => (lat, lon),
            _ => match (take_lat, take_lon) {
                (Some(lat), Some(lon)) => (lat, lon),
                _ => continue, // no geometry at all - skip
            },
        };

        // Upsert waterway
        let waterway_id: i64 = sqlx::query_scalar(
            "INSERT INTO waterways (waterway_type, name)
             VALUES ('river', $1)
             ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
             RETURNING id",
        )
        .bind(&river_name)
        .fetch_one(pool)
        .await?;
        _waterway_count += 1;

        // Build section geometry.
        // When take_out is present: real LineString from put_in → take_out.
        // When absent: degenerate line (put_in → put_in) so the INSERT is still valid;
        // on re-runs the ON CONFLICT clause will keep the existing geometry via COALESCE.
        let real_line_wkt: Option<String> = match (take_lat, take_lon) {
            (Some(t_lat), Some(t_lon)) => Some(format!(
                "SRID=4326;LINESTRING({p_lon} {p_lat},{t_lon} {t_lat})"
            )),
            _ => None,
        };
        let insert_line_wkt = real_line_wkt
            .clone()
            .unwrap_or_else(|| format!("SRID=4326;LINESTRING({p_lon} {p_lat},{p_lon} {p_lat})"));

        // Upsert section.
        // $5 = geometry for INSERT (always valid, may be degenerate).
        // $6 = geometry for UPDATE (NULL when take_out absent → COALESCE keeps stored value).
        let section_id: i64 = sqlx::query_scalar(
            "INSERT INTO water_sections (waterway_id, name, regions, country, location, created_by)
             VALUES ($1, $2, $3, $4, ST_GeomFromEWKT($5), 'rivermap-import')
             ON CONFLICT (waterway_id, name) DO UPDATE
             SET regions    = EXCLUDED.regions,
                 country    = EXCLUDED.country,
                 location   = COALESCE(ST_GeomFromEWKT($6), water_sections.location),
                 updated_at = NOW()
             RETURNING id",
        )
        .bind(waterway_id)
        .bind(&section_name)
        .bind(&regions)
        .bind(country_code)
        .bind(&insert_line_wkt)
        .bind(real_line_wkt.as_deref())
        .fetch_one(pool)
        .await?;
        section_count += 1;

        // Create whitewater feature with grade
        let grade = obj.get("grade").and_then(|v| v.as_str()).unwrap_or("");
        let category = obj
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("whitewater");
        let feature_type = match category {
            "whitewater" | "play" | "slalom" | "drop" => "whitewater",
            _ => "whitewater",
        };
        let metadata = serde_json::json!({ "difficulty": grade });

        // Upsert the main whitewater feature for this section.
        // No unique constraint exists so we use an UPDATE-or-INSERT CTE.
        let feature_id: i64 = sqlx::query_scalar(
            "WITH upd AS (
                 UPDATE features
                 SET metadata = $3, location = ST_GeomFromEWKT($4), updated_at = NOW()
                 WHERE section_id = $1 AND feature_type = $2::feature_type
                   AND created_by = 'rivermap-import'
                 RETURNING id
             ), ins AS (
                 INSERT INTO features (section_id, feature_type, metadata, location, created_by)
                 SELECT $1, $2::feature_type, $3, ST_GeomFromEWKT($4), 'rivermap-import'
                 WHERE NOT EXISTS (SELECT 1 FROM upd)
                 RETURNING id
             )
             SELECT id FROM upd UNION ALL SELECT id FROM ins",
        )
        .bind(section_id)
        .bind(feature_type)
        .bind(&metadata)
        .bind(&insert_line_wkt)
        .fetch_one(pool)
        .await?;
        feature_count += 1;

        // Upsert put-in and take-out access-point features.
        sqlx::query(
            "WITH upd AS (
                 UPDATE features
                 SET location = ST_GeomFromEWKT($2), updated_at = NOW()
                 WHERE section_id = $1 AND feature_type = 'put_in'
                   AND created_by = 'rivermap-import'
                 RETURNING id
             )
             INSERT INTO features (section_id, feature_type, metadata, location, created_by)
             SELECT $1, 'put_in'::feature_type, '{}', ST_GeomFromEWKT($2), 'rivermap-import'
             WHERE NOT EXISTS (SELECT 1 FROM upd)",
        )
        .bind(section_id)
        .bind(format!("SRID=4326;POINT({p_lon} {p_lat})"))
        .execute(pool)
        .await?;
        feature_count += 1;

        // Only store take_out when the source data actually has coordinates.
        if let (Some(t_lat), Some(t_lon)) = (take_lat, take_lon) {
            sqlx::query(
                "WITH upd AS (
                     UPDATE features
                     SET location = ST_GeomFromEWKT($2), updated_at = NOW()
                     WHERE section_id = $1 AND feature_type = 'take_out'
                       AND created_by = 'rivermap-import'
                     RETURNING id
                 )
                 INSERT INTO features (section_id, feature_type, metadata, location, created_by)
                 SELECT $1, 'take_out'::feature_type, '{}', ST_GeomFromEWKT($2), 'rivermap-import'
                 WHERE NOT EXISTS (SELECT 1 FROM upd)",
            )
            .bind(section_id)
            .bind(format!("SRID=4326;POINT({t_lon} {t_lat})"))
            .execute(pool)
            .await?;
            feature_count += 1;
        }

        // Import alternative access-point POIs (putInAlt, takeOutAlt, takeOutEmergency, …).
        // Each POI uses `created_by = "rivermap:{poi_id}"` so re-runs are idempotent
        // without needing a unique constraint.
        let poi_ids = obj
            .get("poiIds")
            .and_then(|v| v.as_array())
            .map(|a| a.as_slice())
            .unwrap_or_default();

        for poi_ref in poi_ids {
            let poi_id = poi_ref.as_str().unwrap_or_default();
            let poi = match poi_map.get(poi_id) {
                Some(p) => p,
                None => continue,
            };
            let poi_type = poi.get("type").and_then(|v| v.as_str()).unwrap_or_default();
            let feature_type = match poi_type {
                "putIn" | "putInAlt" => "put_in",
                "takeOut" | "takeOutAlt" | "takeOutEmergency" => "take_out",
                _ => continue,
            };
            let latlng = match poi.get("latlng").and_then(|v| v.as_array()) {
                Some(a) => a,
                None => continue,
            };
            let (poi_lat, poi_lon) = latlng_to_f64(latlng);
            let (poi_lat, poi_lon) = match (poi_lat, poi_lon) {
                (Some(lat), Some(lon)) => (lat, lon),
                _ => continue,
            };
            let creator = format!("rivermap:{poi_id}");
            sqlx::query(
                "WITH upd AS (
                     UPDATE features
                     SET location = ST_GeomFromEWKT($3), updated_at = NOW()
                     WHERE section_id = $1 AND feature_type = $2::feature_type
                       AND created_by = $4
                     RETURNING id
                 )
                 INSERT INTO features (section_id, feature_type, metadata, location, created_by)
                 SELECT $1, $2::feature_type, '{}', ST_GeomFromEWKT($3), $4
                 WHERE NOT EXISTS (SELECT 1 FROM upd)",
            )
            .bind(section_id)
            .bind(feature_type)
            .bind(format!("SRID=4326;POINT({poi_lon} {poi_lat})"))
            .bind(&creator)
            .execute(pool)
            .await?;
            feature_count += 1;
        }

        // Link calibration to gauge series (water ranges)
        if let Some(calib) = obj.get("calibration").and_then(|v| v.as_object()) {
            let station_id = calib.get("stationId").and_then(|v| v.as_str());
            let unit = calib.get("unit").and_then(|v| v.as_str());
            let mw_min = calib.get("mwMin").and_then(|v| v.as_f64());
            let mw_max = calib.get("mwMax").and_then(|v| v.as_f64());
            let lw = calib.get("lw").and_then(|v| v.as_f64()).or(mw_min);
            let mw = calib.get("mw").and_then(|v| v.as_f64());
            let hw = calib.get("hw").and_then(|v| v.as_f64()).or(mw_max);

            if let (Some(station_id), Some(unit)) = (station_id, unit) {
                // Map Rivermap unit to our param
                let param = match unit {
                    "m3s" | "cfs" | "lts" => "Q",
                    _ => "W", // cm, m, ft
                };
                let source_id = format!("{station_id}:{param}");

                let series_id: Option<i64> = sqlx::query_scalar(
                    "SELECT gs.id FROM gauge_series gs
                     JOIN gauges g ON g.id = gs.gauge_id
                     WHERE g.provider = 'rivermap' AND gs.source_id = $1",
                )
                .bind(&source_id)
                .fetch_optional(pool)
                .await?;

                if let Some(sid) = series_id {
                    // Primary calibrated range
                    sqlx::query(
                        "INSERT INTO feature_water_ranges (feature_id, series_id, range_low, range_medium, range_high)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (feature_id, series_id) DO UPDATE
                         SET range_low = EXCLUDED.range_low,
                             range_medium = EXCLUDED.range_medium,
                             range_high = EXCLUDED.range_high,
                             updated_at = NOW()",
                    )
                    .bind(feature_id)
                    .bind(sid)
                    .bind(lw)
                    .bind(mw)
                    .bind(hw)
                    .execute(pool)
                    .await?;
                    range_count += 1;

                    // Also link the sibling series (same station, opposite param W↔Q)
                    // with null thresholds so the user can toggle between them in the UI.
                    let sibling_param = if param == "Q" { "W" } else { "Q" };
                    let sibling_source_id = format!("{station_id}:{sibling_param}");
                    let sibling_id: Option<i64> = sqlx::query_scalar(
                        "SELECT gs.id FROM gauge_series gs
                         JOIN gauges g ON g.id = gs.gauge_id
                         WHERE g.provider = 'rivermap' AND gs.source_id = $1",
                    )
                    .bind(&sibling_source_id)
                    .fetch_optional(pool)
                    .await?;

                    if let Some(sibling_id) = sibling_id {
                        sqlx::query(
                            "INSERT INTO feature_water_ranges (feature_id, series_id, range_low, range_medium, range_high)
                             VALUES ($1, $2, NULL, NULL, NULL)
                             ON CONFLICT (feature_id, series_id) DO NOTHING",
                        )
                        .bind(feature_id)
                        .bind(sibling_id)
                        .execute(pool)
                        .await?;
                    }
                }
            }
        }
    }

    println!(
        "  Imported {section_count} sections, {feature_count} features, {range_count} water ranges"
    );
    Ok(())
}
