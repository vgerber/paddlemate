use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type GaugeId = i64;
pub type SeriesId = i64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
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

/// Upstream data source of a gauge - carries the attribution and licensing
/// terms of the provider (imported into the `sources` table by the readers).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GaugeSource {
    pub id: String,
    pub name: String,
    pub short_name: Option<String>,
    /// The provider's own statement, verbatim. Prose, sometimes with links.
    pub licensing_terms: Option<String>,
    pub website: Option<String>,
    pub country_code: Option<String>,
    /// Short license label derived from `licensing_terms`, e.g. "CC BY 4.0".
    /// None when the provider names no license we recognise.
    pub license_name: Option<String>,
    /// Where the license can be read. None when no formal license is stated,
    /// in which case clients link `website` instead.
    pub license_url: Option<String>,
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

impl GaugeWithSeries {
    pub fn from_parts(gauge: Gauge, series: Vec<GaugeSeries>, source: Option<GaugeSource>) -> Self {
        Self {
            id: gauge.id,
            name: gauge.name,
            provider: gauge.provider,
            source_id: gauge.source_id,
            data_source_id: gauge.data_source_id,
            lat: gauge.lat,
            lon: gauge.lon,
            active: gauge.active,
            fetch_interval_secs: gauge.fetch_interval_secs,
            created_at: gauge.created_at,
            updated_at: gauge.updated_at,
            series,
            source,
        }
    }
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
    /// Attribution/licensing of the upstream provider, when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<GaugeSource>,
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
    /// Attribution/licensing of the upstream provider, when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<GaugeSource>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// All water-level ranges for every feature in a section, with their latest readings.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SectionWaterStatus {
    pub ranges: Vec<WaterRangeWithStatus>,
}

/// Snapshot of a single gauge-series reading captured when a descent is logged.
/// Immutable record; reflects conditions at the time of the descent.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SectionWaterSnapshot {
    pub series_id: i64,
    pub gauge_id: i64,
    pub gauge_name: String,
    pub unit: String,
    pub value: Option<f64>,
    pub level: WaterLevel,
    pub measured_at: Option<DateTime<Utc>>,
    pub range_low: Option<f64>,
    pub range_medium: Option<f64>,
    pub range_high: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_avg: Option<f64>,
}

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

/// Water-range thresholds submitted together with a new feature (create
/// endpoints and proposals); thresholds are optional individually.
/// A gauge referenced by its catalog station rather than an existing series.
/// Carried when the user links a station that is not yet a real gauge; the
/// apply path resolves it to (or creates) a gauge + series and starts fetching.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CatalogGaugeRef {
    /// Reader provider key (`gauges.provider`), e.g. "hubeau".
    pub provider: String,
    /// Station id prefix (the `gauges.source_id` for a resolved gauge).
    pub station_id: String,
    pub measurement_type: MeasurementType,
    /// Parameter key appended to build the series source_id, e.g. "W" / "Q".
    pub param: String,
    pub name: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub unit: Option<String>,
}

/// A water range to attach to a feature. It names its gauge one of two ways:
/// an existing `series_id`, or a `gauge_ref` to a catalog station that is
/// resolved-or-created at apply time. Exactly one must be present.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FeatureWaterRangeBody {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub series_id: Option<SeriesId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gauge_ref: Option<CatalogGaugeRef>,
    pub range_low: Option<f64>,
    pub range_medium: Option<f64>,
    pub range_high: Option<f64>,
}

impl FeatureWaterRangeBody {
    /// Exactly one gauge reference, and thresholds strictly increasing where
    /// present. Rejecting here avoids a database CHECK violation at approval.
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.series_id.is_some() == self.gauge_ref.is_some() {
            return Err("a water range needs exactly one of series_id or gauge_ref");
        }
        let ordered = |a: Option<f64>, b: Option<f64>| match (a, b) {
            (Some(a), Some(b)) => a < b,
            _ => true,
        };
        if !ordered(self.range_low, self.range_medium)
            || !ordered(self.range_medium, self.range_high)
            || !ordered(self.range_low, self.range_high)
        {
            return Err("water range thresholds must be increasing: low < medium < high");
        }
        Ok(())
    }
}

