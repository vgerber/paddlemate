use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// A GeoJSON position as [longitude, latitude]
pub type Position = [f64; 2];

/// GeoJSON geometry object (RFC 7946)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum Geometry {
    Point {
        coordinates: Position,
    },
    LineString {
        coordinates: Vec<Position>,
    },
    Polygon {
        coordinates: Vec<Vec<Position>>,
    },
    MultiPoint {
        coordinates: Vec<Position>,
    },
    MultiLineString {
        coordinates: Vec<Vec<Position>>,
    },
    MultiPolygon {
        coordinates: Vec<Vec<Vec<Position>>>,
    },
}

impl Geometry {
    /// Parse an `ST_AsGeoJSON` column. A missing or malformed value surfaces
    /// as a decode error (opaque 500 via ApiError::from_db) instead of
    /// panicking the request handler.
    pub fn from_db(raw: Option<String>) -> Result<Self, sqlx::Error> {
        let raw = raw.ok_or_else(|| sqlx::Error::Decode("location is NULL".into()))?;
        serde_json::from_str(&raw).map_err(|e| sqlx::Error::Decode(e.into()))
    }
}
