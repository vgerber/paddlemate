// Provider coverage checklist
// ──────────────────────────────────────────────────────────────
// ✅ austria_tirol        "tirol"   218 gauges  Tirol eGovernment API
// ✅ austria_ehyd         "ehyd"    ~34 gauges  Austrian federal eHYD portal
//                                               (NO, Salzburg, Steiermark, OO,
//                                                Karnten 4/6)
// ✅ austria_vorarlberg   "vbg"     14 gauges   Vorarlberg GeoServer WFS
// ✅ germany_bavaria      "by"      40 gauges   BLfU HND Bayern snapshot
// ✅ germany_bw           "bw"      12+3 gauges BW HVZ snapshot JS (bw + bw-x)
// ✅ germany_pegelonline  "po"      785 gauges  PEGELONLINE WSV REST API
// ✅ germany_saxony       "sx"       7 gauges   Saxony HWIMS RSS feed (LfULG)
// ✅ switzerland_bafu     "bafu"    ~87 gauges  BAFU via existenz.ch
// ✅ france_hubeau        "hubeau"  ~133 gauges Hub'Eau v2 API
// ✅ norway_nve           "nve"     32 gauges   NVE HydAPI (needs NVE_API_KEY)
// ✅ italy_riverzone      "rz"      204 gauges  Riverzone HTML snapshot (IT only)
// ✅ poland_imgw          "pl"       9 gauges   Poland IMGW-PIB snapshot API
// ✅ czech_chmi           "cz"      26 gauges   Czech CHMI HTML table
// ❌ rdbrmc                         51 gauges   Dead provider (rdbrmc.com closed 2024)
// ❌ anu                             6 gauges   Graubuenden cantonal (no public API)
// ❌ be                              3 gauges   Bern cantonal (no public API)
// -  synthetic/visual               36 gauges  Not real gauges, skip
// ──────────────────────────────────────────────────────────────

mod austria_ehyd;
mod austria_tirol;
mod austria_vorarlberg;
mod czech_chmi;
mod france_hubeau;
mod germany_bavaria;
mod germany_bw;
mod germany_pegelonline;
mod germany_saxony;
mod italy_riverzone;
pub mod license;
mod norway_nve;
mod poland_imgw;
mod rivermap;
mod switzerland_bafu;

use std::{collections::HashMap, future::Future, pin::Pin, sync::Arc, time::Instant};

use chrono::{DateTime, Duration, Utc};
pub use rivermap::{
    RivermapReader, RivermapReadingsRange, RivermapSectionBundle, RivermapSource, RivermapStation,
    RivermapUserNote,
};

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Timestamped values for one gauge, oldest first.
pub type Readings = Vec<(DateTime<Utc>, f64)>;

/// Readings keyed by `source_id`, the shape every reader returns.
pub type ReadingsBySource = HashMap<String, Readings>;

/// A whole response held until it goes stale, as the providers that only offer
/// one big snapshot per request cache it.
pub type SnapshotCache<T> = Arc<tokio::sync::Mutex<Option<(Instant, T)>>>;

/// One entry in a batch fetch request.
pub struct FetchRequest {
    pub source_id: String,
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

/// Metadata for a single gauge station returned by [`GaugeReader::list_stations`].
#[derive(Debug, Clone)]
pub struct StationInfo {
    /// The station identifier portion of a `source_id` (everything before the
    /// first `:`). Append `":W"` / `":Q"` etc. to form a complete `source_id`.
    pub station_id: String,
    /// Human-readable station name (e.g. `"DRESDEN"`).
    pub name: Option<String>,
    /// River or water body name (e.g. `"ELBE"`).
    pub river: Option<String>,
    /// WGS-84 latitude.
    pub latitude: Option<f64>,
    /// WGS-84 longitude.
    pub longitude: Option<f64>,
    /// Parameter keys available for this station (e.g. `["W", "Q"]`).
    /// Combine with `station_id` to form `source_id` values for `fetch_all`.
    pub params: Vec<String>,
}

/// Trait implemented by each regional data source.
///
/// `fetch_all` receives all gauges for this provider at once so the
/// implementation can share a single HTTP round-trip across them.
pub trait GaugeReader: Send + Sync {
    /// Unique key that matches the `provider` column in the `gauges` table.
    fn provider_key(&self) -> &'static str;

    /// How far back this provider can serve historical data, counting from now.
    ///
    /// Returns `None` for snapshot-only providers (only the most recent reading
    /// is available). Returns `Some(duration)` when the underlying API or feed
    /// supports querying a time window of at least that length.
    ///
    /// Callers can use this to decide how frequently a provider must be polled
    /// to avoid gaps versus which providers can be back-filled on demand.
    fn history_depth(&self) -> Option<Duration> {
        None
    }

    /// Discover all stations available from this provider.
    ///
    /// Returns `Ok(vec![])` for providers that do not expose a station listing
    /// API. Each [`StationInfo`] contains the `station_id` prefix needed to
    /// build `source_id` values for [`fetch_all`][GaugeReader::fetch_all].
    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async { Ok(vec![]) })
    }

    /// Fetch readings for multiple source IDs in one call.
    /// Returns a map of `source_id -> readings`.
    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<ReadingsBySource>>;
}

/// Build the registry of all available readers.
pub fn build_registry() -> Vec<Arc<dyn GaugeReader>> {
    vec![
        Arc::new(austria_tirol::AustriaTirolReader::default()),
        Arc::new(switzerland_bafu::SwitzerlandBafuReader),
        Arc::new(france_hubeau::FranceHubeauReader),
        Arc::new(norway_nve::NorwayNveReader::default()),
        Arc::new(germany_bavaria::GermanyBavariaReader::default()),
        Arc::new(austria_ehyd::AustriaEhydReader::default()),
        Arc::new(austria_vorarlberg::AustriaVorarlbergReader::default()),
        Arc::new(italy_riverzone::ItalyRiverzoneReader::default()),
        Arc::new(poland_imgw::PolandImgwReader),
        Arc::new(czech_chmi::CzechChmiReader),
        Arc::new(germany_bw::GermanyBadenWuerttembergReader::default()),
        Arc::new(germany_pegelonline::GermanyPegelonlineReader),
        Arc::new(germany_saxony::GermanySaxonyReader),
        Arc::new(rivermap::RivermapReader::default()),
    ]
}
