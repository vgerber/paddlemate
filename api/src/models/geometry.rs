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
