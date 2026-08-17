use std::collections::HashMap;

use sqlx::PgPool;

use crate::models::{
    geometry::Geometry,
    lang::debug_assert_normalized,
    water_section::{
        CreateSectionBody, Section, SectionDescription, SectionId, SectionName, UpdateSectionBody,
    },
    waterway::WaterwayId,
};
use crate::query::features;

const SECTION_COLS: &str = "id, waterway_id, name, description, regions, country, ST_AsGeoJSON(location) AS location, created_by, created_at, updated_at";

fn row_to_section(row: &sqlx::postgres::PgRow) -> Result<Section, sqlx::Error> {
    use sqlx::Row;
    let location: Option<String> = row.try_get("location")?;
    Ok(Section {
        id: row.try_get("id")?,
        waterway_id: row.try_get("waterway_id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        regions: row.try_get("regions")?,
        country: row.try_get("country")?,
        location: Geometry::from_db(location)?,
        created_by: row.try_get("created_by")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub async fn fetch_section(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
) -> Result<Option<Section>, sqlx::Error> {
    sqlx::query(&format!(
        "SELECT {SECTION_COLS} FROM water_sections WHERE id = $1 AND waterway_id = $2"
    ))
    .bind(section_id)
    .bind(waterway_id)
    .fetch_optional(pool)
    .await?
    .map(|r| row_to_section(&r))
    .transpose()
}

pub async fn update_section(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
    body: &UpdateSectionBody,
) -> Result<Option<Section>, sqlx::Error> {
    let location_json = body
        .location
        .as_ref()
        .map(|g| serde_json::to_string(g).expect("valid geometry"));
    sqlx::query(&format!(
        "UPDATE water_sections
         SET name        = COALESCE($1, name),
             description = COALESCE($2, description),
             regions     = COALESCE($3, regions),
             country     = COALESCE($4, country),
             location    = COALESCE(ST_GeomFromGeoJSON($5), location),
             updated_at  = NOW()
         WHERE id = $6 AND waterway_id = $7
         RETURNING {SECTION_COLS}"
    ))
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.regions)
    .bind(&body.country)
    .bind(location_json.as_deref())
    .bind(section_id)
    .bind(waterway_id)
    .fetch_optional(pool)
    .await?
    .map(|r| row_to_section(&r))
    .transpose()
}

pub async fn delete_section(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM water_sections WHERE id = $1 AND waterway_id = $2")
        .bind(section_id)
        .bind(waterway_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Persist a `CreateSectionBody` - section row plus localized texts and
/// bundled features - on one connection (callers wrap in a transaction).
/// The single write path shared by the admin endpoint and proposal approval.
pub async fn create_section_bundle(
    conn: &mut sqlx::PgConnection,
    waterway_id: WaterwayId,
    body: &CreateSectionBody,
    created_by: &str,
) -> Result<Section, sqlx::Error> {
    let location_json =
        serde_json::to_string(&body.location).map_err(|e| sqlx::Error::Decode(e.into()))?;
    let row = sqlx::query(&format!(
        "INSERT INTO water_sections (waterway_id, name, description, regions, country, location, created_by)
         VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6), $7)
         RETURNING {SECTION_COLS}"
    ))
    .bind(waterway_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(body.effective_regions())
    .bind(&body.country)
    .bind(&location_json)
    .bind(created_by)
    .fetch_one(&mut *conn)
    .await?;
    let section = row_to_section(&row)?;

    for translation in &body.translations {
        if let Some(name) = &translation.name {
            upsert_name(&mut *conn, section.id, &translation.lang_code, name).await?;
        }
        if let Some(description) = &translation.description {
            upsert_description(&mut *conn, section.id, &translation.lang_code, description).await?;
        }
    }

    for feature in &body.features {
        features::create_feature_bundle(&mut *conn, section.id, feature, created_by).await?;
    }

    Ok(section)
}

pub async fn fetch_names_for_section(
    pool: &PgPool,
    section_id: SectionId,
) -> Result<Vec<SectionName>, sqlx::Error> {
    sqlx::query_as!(
        SectionName,
        "SELECT id, section_id, lang_code, name FROM section_names WHERE section_id = $1",
        section_id
    )
    .fetch_all(pool)
    .await
}

pub async fn fetch_descriptions_for_section(
    pool: &PgPool,
    section_id: SectionId,
) -> Result<Vec<SectionDescription>, sqlx::Error> {
    sqlx::query_as!(
        SectionDescription,
        "SELECT id, section_id, lang_code, description FROM section_descriptions WHERE section_id = $1",
        section_id
    )
    .fetch_all(pool)
    .await
}

pub async fn fetch_names_for_waterway(
    pool: &PgPool,
    waterway_id: WaterwayId,
) -> Result<HashMap<SectionId, Vec<SectionName>>, sqlx::Error> {
    let records = sqlx::query_as!(
        SectionName,
        r#"SELECT sn.id, sn.section_id, sn.lang_code, sn.name
           FROM section_names sn
           JOIN water_sections s ON s.id = sn.section_id
           WHERE s.waterway_id = $1"#,
        waterway_id
    )
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<SectionId, Vec<SectionName>> = HashMap::new();
    for record in records {
        map.entry(record.section_id).or_default().push(record);
    }
    Ok(map)
}

pub async fn fetch_descriptions_for_waterway(
    pool: &PgPool,
    waterway_id: WaterwayId,
) -> Result<HashMap<SectionId, Vec<SectionDescription>>, sqlx::Error> {
    let records = sqlx::query_as!(
        SectionDescription,
        r#"SELECT sd.id, sd.section_id, sd.lang_code, sd.description
           FROM section_descriptions sd
           JOIN water_sections s ON s.id = sd.section_id
           WHERE s.waterway_id = $1"#,
        waterway_id
    )
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<SectionId, Vec<SectionDescription>> = HashMap::new();
    for record in records {
        map.entry(record.section_id).or_default().push(record);
    }
    Ok(map)
}

pub async fn upsert_name(
    executor: impl sqlx::PgExecutor<'_>,
    section_id: SectionId,
    lang_code: &str,
    name: &str,
) -> Result<SectionName, sqlx::Error> {
    debug_assert_normalized(lang_code);
    sqlx::query_as!(
        SectionName,
        r#"INSERT INTO section_names (section_id, lang_code, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (section_id, lang_code) DO UPDATE SET name = EXCLUDED.name
           RETURNING id, section_id, lang_code, name"#,
        section_id,
        lang_code,
        name
    )
    .fetch_one(executor)
    .await
}

pub async fn upsert_description(
    executor: impl sqlx::PgExecutor<'_>,
    section_id: SectionId,
    lang_code: &str,
    description: &str,
) -> Result<SectionDescription, sqlx::Error> {
    debug_assert_normalized(lang_code);
    sqlx::query_as!(
        SectionDescription,
        r#"INSERT INTO section_descriptions (section_id, lang_code, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (section_id, lang_code) DO UPDATE SET description = EXCLUDED.description
           RETURNING id, section_id, lang_code, description"#,
        section_id,
        lang_code,
        description
    )
    .fetch_one(executor)
    .await
}

/// Sections of a waterway without their features or translations, for callers
/// that only need the list rather than the whole waterway payload.
pub async fn list_sections(
    pool: &PgPool,
    waterway_id: WaterwayId,
) -> Result<Vec<Section>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {SECTION_COLS} FROM water_sections WHERE waterway_id = $1 ORDER BY name"
    ))
    .bind(waterway_id)
    .fetch_all(pool)
    .await?;
    rows.iter().map(row_to_section).collect()
}

/// Returns false when the section has no name in that language, so the caller
/// can answer 404 rather than pretend it deleted something.
pub async fn delete_name(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
    lang_code: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        r#"DELETE FROM section_names
           WHERE section_id = $1 AND lang_code = $2
             AND $1 IN (SELECT id FROM water_sections WHERE waterway_id = $3)"#,
        section_id,
        lang_code,
        waterway_id
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn delete_description(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
    lang_code: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        r#"DELETE FROM section_descriptions
           WHERE section_id = $1 AND lang_code = $2
             AND $1 IN (SELECT id FROM water_sections WHERE waterway_id = $3)"#,
        section_id,
        lang_code,
        waterway_id
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// Whether the section exists under that waterway, used to tell "no such
/// section" apart from "no translation in that language".
pub async fn section_exists(
    pool: &PgPool,
    waterway_id: WaterwayId,
    section_id: SectionId,
) -> Result<bool, sqlx::Error> {
    let row: (bool,) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM water_sections WHERE id = $1 AND waterway_id = $2)",
    )
    .bind(section_id)
    .bind(waterway_id)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}
