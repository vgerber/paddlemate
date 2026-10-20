use serde_json::Value;
use sqlx::PgPool;

use crate::models::{
    feature::{Feature, FeatureDescription, FeatureId, FeatureName, FeatureType},
    geometry::Geometry,
    lang::{DEFAULT_LANG_CODE, debug_assert_normalized},
    water_section::SectionId,
    waterway::WaterwayId,
};
use crate::query::history::{self, Op, Scope, Via};

pub async fn feature_belongs_to_section(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
    feature_id: FeatureId,
) -> Result<bool, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT id FROM features
        WHERE id = $1 AND section_id = $2
          AND $2 IN (SELECT id FROM water_sections WHERE waterway_id = $3)
        "#,
        feature_id,
        section_id,
        waterway_id
    )
    .fetch_optional(pool)
    .await
    .map(|r| r.is_some())
}

pub async fn fetch_names(
    pool: &PgPool,
    feature_id: FeatureId,
) -> Result<Vec<FeatureName>, sqlx::Error> {
    sqlx::query!(
        "SELECT id, feature_id, lang_code, name FROM feature_names WHERE feature_id = $1 ORDER BY lang_code",
        feature_id
    )
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| FeatureName {
                id: r.id,
                feature_id: r.feature_id,
                lang_code: r.lang_code,
                name: r.name,
            })
            .collect()
    })
}

pub async fn fetch_descriptions(
    pool: &PgPool,
    feature_id: FeatureId,
) -> Result<Vec<FeatureDescription>, sqlx::Error> {
    sqlx::query!(
        "SELECT id, feature_id, lang_code, description FROM feature_descriptions WHERE feature_id = $1 ORDER BY lang_code",
        feature_id
    )
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| FeatureDescription {
                id: r.id,
                feature_id: r.feature_id,
                lang_code: r.lang_code,
                description: r.description,
            })
            .collect()
    })
}

pub async fn insert_feature(
    executor: impl sqlx::PgExecutor<'_>,
    section_id: SectionId,
    feature_type: FeatureType,
    metadata: Value,
    location_json: &str,
    created_by: &str,
) -> Result<Feature, sqlx::Error> {
    let r = sqlx::query!(
        r#"
        INSERT INTO features (section_id, feature_type, metadata, location, created_by)
        VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4), $5)
        RETURNING id, section_id, feature_type AS "feature_type: FeatureType",
                  metadata, created_by, ST_AsGeoJSON(location) AS location, created_at, updated_at
        "#,
        section_id,
        feature_type as FeatureType,
        metadata,
        location_json,
        created_by
    )
    .fetch_one(executor)
    .await?;

    Ok(Feature {
        id: r.id,
        section_id: r.section_id,
        feature_type: r.feature_type,
        metadata: r.metadata,
        created_by: r.created_by,
        location: Geometry::from_db(r.location)?,
        names: vec![],
        descriptions: vec![],
        created_at: r.created_at,
        updated_at: r.updated_at,
    })
}

/// Persist a `CreateFeatureBody` - feature row plus localized texts and
/// gauge thresholds - on one connection (callers wrap in a transaction).
/// The single write path shared by the admin endpoint and proposal approval.
pub async fn create_feature_bundle(
    conn: &mut sqlx::PgConnection,
    section_id: SectionId,
    body: &crate::models::feature::CreateFeatureBody,
    via: &Via<'_>,
) -> Result<Feature, sqlx::Error> {
    let location_json =
        serde_json::to_string(&body.location).map_err(|e| sqlx::Error::Decode(e.into()))?;
    let mut feature = insert_feature(
        &mut *conn,
        section_id,
        body.feature_type.clone(),
        body.metadata.clone(),
        &location_json,
        via.actor,
    )
    .await?;

    let lang = body.lang_code.as_deref().unwrap_or(DEFAULT_LANG_CODE);
    if let Some(name) = &body.name {
        feature
            .names
            .push(upsert_name(&mut *conn, feature.id, lang, name).await?);
    }
    if let Some(description) = &body.description {
        feature
            .descriptions
            .push(upsert_description(&mut *conn, feature.id, lang, description).await?);
    }
    for range in &body.water_ranges {
        // A range names its gauge either by an existing series_id or by a
        // catalog station reference, which we resolve-or-create here (creating
        // the gauge + series and marking it active for the poller).
        let series_id = resolve_range_series(&mut *conn, range).await?;
        crate::query::gauges::upsert_feature_water_range_partial(
            &mut *conn,
            feature.id,
            series_id,
            range.range_low,
            range.range_medium,
            range.range_high,
        )
        .await?;
    }

    // The parent river is read from the section, never taken from a payload.
    let waterway_id: i64 =
        sqlx::query_scalar("SELECT waterway_id FROM water_sections WHERE id = $1")
            .bind(section_id)
            .fetch_one(&mut *conn)
            .await?;
    let scope = Scope::feature(waterway_id, section_id, feature.id);
    if let Some(after) = history::snapshot(conn, &scope).await? {
        history::record(conn, &scope, Op::Create, via, &Default::default(), &after).await?;
    }
    Ok(feature)
}