/// A search hit from the gauge catalog: either an existing real gauge (with
/// series) or a catalog-only station not yet fetched.
#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GaugeOption {
    Gauge {
        // Boxed to keep the enum small next to the Catalog variant.
        gauge: Box<GaugeWithSeries>,
    },
    Catalog {
        provider: String,
        station_id: String,
        name: Option<String>,
        river: Option<String>,
        country: Option<String>,
        lat: Option<f64>,
        lon: Option<f64>,
        params: Vec<String>,
    },
}

/// A distinct river name from the gauge catalog with its station count and
/// the bounding box of its stations (for focusing the map on the river).
/// Suggests gauge-backed rivers when a user proposes a new river.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CatalogRiver {
    pub river: String,
    pub country: Option<String>,
    pub gauge_count: i64,
    pub min_lat: Option<f64>,
    pub min_lon: Option<f64>,
    pub max_lat: Option<f64>,
    pub max_lon: Option<f64>,
}

/// One gauge as a point on the coverage map, classified by how it is used.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct GaugeMapPoint {
    /// Reader provider key (`gauges.provider` / `gauge_catalog.provider`).
    pub provider: String,
    /// `gauges.source_id` for a real gauge, `gauge_catalog.station_id` otherwise.
    pub station_id: String,
    pub name: Option<String>,
    pub river: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub state: GaugeMapState,
    /// Measurement kinds available: series types for a real gauge, catalog
    /// params (e.g. "W"/"Q") for an available station.
    pub params: Vec<String>,
}

/// Coverage state of a gauge point.
/// `used` = linked to a section feature; `fetched` = polled but unlinked;
/// `available` = a catalog station not yet fetched.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum GaugeMapState {
    Used,
    Fetched,
    Available,
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

#[cfg(test)]
mod water_range_body_tests {
    use super::*;

    fn base() -> FeatureWaterRangeBody {
        FeatureWaterRangeBody {
            series_id: Some(1),
            gauge_ref: None,
            range_low: None,
            range_medium: None,
            range_high: None,
        }
    }

    fn catalog_ref() -> CatalogGaugeRef {
        CatalogGaugeRef {
            provider: "hubeau".into(),
            station_id: "X001".into(),
            measurement_type: MeasurementType::WaterLevel,
            param: "W".into(),
            name: None,
            lat: None,
            lon: None,
            unit: None,
        }
    }

    #[test]
    fn accepts_exactly_one_reference() {
        assert!(base().validate().is_ok());
        let by_ref = FeatureWaterRangeBody {
            series_id: None,
            gauge_ref: Some(catalog_ref()),
            ..base()
        };
        assert!(by_ref.validate().is_ok());
    }

    #[test]
    fn rejects_both_or_neither_reference() {
        let both = FeatureWaterRangeBody {
            series_id: Some(1),
            gauge_ref: Some(catalog_ref()),
            ..base()
        };
        assert!(both.validate().is_err());
        let neither = FeatureWaterRangeBody {
            series_id: None,
            gauge_ref: None,
            ..base()
        };
        assert!(neither.validate().is_err());
    }

    #[test]
    fn rejects_non_increasing_thresholds() {
        let bad = FeatureWaterRangeBody {
            range_low: Some(100.0),
            range_medium: Some(50.0),
            ..base()
        };
        assert!(bad.validate().is_err());
    }

    #[test]
    fn allows_sparse_increasing_thresholds() {
        let ok = FeatureWaterRangeBody {
            range_low: Some(10.0),
            range_high: Some(30.0),
            ..base()
        };
        assert!(ok.validate().is_ok());
    }
}
