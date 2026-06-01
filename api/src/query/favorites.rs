use chrono::{DateTime, Utc};
use sqlx::PgPool;

use crate::models::{water_section::SectionId, waterway::WaterwayId};

pub struct SectionFavoriteMeta {
    pub id: SectionId,
    pub waterway_id: WaterwayId,
    pub waterway_name: String,
    pub name: String,
    pub description: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    /// Raw GeoJSON string from ST_AsGeoJSON
    pub location: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn list_section_favorites(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<SectionFavoriteMeta>, sqlx::Error> {
    sqlx::query!(
        r#"
        SELECT
            ws.id,
            ws.waterway_id,
            w.name AS waterway_name,
            ws.name,
            ws.description,
            ws.region,
            ws.country,
            ST_AsGeoJSON(ws.location) AS location,
            ws.created_at,
            ws.updated_at
        FROM user_section_favorites usf
        JOIN water_sections ws ON ws.id = usf.section_id
        JOIN waterways w ON w.id = ws.waterway_id
        WHERE usf.user_id = $1
        ORDER BY usf.created_at DESC
        "#,
        user_id
    )
    .fetch_all(pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|r| SectionFavoriteMeta {
                id: r.id,
                waterway_id: r.waterway_id,
                waterway_name: r.waterway_name,
                name: r.name,
                description: r.description,
                region: r.region,
                country: r.country,
                location: r.location.expect("location is NOT NULL"),
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect()
    })
}

pub async fn add_section_favorite(
    pool: &PgPool,
    user_id: &str,
    section_id: SectionId,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO user_section_favorites (user_id, section_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        "#,
        user_id,
        section_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn remove_section_favorite(
    pool: &PgPool,
    user_id: &str,
    section_id: SectionId,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM user_section_favorites
        WHERE user_id = $1 AND section_id = $2
        "#,
        user_id,
        section_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_favorited_section_ids(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<SectionId>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT section_id FROM user_section_favorites WHERE user_id = $1",
        user_id
    )
    .fetch_all(pool)
    .await
}