/// Resolve a water-range body to a concrete `series_id`: pass through an
/// existing `series_id`, or resolve-or-create the referenced catalog station.
/// New gauges created here are logged so the caller/poller can backfill them.
pub async fn resolve_range_series(
    conn: &mut sqlx::PgConnection,
    range: &crate::models::gauge::FeatureWaterRangeBody,
) -> Result<crate::models::gauge::SeriesId, sqlx::Error> {
    if let Some(series_id) = range.series_id {
        return Ok(series_id);
    }
    let gauge_ref = range.gauge_ref.as_ref().ok_or_else(|| {
        sqlx::Error::Protocol("water range has neither series_id nor gauge_ref".into())
    })?;
    let (series_id, gauge_id, created) =
        crate::query::gauges::resolve_or_create_series_for_ref(&mut *conn, gauge_ref).await?;
    if created {
        tracing::info!(gauge_id, provider = %gauge_ref.provider, "gauge created from catalog link");
    }
    Ok(series_id)
}

/// What an admin edit of a feature may change.
pub struct FeatureEdit<'a> {
    pub feature_type: Option<FeatureType>,
    pub metadata: Option<Value>,
    pub location_json: Option<String>,
    /// Trimmed and ignored when empty.
    pub name: Option<&'a str>,
    /// Trimmed and ignored when empty.
    pub description: Option<&'a str>,
    /// Normalized language of `name` and `description`.
    pub lang_code: &'a str,
    pub water_ranges: &'a [crate::models::gauge::FeatureWaterRangeBody],
}

/// Edit a feature, its texts and its gauge thresholds in one transaction,
/// together with the history step. None when the feature is not in this
/// section and river.
pub async fn update_feature(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
    feature_id: FeatureId,
    edit: FeatureEdit<'_>,
    actor: &str,
) -> Result<Option<Feature>, sqlx::Error> {
    let scope = Scope::feature(waterway_id, section_id, feature_id);
    let mut tx = pool.begin().await?;
    let r = history::tracked_edit(&mut tx, &scope, &Via::direct(actor), async |conn| {
        let r = sqlx::query!(
            r#"
            UPDATE features
            SET
                feature_type = COALESCE($1, feature_type),
                metadata = COALESCE($2, metadata),
                location = COALESCE(ST_GeomFromGeoJSON($3), location),
                updated_at = NOW()
            WHERE id = $4 AND section_id = $5
              AND $5 IN (SELECT id FROM water_sections WHERE waterway_id = $6)
            RETURNING id, section_id, feature_type AS "feature_type: FeatureType",
                      metadata, created_by, ST_AsGeoJSON(location) AS location, created_at, updated_at
            "#,
            edit.feature_type as Option<FeatureType>,
            edit.metadata,
            edit.location_json,
            feature_id,
            section_id,
            waterway_id
        )
        .fetch_one(&mut *conn)
        .await?;

        if let Some(name) = edit.name.map(str::trim).filter(|s| !s.is_empty()) {
            upsert_name(&mut *conn, feature_id, edit.lang_code, name).await?;
        }
        if let Some(description) = edit.description.map(str::trim).filter(|s| !s.is_empty()) {
            upsert_description(&mut *conn, feature_id, edit.lang_code, description).await?;
        }
        for range in edit.water_ranges {
            // Resolve a catalog reference (creating + activating a gauge) or
            // pass through an existing series_id, then upsert the range.
            let series_id = resolve_range_series(&mut *conn, range).await?;
            crate::query::gauges::upsert_feature_water_range_partial(
                &mut *conn,
                feature_id,
                series_id,
                range.range_low,
                range.range_medium,
                range.range_high,
            )
            .await?;
        }
        Ok(r)
    })
    .await?;
    tx.commit().await?;
    let Some(r) = r else { return Ok(None) };

    let (names, descriptions) =
        tokio::join!(fetch_names(pool, r.id), fetch_descriptions(pool, r.id));

    Ok(Some(Feature {
        id: r.id,
        section_id: r.section_id,
        feature_type: r.feature_type,
        metadata: r.metadata,
        created_by: r.created_by,
        location: Geometry::from_db(r.location)?,
        names: names?,
        descriptions: descriptions?,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }))
}

