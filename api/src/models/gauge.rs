use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type GaugeId = i64;
pub type SeriesId = i64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "measurement_type", rename_all = "snake_case")]
pub enum MeasurementType {
    WaterLevel,
    Discharge,
    Temperature,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Gauge {
    pub id: GaugeId,
    pub name: String,
    pub provider: String,
    pub source_id: String,
    pub data_source_id: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub active: bool,
    pub fetch_interval_secs: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GaugeSeries {
    pub id: SeriesId,
    pub gauge_id: GaugeId,
    pub measurement_type: MeasurementType,
    pub unit: String,
    pub label: Option<String>,
    /// Full reader source_id (e.g. "201038:W") used by the background dispatcher.
    pub source_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GaugeWithSeries {
    pub id: GaugeId,
    pub name: String,
    pub provider: String,
    pub source_id: String,
    pub data_source_id: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub active: bool,
    pub fetch_interval_secs: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub series: Vec<GaugeSeries>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GaugeReading {
    pub series_id: SeriesId,
    pub measured_at: DateTime<Utc>,
    pub value: f64,
}

/// Current water level state derived from a reading and its range thresholds.
/// Empty = below low (gray), Low = green, Medium = orange, High = red.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum WaterLevel {
    Empty,
    Low,
    Medium,
    High,
}

impl WaterLevel {
    pub fn from_reading(
        value: Option<f64>,
        range_low: Option<f64>,
        range_medium: Option<f64>,
        range_high: Option<f64>,
    ) -> Self {
        match (value, range_low, range_medium, range_high) {
            (Some(v), _, _, Some(rh)) if v >= rh => WaterLevel::High,
            (Some(v), _, Some(rm), _) if v >= rm => WaterLevel::Medium,
            (Some(v), Some(rl), _, _) if v >= rl => WaterLevel::Low,
            _ => WaterLevel::Empty,
        }
    }
}

/// A water-level threshold range for a feature, referencing a gauge series.
/// Embeds the full series so the frontend can construct readings URLs without a secondary lookup.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FeatureWaterRange {
    pub id: i64,
    pub feature_id: i64,
    pub series: GaugeSeries,
    /// Lower bound of the low range; below this the level is considered empty.
    pub range_low: Option<f64>,
    /// Lower bound of the medium range.
    pub range_medium: Option<f64>,
    /// Lower bound of the high range.
    pub range_high: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A water range entry enriched with the gauge and the most recent reading.
/// Returned by the `water-status` endpoint for a section.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WaterRangeWithStatus {
    pub id: i64,
    pub feature_id: i64,
    pub series: GaugeSeries,
    pub gauge: Gauge,
    pub range_low: Option<f64>,
    pub range_medium: Option<f64>,
    pub range_high: Option<f64>,
    pub latest_reading: Option<GaugeReading>,
    pub level: WaterLevel,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// All water-level ranges for every feature in a section, with their latest readings.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SectionWaterStatus {
    pub ranges: Vec<WaterRangeWithStatus>,
}

// --- Request types ---

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateGaugeRequest {
    pub name: String,
    pub provider: String,
    pub source_id: String,
    pub data_source_id: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub active: Option<bool>,
    pub fetch_interval_secs: Option<i32>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdateGaugeRequest {
    pub name: String,
    pub provider: String,
    pub source_id: String,
    pub data_source_id: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub active: bool,
    pub fetch_interval_secs: i32,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateSeriesRequest {
    pub measurement_type: MeasurementType,
    pub unit: String,
    pub label: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdateSeriesRequest {
    pub measurement_type: MeasurementType,
    pub unit: String,
    pub label: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateWaterRangeRequest {
    pub series_id: SeriesId,
    pub range_low: f64,
    pub range_medium: f64,
    pub range_high: f64,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdateWaterRangeRequest {
    pub range_low: f64,
    pub range_medium: f64,
    pub range_high: f64,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct BackfillRequest {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}
