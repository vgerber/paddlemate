// Provider coverage checklist
// ────────────────────────────────────────────────────────────────────────────
// ✅ austria_tirol          "tirol"     218 gauges    Tirol eGovernment API
// ✅ austria_ehyd           "ehyd"      ~34 gauges    Austrian federal eHYD portal
//                                                     (NO, Salzburg, Steiermark, OO,
//                                                      Karnten 4/6)
// ✅ austria_vorarlberg     "vbg"       14 gauges     Vorarlberg GeoServer WFS
// ✅ germany_bavaria        "by"        40 gauges     BLfU HND Bayern snapshot
// ✅ germany_bw             "bw"        12+3 gauges   BW HVZ snapshot JS (bw + bw-x)
// ✅ germany_pegelonline    "po"        785 gauges    PEGELONLINE WSV REST API
// ✅ germany_saxony         "sx"        7 gauges      Saxony HWIMS RSS feed (LfULG)
// ✅ switzerland_bafu       "bafu"      ~87 gauges    BAFU via existenz.ch
// ✅ france_hubeau          "hubeau"    ~133 gauges   Hub'Eau v2 API
// ✅ norway_nve             "nve"       32 gauges     NVE HydAPI (needs NVE_API_KEY)
// ✅ italy_riverzone        "rz"        204 gauges    Riverzone HTML snapshot (IT only)
// ✅ poland_imgw            "pl"        9 gauges      Poland IMGW-PIB snapshot API
// ✅ czech_chmi             "cz"        26 gauges     Czech CHMI HTML table
// ✅ usa_usgs               "usgs"      ~18k gauges   USGS Water Data OGC API
// ✅ canada_wsc             "wsc"       ~2.6k gauges  ECCC/WSC MSC GeoMet OGC API
// ✅ england_ea             "ea"        ~4.5k gauges  EA flood-monitoring API
// ✅ scotland_sepa          "sepa"      ~400 gauges   SEPA KiWIS API
// ✅ wales_nrw              "nrw"       ~270 gauges   NRW rivers-and-seas JSON (no coords yet)
// ✅ ireland_opw            "opw"       ~460 gauges   OPW waterlevel.ie GeoJSON
// ✅ ireland_riverspy       "riverspy"  812 gauges    riverspy.net (OPW+EPA+ESB, has flow)
// ✅ slovenia_arso          "arso"      163 gauges    ARSO XML snapshot
// ✅ croatia_hv             "hv"        342 gauges    Croatian HV feed
// ✅ bosnia_vodaba          "vodaba"    230 gauges    Bosnia Vodaba feed
// ✅ greece_openhi          "openhi"    22 gauges     Greece OpenHi feed
// ✅ australia_bom          "bom"       7,613 gauges  Australia BOM feed
// ✅ newzealand_hilltop     "hilltop"   1,023 gauges  NZ Hilltop WML feed
// ✅ brazil_ana             "ana"       4,311 gauges  ANA HidroWeb ASMX telemetry
//                                                     (legacy service, live through
//                                                      2026-06-30 per ANA docs)
// ✅ srilanka_mevinu        "lk"        40 gauges     Sri Lanka mevinu.com ArcGIS proxy
// ✅ nepal_dhm              "np"        203 gauges    Nepal DHM river-watch snapshot
//                                                     (no coords yet; unit unconfirmed)
// ❌ rdbrmc                             51 gauges     Dead provider (rdbrmc.com closed 2024)
// ❌ anu                                 6 gauges     Graubuenden cantonal (no public API)
// ❌ be                                  3 gauges     Bern cantonal (no public API)
// -  synthetic/visual                   36 gauges    Not real gauges, skip
//
// Researched and left out for now - see doc/fetching-gauge-data.md for the
// full recipes, gotchas and what would need to happen to unblock each one:
// ❌ chile (DGA)         station list ready; readings flow de-risked (see doc)
//                        but not yet implemented/verified end to end
// ❌ argentina (INA)     station list ready; readings endpoint's exact param
//                        shape not yet cracked (returns "missing timeStart")
// ❌ colombia (IDEAM)    station list ready (HTTP-only host); readings
//                        endpoint not yet located
// ❌ peru/ecuador/bolivia  no confirmed working endpoint (Peru/Ecuador have
//                        leads; Bolivia is a dead end - PDF bulletins only)
// ❌ mexico (CONAGUA)    weekly/annual batch data only, no near-real-time API
// ❌ central america     no usable public API found (Costa Rica: 1 hydro
//                        station total; Panama/Guatemala/Honduras/Nicaragua:
//                        no exposed data; El Salvador: promising but bot-
//                        blocked, worth a manual follow-up)
// ❌ uruguay (DINAGUA)   open portal but stale annual data (2017-2019)
// ❌ paraguay (DINAC)    live auto-updating page exists, backing JSON/AJAX
//                        call not yet found - best lead of the excluded set
// ❌ venezuela           nothing usable found
// ❌ india (CWC)         only batch/historical open data found (CKAN, through
//                        2025); no confirmed live feed outside a gated dashboard
// ❌ bhutan, georgia, armenia, kyrgyzstan, tajikistan  no public API found
// ❌ kazakhstan (Kazhydromet)  real 377-station network exists behind an
//                        R Shiny dashboard on a currently-unreachable port
// ❌ turkey (DSI)        real flood-warning telemetry network (TEUS) exists;
//                        public dashboard unreachable from this environment,
//                        worth a retest from elsewhere
// ❌ vietnam/laos/thailand (Mekong River Commission)  real 58-station
//                        telemetry network confirmed; portal is a JS SPA,
//                        needs a browser network trace to find the API
// ❌ philippines (PAGASA)  real 10-min telemetry network confirmed; same JS
//                        SPA blocker as the Mekong countries
// ❌ indonesia            no national hydrological API found (BMKG covers
//                        weather/quakes only)
// ❌ china                no public API found; documented as a known,
//                        unsolved open-data gap (see doc for the citation)
// ❌ south korea (WAMIS)  real API exists and takes a free registered key,
//                        same pattern as NVE_API_KEY/USGS_API_KEY; station-
//                        list endpoint unconfirmed and the host was
//                        unreachable from this environment - retest first
// ────────────────────────────────────────────────────────────────────────────