/// Delete a feature inside its section and river, and record the deletion.
/// The feature's history stays readable afterwards.
pub async fn delete_feature(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
    feature_id: FeatureId,
    actor: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let scope = Scope::feature(waterway_id, section_id, feature_id);
    let deleted = history::tracked_delete(&mut tx, &scope, &Via::direct(actor)).await?;
    tx.commit().await?;
    Ok(deleted)
}

pub async fn upsert_name(
    executor: impl sqlx::PgExecutor<'_>,
    feature_id: FeatureId,
    lang_code: &str,
    name: &str,
) -> Result<FeatureName, sqlx::Error> {
    debug_assert_normalized(lang_code);
    let r = sqlx::query!(
        r#"
        INSERT INTO feature_names (feature_id, lang_code, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (feature_id, lang_code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, feature_id, lang_code, name
        "#,
        feature_id,
        lang_code,
        name
    )
    .fetch_one(executor)
    .await?;

    Ok(FeatureName {
        id: r.id,
        feature_id: r.feature_id,
        lang_code: r.lang_code,
        name: r.name,
    })
}

pub async fn delete_name(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
    feature_id: FeatureId,
    lang_code: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM feature_names
        WHERE feature_id = $1 AND lang_code = $2
          AND $1 IN (
              SELECT id FROM features WHERE section_id = $3
              AND $3 IN (SELECT id FROM water_sections WHERE waterway_id = $4)
          )
        RETURNING id
        "#,
        feature_id,
        lang_code,
        section_id,
        waterway_id
    )
    .fetch_optional(pool)
    .await
    .map(|r| r.is_some())
}

pub async fn upsert_description(
    executor: impl sqlx::PgExecutor<'_>,
    feature_id: FeatureId,
    lang_code: &str,
    description: &str,
) -> Result<FeatureDescription, sqlx::Error> {
    debug_assert_normalized(lang_code);
    let r = sqlx::query!(
        r#"
        INSERT INTO feature_descriptions (feature_id, lang_code, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (feature_id, lang_code) DO UPDATE SET description = EXCLUDED.description
        RETURNING id, feature_id, lang_code, description
        "#,
        feature_id,
        lang_code,
        description
    )
    .fetch_one(executor)
    .await?;

    Ok(FeatureDescription {
        id: r.id,
        feature_id: r.feature_id,
        lang_code: r.lang_code,
        description: r.description,
    })
}

pub async fn delete_description(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
    feature_id: FeatureId,
    lang_code: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM feature_descriptions
        WHERE feature_id = $1 AND lang_code = $2
          AND $1 IN (
              SELECT id FROM features WHERE section_id = $3
              AND $3 IN (SELECT id FROM water_sections WHERE waterway_id = $4)
          )
        RETURNING id
        "#,
        feature_id,
        lang_code,
        section_id,
        waterway_id
    )
    .fetch_optional(pool)
    .await
    .map(|r| r.is_some())
}

pub async fn fetch_features_for_section(
    pool: &PgPool,
    section_id: SectionId,
) -> Result<Vec<Feature>, sqlx::Error> {
    let records = sqlx::query!(
        r#"
        SELECT
            f.id, f.section_id,
            f.feature_type AS "feature_type: FeatureType",
            f.metadata, f.created_by,
            ST_AsGeoJSON(f.location) AS location,
            f.created_at, f.updated_at,
            COALESCE(
                JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
                    'id', fn.id, 'feature_id', fn.feature_id,
                    'lang_code', fn.lang_code, 'name', fn.name
                )) FILTER (WHERE fn.id IS NOT NULL),
                '[]'
            ) AS "names!: serde_json::Value",
            COALESCE(
                JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
                    'id', fd.id, 'feature_id', fd.feature_id,
                    'lang_code', fd.lang_code, 'description', fd.description
                )) FILTER (WHERE fd.id IS NOT NULL),
                '[]'
            ) AS "descriptions!: serde_json::Value"
        FROM features f
        LEFT JOIN feature_names fn ON fn.feature_id = f.id
        LEFT JOIN feature_descriptions fd ON fd.feature_id = f.id
        WHERE f.section_id = $1
        GROUP BY f.id
        ORDER BY f.created_at
        "#,
        section_id
    )
    .fetch_all(pool)
    .await?;

    records
        .into_iter()
        .map(|f| {
            Ok(Feature {
                id: f.id,
                section_id: f.section_id,
                feature_type: f.feature_type,
                metadata: f.metadata,
                created_by: f.created_by,
                location: Geometry::from_db(f.location)?,
                names: serde_json::from_value(f.names).unwrap_or_default(),
                descriptions: serde_json::from_value(f.descriptions).unwrap_or_default(),
                created_at: f.created_at,
                updated_at: f.updated_at,
            })
        })
        .collect()
}

