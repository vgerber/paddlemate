// Provider coverage checklist
// ──────────────────────────────────────────────────────────────
// ✅ austria_tirol      "tirol"   218 gauges  Tirol eGovernment API
// ✅ austria_ehyd       "ehyd"    ~34 gauges  Austrian federal eHYD portal
//                                             (NO, Salzburg, Steiermark, OO,
//                                              Karnten 4/6)
// ✅ austria_vorarlberg "vbg"     14 gauges   Vorarlberg GeoServer WFS
// ✅ germany_bavaria    "by"      40 gauges   BLfU HND Bayern snapshot
// ✅ switzerland_bafu   "bafu"    ~87 gauges  BAFU via existenz.ch
// ✅ france_hubeau      "hubeau"  ~133 gauges Hub'Eau v2 API
// ✅ norway_nve         "nve"     32 gauges   NVE HydAPI (needs NVE_API_KEY)
// ❌ rz                           580 gauges  Riverzone (needs API key)
// ❌ rdbrmc                        51 gauges  Unknown provider
// ❌ cz                            26 gauges  Czech CHMI
// ❌ bw                            12 gauges  Baden-Wuerttemberg (no public API)
// ❌ pl                             9 gauges  Poland
// ❌ sx                             7 gauges  Saxony
// ❌ anu/be/bw-x/ba/ebs            14 gauges  Various (uninvestigated)
// -  synthetic/visual              36 gauges  Not real gauges, skip
// ──────────────────────────────────────────────────────────────

mod austria_ehyd;
mod austria_tirol;
mod austria_vorarlberg;
mod france_hubeau;
mod germany_bavaria;
mod norway_nve;
mod switzerland_bafu;

use std::{collections::HashMap, future::Future, pin::Pin, sync::Arc};

use chrono::{DateTime, Utc};

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// One entry in a batch fetch request.
pub struct FetchRequest {
    pub source_id: String,
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

/// Trait implemented by each regional data source.
///
/// `fetch_all` receives all gauges for this provider at once so the
/// implementation can share a single HTTP round-trip across them.
pub trait GaugeReader: Send + Sync {
    /// Unique key that matches the `provider` column in the `gauges` table.
    fn provider_key(&self) -> &'static str;

    /// Fetch readings for multiple source IDs in one call.
    /// Returns a map of `source_id -> readings`.
    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>>;
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
    ]
}