mod austria_ehyd;
mod austria_tirol;
mod austria_vorarlberg;
mod australia_bom;
mod bosnia_vodaba;
mod brazil_ana;
mod canada_wsc;
mod croatia_hv;
mod czech_chmi;
mod england_ea;
mod france_hubeau;
mod germany_bavaria;
mod germany_bw;
mod germany_pegelonline;
mod germany_saxony;
mod greece_openhi;
mod ireland_opw;
mod ireland_riverspy;
mod italy_riverzone;
pub mod license;
mod nepal_dhm;
mod newzealand_hilltop;
mod norway_nve;
mod poland_imgw;
mod rivermap;
mod scotland_sepa;
mod slovenia_arso;
mod srilanka_mevinu;
mod switzerland_bafu;
mod usa_usgs;
mod wales_nrw;

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
        Arc::new(usa_usgs::UsaUsgsReader::default()),
        Arc::new(canada_wsc::CanadaWscReader),
        Arc::new(england_ea::EnglandEaReader),
        Arc::new(scotland_sepa::ScotlandSepaReader),
        Arc::new(wales_nrw::WalesNrwReader),
        Arc::new(ireland_opw::IrelandOpwReader),
        Arc::new(ireland_riverspy::IrelandRiverspyReader),
        Arc::new(slovenia_arso::SloveniaArsoReader::default()),
        Arc::new(croatia_hv::CroatiaHvReader::default()),
        Arc::new(bosnia_vodaba::BosniaVodabaReader::default()),
        Arc::new(greece_openhi::GreeceOpenhiReader::default()),
        Arc::new(australia_bom::AustraliaBomReader::default()),
        Arc::new(newzealand_hilltop::NewZealandHilltopReader::default()),
        Arc::new(brazil_ana::BrazilAnaReader),
        Arc::new(srilanka_mevinu::SriLankaMevinuReader::default()),
        Arc::new(nepal_dhm::NepalDhmReader::default()),
        Arc::new(rivermap::RivermapReader::default()),
    ]
}