pub async fn fetch_features_for_waterway(
    pool: &PgPool,
    waterway_id: WaterwayId,
) -> Result<std::collections::HashMap<SectionId, Vec<Feature>>, sqlx::Error> {
    let records = sqlx::query!(
        r#"
        SELECT
            f.id, f.section_id,
            f.feature_type AS "feature_type: FeatureType",
            f.metadata, f.created_by,
            ST_AsGeoJSON(f.location) AS location,
            f.created_at, f.updated_at,
            COALESCE(
                JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
                    'id', fn.id, 'feature_id', fn.feature_id,
                    'lang_code', fn.lang_code, 'name', fn.name
                )) FILTER (WHERE fn.id IS NOT NULL),
                '[]'
            ) AS "names!: serde_json::Value",
            COALESCE(
                JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
                    'id', fd.id, 'feature_id', fd.feature_id,
                    'lang_code', fd.lang_code, 'description', fd.description
                )) FILTER (WHERE fd.id IS NOT NULL),
                '[]'
            ) AS "descriptions!: serde_json::Value"
        FROM features f
        JOIN water_sections s ON s.id = f.section_id AND s.waterway_id = $1
        LEFT JOIN feature_names fn ON fn.feature_id = f.id
        LEFT JOIN feature_descriptions fd ON fd.feature_id = f.id
        GROUP BY f.id
        ORDER BY f.section_id, f.created_at
        "#,
        waterway_id
    )
    .fetch_all(pool)
    .await?;

    let mut map: std::collections::HashMap<SectionId, Vec<Feature>> =
        std::collections::HashMap::new();
    for f in records {
        let feature = Feature {
            id: f.id,
            section_id: f.section_id,
            feature_type: f.feature_type,
            metadata: f.metadata,
            created_by: f.created_by,
            location: Geometry::from_db(f.location)?,
            names: serde_json::from_value(f.names).unwrap_or_default(),
            descriptions: serde_json::from_value(f.descriptions).unwrap_or_default(),
            created_at: f.created_at,
            updated_at: f.updated_at,
        };
        map.entry(f.section_id).or_default().push(feature);
    }
    Ok(map)
}

/// Whether the feature exists inside its section and river.
pub async fn feature_exists(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
    feature_id: FeatureId,
) -> Result<bool, sqlx::Error> {
    let row: (bool,) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM features f JOIN water_sections s ON s.id = f.section_id \
         WHERE f.id = $1 AND f.section_id = $2 AND s.waterway_id = $3)",
    )
    .bind(feature_id)
    .bind(section_id)
    .bind(waterway_id)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}
