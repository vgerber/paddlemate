use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDate, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for Swiss federal hydrology data (BAFU / FOEN).
///
/// Source: https://www.hydrodaten.admin.ch/
/// Wrapper API: https://api.existenz.ch/#hydro
///
/// The existenz.ch API exposes BAFU data as two endpoints:
///   `/hydro/latest`    — most recent reading, any number of locations/params.
///   `/hydro/daterange` — historical readings up to 32 days back (daily granularity).
///
/// A single request can cover all locations and parameters at once, so the
/// entire provider poll is normally one HTTP call.
///
/// `source_id` format: `"{station_id}:{param}"`
///   e.g. `"2016:flow"`        (Aare @ Brugg, discharge m³/s)
///        `"2016:height"`      (Aare @ Brugg, water level cm)
///        `"2016:temperature"` (Aare @ Brugg, water temperature °C)
///
/// Supported params: `height`, `flow`, `temperature`
pub struct SwitzerlandBafuReader;

const BASE_URL: &str = "https://api.existenz.ch/apiv1/hydro";
/// When the overall request window is shorter than this, use the fast
/// `/latest` endpoint; otherwise fall back to `/daterange`.
const LATEST_THRESHOLD_SECS: i64 = 4 * 3600;

#[derive(Deserialize)]
struct ApiResponse {
    payload: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    /// Unix timestamp in seconds.
    timestamp: i64,
    loc: String,
    par: String,
    val: f64,
}

impl SwitzerlandBafuReader {
    async fn fetch_latest(
        locs: &HashSet<&str>,
        params: &HashSet<&str>,
    ) -> anyhow::Result<Vec<Entry>> {
        let url = format!(
            "{BASE_URL}/latest?locations={}&parameters={}&app=paddlemate",
            locs.iter().cloned().collect::<Vec<_>>().join(","),
            params.iter().cloned().collect::<Vec<_>>().join(","),
        );
        let resp: ApiResponse = reqwest::get(&url)
            .await
            .map_err(|e| anyhow::anyhow!("BafuReader: HTTP error fetching latest: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("BafuReader: JSON parse error for latest: {e}"))?;
        Ok(resp.payload)
    }

    async fn fetch_daterange(
        locs: &HashSet<&str>,
        params: &HashSet<&str>,
        start: NaiveDate,
        end: NaiveDate,
    ) -> anyhow::Result<Vec<Entry>> {
        let url = format!(
            "{BASE_URL}/daterange?locations={}&parameters={}&startDate={}&endDate={}&app=paddlemate",
            locs.iter().cloned().collect::<Vec<_>>().join(","),
            params.iter().cloned().collect::<Vec<_>>().join(","),
            start.format("%Y-%m-%d"),
            end.format("%Y-%m-%d"),
        );
        let resp: ApiResponse = reqwest::get(&url)
            .await
            .map_err(|e| anyhow::anyhow!("BafuReader: HTTP error fetching daterange: {e}"))?
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("BafuReader: JSON parse error for daterange: {e}"))?;
        Ok(resp.payload)
    }
}

impl GaugeReader for SwitzerlandBafuReader {
    fn provider_key(&self) -> &'static str {
        "bafu"
    }

