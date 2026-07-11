use std::collections::HashMap;

use sqlx::PgPool;

use crate::models::{
    water_section::{SectionDescription, SectionId, SectionName},
    waterway::WaterwayId,
};

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
    pool: &PgPool,
    section_id: SectionId,
    lang_code: &str,
    name: &str,
) -> Result<SectionName, sqlx::Error> {
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
    .fetch_one(pool)
    .await
}

pub async fn upsert_description(
    pool: &PgPool,
    section_id: SectionId,
    lang_code: &str,
    description: &str,
) -> Result<SectionDescription, sqlx::Error> {
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
    .fetch_one(pool)
    .await
}