    /// existenz.ch `/hydro/daterange` endpoint supports up to 32 days back.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(32))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            Ok(vec![
            StationInfo { station_id: "2011".to_owned(), name: Some("Sion".to_owned()), river: Some("Rhône".to_owned()), latitude: Some(46.219101), longitude: Some(7.3579), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2016".to_owned(), name: Some("Brugg".to_owned()), river: Some("Aare".to_owned()), latitude: Some(47.482498), longitude: Some(8.1949), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2018".to_owned(), name: Some("Mellingen".to_owned()), river: Some("Reuss".to_owned()), latitude: Some(47.421001), longitude: Some(8.2713), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2019".to_owned(), name: Some("Brienzwiler".to_owned()), river: Some("Aare".to_owned()), latitude: Some(46.745701), longitude: Some(8.092), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2024".to_owned(), name: Some("Branson".to_owned()), river: Some("Rhône".to_owned()), latitude: Some(46.125702), longitude: Some(7.0913), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2030".to_owned(), name: Some("Thun".to_owned()), river: Some("Aare".to_owned()), latitude: Some(46.764599), longitude: Some(7.6118), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2033".to_owned(), name: Some("Ilanz".to_owned()), river: Some("Vorderrhein".to_owned()), latitude: Some(46.775799), longitude: Some(9.2064), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2034".to_owned(), name: Some("Payerne, Caserne d'aviation".to_owned()), river: Some("Broye".to_owned()), latitude: Some(46.835899), longitude: Some(6.9361), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2044".to_owned(), name: Some("Andelfingen".to_owned()), river: Some("Thur".to_owned()), latitude: Some(47.5965), longitude: Some(8.682), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2053".to_owned(), name: Some("Martigny, Pont de Rossettan".to_owned()), river: Some("Drance".to_owned()), latitude: Some(46.102001), longitude: Some(7.0672), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2056".to_owned(), name: Some("Seedorf".to_owned()), river: Some("Reuss".to_owned()), latitude: Some(46.8839), longitude: Some(8.6206), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2067".to_owned(), name: Some("Martina".to_owned()), river: Some("Inn".to_owned()), latitude: Some(46.885799), longitude: Some(10.4654), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2078".to_owned(), name: Some("Le Prese (H)".to_owned()), river: Some("Poschiavino".to_owned()), latitude: Some(46.2953), longitude: Some(10.0799), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2086".to_owned(), name: Some("Loderio".to_owned()), river: Some("Brenno".to_owned()), latitude: Some(46.376499), longitude: Some(8.9694), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2087".to_owned(), name: Some("Andermatt".to_owned()), river: Some("Reuss".to_owned()), latitude: Some(46.642601), longitude: Some(8.5903), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2099".to_owned(), name: Some("Zürich, Unterhard".to_owned()), river: Some("Limmat".to_owned()), latitude: Some(47.390598), longitude: Some(8.5254), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2105".to_owned(), name: Some("St. Moritzbad".to_owned()), river: Some("Inn".to_owned()), latitude: Some(46.484699), longitude: Some(9.8341), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2106".to_owned(), name: Some("Münchenstein, Hofmatt".to_owned()), river: Some("Birs".to_owned()), latitude: Some(47.518299), longitude: Some(7.6188), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2109".to_owned(), name: Some("Gsteig".to_owned()), river: Some("Lütschine".to_owned()), latitude: Some(46.6642), longitude: Some(7.8715), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2112".to_owned(), name: Some("Appenzell".to_owned()), river: Some("Sitter".to_owned()), latitude: Some(47.332001), longitude: Some(9.4106), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2117".to_owned(), name: Some("Le Châble, Villette".to_owned()), river: Some("Drance de Bagnes".to_owned()), latitude: Some(46.0807), longitude: Some(7.2131), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2119".to_owned(), name: Some("Fribourg".to_owned()), river: Some("Sarine".to_owned()), latitude: Some(46.803902), longitude: Some(7.169), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2122".to_owned(), name: Some("Moutier, La Charrue".to_owned()), river: Some("Birse".to_owned()), latitude: Some(47.284), longitude: Some(7.3823), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2126".to_owned(), name: Some("Wängi".to_owned()), river: Some("Murg".to_owned()), latitude: Some(47.4963), longitude: Some(8.953), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2132".to_owned(), name: Some("Neftenbach".to_owned()), river: Some("Toess".to_owned()), latitude: Some(47.518799), longitude: Some(8.6529), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2135".to_owned(), name: Some("Bern, Schönau".to_owned()), river: Some("Aare".to_owned()), latitude: Some(46.933102), longitude: Some(7.448), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2141".to_owned(), name: Some("Tiefencastel".to_owned()), river: Some("Albula".to_owned()), latitude: Some(46.662498), longitude: Some(9.5741), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2150".to_owned(), name: Some("Felsenbach".to_owned()), river: Some("Landquart".to_owned()), latitude: Some(46.974602), longitude: Some(9.6121), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2151".to_owned(), name: Some("Oberwil".to_owned()), river: Some("Simme".to_owned()), latitude: Some(46.654999), longitude: Some(7.4394), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2160".to_owned(), name: Some("Broc, Château d'en bas".to_owned()), river: Some("Sarine".to_owned()), latitude: Some(46.602798), longitude: Some(7.093), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2167".to_owned(), name: Some("Ponte Tresa, Rocchetta".to_owned()), river: Some("Tresa".to_owned()), latitude: Some(45.972), longitude: Some(8.8524), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2179".to_owned(), name: Some("Thörishaus, Sensematt".to_owned()), river: Some("Sense".to_owned()), latitude: Some(46.888302), longitude: Some(7.3514), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2181".to_owned(), name: Some("Halden".to_owned()), river: Some("Thur".to_owned()), latitude: Some(47.505798), longitude: Some(9.2115), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2185".to_owned(), name: Some("Chur".to_owned()), river: Some("Plessur".to_owned()), latitude: Some(46.853901), longitude: Some(9.5172), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2200".to_owned(), name: Some("Zweilütschinen".to_owned()), river: Some("Weisse Lütschine".to_owned()), latitude: Some(46.631302), longitude: Some(7.8997), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2203".to_owned(), name: Some("Aigle".to_owned()), river: Some("Grande Eau".to_owned()), latitude: Some(46.3204), longitude: Some(6.9691), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2210".to_owned(), name: Some("Ocourt".to_owned()), river: Some("Doubs".to_owned()), latitude: Some(47.3437), longitude: Some(7.0649), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2215".to_owned(), name: Some("Laupen".to_owned()), river: Some("Saane".to_owned()), latitude: Some(46.9086), longitude: Some(7.2344), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2243".to_owned(), name: Some("Baden, Limmatpromenade".to_owned()), river: Some("Limmat".to_owned()), latitude: Some(47.4757), longitude: Some(8.3094), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2256".to_owned(), name: Some("Pontresina".to_owned()), river: Some("Rosegbach".to_owned()), latitude: Some(46.489899), longitude: Some(9.8981), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2262".to_owned(), name: Some("Pontresina".to_owned()), river: Some("Berninabach".to_owned()), latitude: Some(46.486401), longitude: Some(9.9062), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2265".to_owned(), name: Some("Tarasp".to_owned()), river: Some("Inn".to_owned()), latitude: Some(46.789001), longitude: Some(10.2786), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2268".to_owned(), name: Some("Gletsch".to_owned()), river: Some("Rhône".to_owned()), latitude: Some(46.562302), longitude: Some(8.3621), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2269".to_owned(), name: Some("Blatten".to_owned()), river: Some("Lonza".to_owned()), latitude: Some(46.4189), longitude: Some(7.8175), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2303".to_owned(), name: Some("Jonschwil, Mühlau".to_owned()), river: Some("Thur".to_owned()), latitude: Some(47.4137), longitude: Some(9.0775), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2305".to_owned(), name: Some("Herisau, Zellersmühle".to_owned()), river: Some("Glatt".to_owned()), latitude: Some(47.398102), longitude: Some(9.2571), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2308".to_owned(), name: Some("Goldach, Bleiche".to_owned()), river: Some("Goldach".to_owned()), latitude: Some(47.487202), longitude: Some(9.4715), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2321".to_owned(), name: Some("Pregassona".to_owned()), river: Some("Cassarate".to_owned()), latitude: Some(46.0177), longitude: Some(8.9625), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2346".to_owned(), name: Some("Brig".to_owned()), river: Some("Rhône".to_owned()), latitude: Some(46.317402), longitude: Some(7.9754), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2351".to_owned(), name: Some("Visp".to_owned()), river: Some("Vispa".to_owned()), latitude: Some(46.292702), longitude: Some(7.8786), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2352".to_owned(), name: Some("Linthal, Ausgleichsbecken KLL (Hauptstation)".to_owned()), river: Some("Linth".to_owned()), latitude: Some(46.916401), longitude: Some(8.9915), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2355".to_owned(), name: Some("Davos, Frauenkirch".to_owned()), river: Some("Landwasser".to_owned()), latitude: Some(46.757801), longitude: Some(9.7903), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2364".to_owned(), name: Some("Piotta".to_owned()), river: Some("Ticino".to_owned()), latitude: Some(46.516701), longitude: Some(8.6715), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2372".to_owned(), name: Some("Mollis, Linthbrücke".to_owned()), river: Some("Linth".to_owned()), latitude: Some(47.101101), longitude: Some(9.072), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2374".to_owned(), name: Some("Mogelsberg, Aachsäge".to_owned()), river: Some("Necker".to_owned()), latitude: Some(47.364201), longitude: Some(9.1214), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2387".to_owned(), name: Some("Fürstenau".to_owned()), river: Some("Hinterrhein".to_owned()), latitude: Some(46.715099), longitude: Some(9.4473), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2403".to_owned(), name: Some("Cinuos".to_owned()), river: Some("Inn".to_owned()), latitude: Some(46.635502), longitude: Some(10.0209), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2409".to_owned(), name: Some("Eggiwil, Heidbüel".to_owned()), river: Some("Emme".to_owned()), latitude: Some(46.871201), longitude: Some(7.8047), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2415".to_owned(), name: Some("Rheinsfelden".to_owned()), river: Some("Glatt".to_owned()), latitude: Some(47.573502), longitude: Some(8.4758), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2419".to_owned(), name: Some("Reckingen".to_owned()), river: Some("Rhône".to_owned()), latitude: Some(46.469501), longitude: Some(8.2447), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2420".to_owned(), name: Some("Lumino, Sassello".to_owned()), river: Some("Moesa".to_owned()), latitude: Some(46.223099), longitude: Some(9.0558), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2426".to_owned(), name: Some("Mels".to_owned()), river: Some("Seez".to_owned()), latitude: Some(47.046501), longitude: Some(9.4182), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2430".to_owned(), name: Some("Sumvitg, Encardens".to_owned()), river: Some("Rein da Sumvitg".to_owned()), latitude: Some(46.649899), longitude: Some(8.9907), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2433".to_owned(), name: Some("Allaman, Le Coulet".to_owned()), river: Some("Aubonne".to_owned()), latitude: Some(46.473301), longitude: Some(6.4064), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2461".to_owned(), name: Some("Magliaso, Ponte".to_owned()), river: Some("Magliasina".to_owned()), latitude: Some(45.981998), longitude: Some(8.879), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2468".to_owned(), name: Some("St. Gallen, Bruggen/Au".to_owned()), river: Some("Sitter".to_owned()), latitude: Some(47.414398), longitude: Some(9.3275), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2473".to_owned(), name: Some("Diepoldsau, Rietbrücke".to_owned()), river: Some("Rhein".to_owned()), latitude: Some(47.383099), longitude: Some(9.6409), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2474".to_owned(), name: Some("Buseno".to_owned()), river: Some("Calancasca".to_owned()), latitude: Some(46.2836), longitude: Some(9.1182), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2475".to_owned(), name: Some("Bignasco, Ponte nuovo".to_owned()), river: Some("Maggia".to_owned()), latitude: Some(46.338299), longitude: Some(8.6081), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2477".to_owned(), name: Some("Zug, Letzi".to_owned()), river: Some("Lorze".to_owned()), latitude: Some(47.180698), longitude: Some(8.502), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2478".to_owned(), name: Some("Soyhières, Bois du Treuil".to_owned()), river: Some("Birse".to_owned()), latitude: Some(47.392399), longitude: Some(7.396), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2480".to_owned(), name: Some("Boudry".to_owned()), river: Some("Areuse".to_owned()), latitude: Some(46.949001), longitude: Some(6.839), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2481".to_owned(), name: Some("Buochs, Flugplatz".to_owned()), river: Some("Engelberger Aa".to_owned()), latitude: Some(46.972801), longitude: Some(8.4053), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2486".to_owned(), name: Some("Vevey, Copet".to_owned()), river: Some("Veveyse".to_owned()), latitude: Some(46.476501), longitude: Some(6.857), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2487".to_owned(), name: Some("Werthenstein, Chappelboden".to_owned()), river: Some("Kleine Emme".to_owned()), latitude: Some(47.034901), longitude: Some(8.0685), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2490".to_owned(), name: Some("Dardagny, Les Granges".to_owned()), river: Some("Allondon".to_owned()), latitude: Some(46.2174), longitude: Some(5.9985), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2493".to_owned(), name: Some("Gland, Route Suisse".to_owned()), river: Some("Promenthouse".to_owned()), latitude: Some(46.405998), longitude: Some(6.2693), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2494".to_owned(), name: Some("Pollegio, Campagna".to_owned()), river: Some("Ticino".to_owned()), latitude: Some(46.359299), longitude: Some(8.9475), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2498".to_owned(), name: Some("Castrisch".to_owned()), river: Some("Glenner".to_owned()), latitude: Some(46.773499), longitude: Some(9.2106), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2602".to_owned(), name: Some("Domat/Ems".to_owned()), river: Some("Rhein".to_owned()), latitude: Some(46.8377), longitude: Some(9.4561), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2605".to_owned(), name: Some("Lavertezzo, Campiöi".to_owned()), river: Some("Verzasca".to_owned()), latitude: Some(46.249001), longitude: Some(8.8446), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2609".to_owned(), name: Some("Einsiedeln".to_owned()), river: Some("Alp".to_owned()), latitude: Some(47.150799), longitude: Some(8.7393), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2610".to_owned(), name: Some("Vicques".to_owned()), river: Some("Scheulte".to_owned()), latitude: Some(47.348202), longitude: Some(7.4318), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2629".to_owned(), name: Some("Agno".to_owned()), river: Some("Vedeggio".to_owned()), latitude: Some(46.002998), longitude: Some(8.9117), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2631".to_owned(), name: Some("Hinterrhein, Schiessplatz".to_owned()), river: Some("Hinterrhein".to_owned()), latitude: Some(46.5233), longitude: Some(9.1813), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "547".to_owned(), name: Some("Blattwag".to_owned()), river: Some("Sihl".to_owned()), latitude: Some(47.174599), longitude: Some(8.674), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "582".to_owned(), name: Some("Rüti".to_owned()), river: Some("Jona".to_owned()), latitude: Some(47.248798), longitude: Some(8.8528), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "HO5804".to_owned(), name: Some("Alt St.Johann, Unterwasser, Chlostobel".to_owned()), river: Some("Thur".to_owned()), latitude: Some(47.195), longitude: Some(9.3012), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "HO5902".to_owned(), name: Some("Stein, Iltishag".to_owned()), river: Some("Thur".to_owned()), latitude: Some(47.191299), longitude: Some(9.2336), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "HOAR9101".to_owned(), name: Some("Hundwil, Aeschentobel".to_owned()), river: Some("Urnäsch".to_owned()), latitude: Some(47.3391), longitude: Some(9.2935), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "HOAR9105".to_owned(), name: Some("Bühler, Au".to_owned()), river: Some("Rotbach".to_owned()), latitude: Some(47.374401), longitude: Some(9.4027), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "linthrueti".to_owned(), name: Some("Rüti".to_owned()), river: Some("Linth".to_owned()), latitude: Some(46.943501), longitude: Some(9.0211), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "sernfmatt".to_owned(), name: Some("Matt".to_owned()), river: Some("Sernf".to_owned()), latitude: Some(46.9631), longitude: Some(9.1681), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "sernfschwa".to_owned(), name: Some("Schwanden".to_owned()), river: Some("Sernf".to_owned()), latitude: Some(46.995098), longitude: Some(9.0818), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2170".to_owned(), name: Some("Genève, Bout du Monde".to_owned()), river: Some("Arve".to_owned()), latitude: Some(46.180302), longitude: Some(6.1593), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2289".to_owned(), name: Some("Basel, Rheinhalle".to_owned()), river: Some("Rhein".to_owned()), latitude: Some(47.559399), longitude: Some(7.6167), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2370".to_owned(), name: Some("Le Noirmont, La Goule".to_owned()), river: Some("Doubs".to_owned()), latitude: Some(47.229198), longitude: Some(6.9293), params: vec!["flow".to_owned()] },
            StationInfo { station_id: "2371".to_owned(), name: Some("Le Chenit, Frontière".to_owned()), river: Some("Orbe".to_owned()), latitude: Some(46.5508), longitude: Some(6.1535), params: vec!["flow".to_owned()] },
            ])
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>> {
        Box::pin(async move {
            // Parse and validate all source_ids up front.
            let parsed: Vec<(&str, &str, &FetchRequest)> = requests
                .iter()
                .filter_map(|req| {
                    match req.source_id.split_once(':') {
                        Some((station_id, param)) => Some((station_id, param, req)),
                        None => {
                            tracing::warn!(
                                "BafuReader: ignoring malformed source_id '{}' (expected '{{station_id}}:{{param}}')",
                                req.source_id
                            );
                            None
                        }
                    }
                })
                .collect();

            if parsed.is_empty() {
                return Ok(HashMap::new());
            }

            let all_locs: HashSet<&str> = parsed.iter().map(|(id, _, _)| *id).collect();
            let all_params: HashSet<&str> = parsed.iter().map(|(_, p, _)| *p).collect();

            // Choose endpoint based on the overall window size.
            let now = Utc::now();
            let earliest_from = requests.iter().map(|r| r.from).min().unwrap_or(now);
            let latest_to = requests.iter().map(|r| r.to).max().unwrap_or(now);

            let entries = if (latest_to - earliest_from).num_seconds() <= LATEST_THRESHOLD_SECS {
                Self::fetch_latest(&all_locs, &all_params).await
            } else {
                let start = earliest_from.date_naive();
                let end = latest_to.date_naive();
                Self::fetch_daterange(&all_locs, &all_params, start, end).await
            };

            let entries = match entries {
                Ok(e) => e,
                Err(err) => {
                    tracing::error!("BafuReader: fetch failed: {err}");
                    return Ok(HashMap::new());
                }
            };

            // Build a lookup: (loc, par) -> (DateTime, f64)
            let mut by_key: HashMap<(&str, &str), (DateTime<Utc>, f64)> = HashMap::new();
            for entry in &entries {
                let ts = DateTime::from_timestamp(entry.timestamp, 0).unwrap_or(now);
                by_key.insert((entry.loc.as_str(), entry.par.as_str()), (ts, entry.val));
            }

            // Distribute readings to the matching source_id, filtered by window.
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
            for (station_id, param, req) in &parsed {
                // For daterange responses we may get many points per location.
                // Filter the full entry list per request window.
                let matching: Vec<(DateTime<Utc>, f64)> = entries
                    .iter()
                    .filter(|e| e.loc == *station_id && e.par == *param)
                    .filter_map(|e| {
                        let ts = DateTime::from_timestamp(e.timestamp, 0)?;
                        if ts > req.from && ts <= req.to {
                            Some((ts, e.val))
                        } else {
                            None
                        }
                    })
                    .collect();

                if !matching.is_empty() {
                    results
                        .entry(req.source_id.clone())
                        .or_default()
                        .extend(matching);
                }
            }

            // For latest-endpoint calls by_key has exactly one point per (loc, par).
            // The above loop already handles that case (one point that either passes or not).
            let _ = by_key; // unused in the unified path — kept for clarity

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- latest threshold boundary ---
    // Verifies the constant matches the documented 4-hour window used to choose
    // between the /latest and /daterange endpoints.
    #[test]
    fn latest_threshold_is_four_hours() {
        assert_eq!(LATEST_THRESHOLD_SECS, 4 * 3600);
    }
}
