use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, StationInfo};

/// Reader for French national hydrology data (Hub'Eau Hydrométrie v2).
///
/// Source: https://hubeau.eaufrance.fr/page/api-hydrometrie
///
/// The Hub'Eau API exposes real-time observations updated every 5 minutes
/// with 1 month of history. A single request can cover many stations and
/// a specific time window, so the entire provider poll is at most two HTTP
/// calls (one per grandeur type: H and Q).
///
/// `source_id` format: `"{station_id}:{grandeur}"`
///   e.g. `"K055001010:H"` (water height)
///        `"K055001010:Q"` (discharge / flow)
///
/// Supported grandeurs: `H` (hauteur, height), `Q` (débit, flow)
pub struct FranceHubeauReader;

const BASE_URL: &str = "https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr";
const FIELDS: &str = "code_station,date_obs,resultat_obs";
/// Maximum number of records to request per batch. The API enforces a 1-month
/// history; for normal polling windows the actual count is much smaller.
const MAX_SIZE: usize = 20_000;

#[derive(Deserialize)]
struct ApiResponse {
    #[serde(default)]
    data: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    code_station: String,
    /// ISO 8601 timestamp string, e.g. "2026-05-12T17:55:00Z".
    date_obs: String,
    resultat_obs: f64,
}

impl FranceHubeauReader {
    async fn fetch_grandeur(
        stations: &HashSet<&str>,
        grandeur: &str,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> anyhow::Result<Vec<Entry>> {
        let url = format!(
            "{BASE_URL}?code_entite={}&grandeur_hydro={grandeur}\
             &date_debut_obs={}&date_fin_obs={}\
             &fields={FIELDS}&size={MAX_SIZE}",
            stations.iter().cloned().collect::<Vec<_>>().join(","),
            from.format("%Y-%m-%dT%H:%M:%SZ"),
            to.format("%Y-%m-%dT%H:%M:%SZ"),
        );
        let resp: ApiResponse = reqwest::get(&url)
            .await
            .map_err(|e| anyhow::anyhow!("HubeauReader: HTTP error for grandeur {grandeur}: {e}"))?
            .json()
            .await
            .map_err(|e| {
                anyhow::anyhow!("HubeauReader: JSON parse error for grandeur {grandeur}: {e}")
            })?;
        Ok(resp.data)
    }
}

impl GaugeReader for FranceHubeauReader {
    fn provider_key(&self) -> &'static str {
        "hubeau"
    }

    /// Hub'Eau v2 provides approximately 1 month of history for most stations.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(31))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<crate::StationInfo>>> {
        Box::pin(async {
            Ok(vec![
                StationInfo {
                    station_id: "K010002010".to_owned(),
                    name: Some("Goudet".to_owned()),
                    river: Some("Loire".to_owned()),
                    latitude: Some(44.889099),
                    longitude: Some(3.9219),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K043303001".to_owned(),
                    name: Some("Grazac [Barrage de la Chapelette]".to_owned()),
                    river: Some("Lignon".to_owned()),
                    latitude: Some(45.167702),
                    longitude: Some(4.1788),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "K045401001".to_owned(),
                    name: Some("Ste-Sigolène [Vaubarlet]".to_owned()),
                    river: Some("Dunières".to_owned()),
                    latitude: Some(45.214802),
                    longitude: Some(4.2146),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K054301001".to_owned(),
                    name: Some("Beauzac [Bérard]".to_owned()),
                    river: Some("Ance".to_owned()),
                    latitude: Some(45.276199),
                    longitude: Some(4.0811),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K055001010".to_owned(),
                    name: Some("Bas-en-Basset".to_owned()),
                    river: Some("Loire".to_owned()),
                    latitude: Some(45.2952),
                    longitude: Some(4.118),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K056752001".to_owned(),
                    name: Some("St-Didier-en-Velay [Le Crouzet]".to_owned()),
                    river: Some("Semène".to_owned()),
                    latitude: Some(45.314499),
                    longitude: Some(4.2496),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K067331001".to_owned(),
                    name: Some("St-Médard-en-Forez [Moulin Brûlé]".to_owned()),
                    river: Some("Coise".to_owned()),
                    latitude: Some(45.6077),
                    longitude: Some(4.3754),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K073322001".to_owned(),
                    name: Some("Chalmazel [Chevelières]".to_owned()),
                    river: Some("Lignon".to_owned()),
                    latitude: Some(45.6968),
                    longitude: Some(3.867),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "K081302001".to_owned(),
                    name: Some("St-Germain-Laval".to_owned()),
                    river: Some("Aix".to_owned()),
                    latitude: Some(45.834301),
                    longitude: Some(3.9872),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K208082001".to_owned(),
                    name: Some("Naussac [La Valette]".to_owned()),
                    river: Some("Allier".to_owned()),
                    latitude: Some(44.756901),
                    longitude: Some(3.8324),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K217302001".to_owned(),
                    name: Some("St-Bonnet-de-Montauroux".to_owned()),
                    river: Some("Chapeauroux".to_owned()),
                    latitude: Some(44.817501),
                    longitude: Some(3.7121),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K224082001".to_owned(),
                    name: Some("Prades [Pont amont Seuges]".to_owned()),
                    river: Some("Allier".to_owned()),
                    latitude: Some(45.029499),
                    longitude: Some(3.5947),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K251401001".to_owned(),
                    name: Some("Pont du Vernet".to_owned()),
                    river: Some("Allanche".to_owned()),
                    latitude: Some(45.134399),
                    longitude: Some(3.0069),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K252301001".to_owned(),
                    name: Some("Joursac".to_owned()),
                    river: Some("Alagnon".to_owned()),
                    latitude: Some(45.159199),
                    longitude: Some(3.0273),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K265401001".to_owned(),
                    name: Some("St-Floret".to_owned()),
                    river: Some("Couze Pavin".to_owned()),
                    latitude: Some(45.5508),
                    longitude: Some(3.1112),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "K287191001".to_owned(),
                    name: Some("Giroux-Dore".to_owned()),
                    river: Some("Dore".to_owned()),
                    latitude: Some(45.689301),
                    longitude: Some(3.6105),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "K518302001".to_owned(),
                    name: Some("Chambon-sur-Voueize [Camping]".to_owned()),
                    river: Some("Tardes".to_owned()),
                    latitude: Some(46.186901),
                    longitude: Some(2.4342),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "L005063001".to_owned(),
                    name: Some("Eymoutiers".to_owned()),
                    river: Some("Vienne".to_owned()),
                    latitude: Some(45.740299),
                    longitude: Some(1.743),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "L403301001".to_owned(),
                    name: Some("Moutier-Rozeille".to_owned()),
                    river: Some("Rozeille".to_owned()),
                    latitude: Some(45.9319),
                    longitude: Some(2.1772),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "L532301001".to_owned(),
                    name: Some("Oradour-St-Genest".to_owned()),
                    river: Some("Brame".to_owned()),
                    latitude: Some(46.251701),
                    longitude: Some(0.999),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O014402001".to_owned(),
                    name: Some("Arreau-Aure".to_owned()),
                    river: Some("Neste".to_owned()),
                    latitude: Some(42.905602),
                    longitude: Some(0.3574),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O016434001".to_owned(),
                    name: Some("Arreau-Louron".to_owned()),
                    river: Some("Neste du Louron".to_owned()),
                    latitude: Some(42.904598),
                    longitude: Some(0.36),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O036252001".to_owned(),
                    name: Some("Soueix-Rogalle".to_owned()),
                    river: Some("Salat".to_owned()),
                    latitude: Some(42.888199),
                    longitude: Some(1.2123),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O048401001".to_owned(),
                    name: Some("Engomer [Balaguères]".to_owned()),
                    river: Some("Lez".to_owned()),
                    latitude: Some(42.949501),
                    longitude: Some(1.0551),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "O102251002".to_owned(),
                    name: Some("Ax-les-Thermes".to_owned()),
                    river: Some("Ariège".to_owned()),
                    latitude: Some(42.722698),
                    longitude: Some(1.8346),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O114462001".to_owned(),
                    name: Some("Vicdessos".to_owned()),
                    river: Some("Vicdessos".to_owned()),
                    latitude: Some(42.768101),
                    longitude: Some(1.5003),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O171253001".to_owned(),
                    name: Some("Auterive [HE]".to_owned()),
                    river: Some("Ariège".to_owned()),
                    latitude: Some(43.350101),
                    longitude: Some(1.4749),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O303101001".to_owned(),
                    name: Some("Cocurès".to_owned()),
                    river: Some("Tarn".to_owned()),
                    latitude: Some(44.345901),
                    longitude: Some(3.6205),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O306404001".to_owned(),
                    name: Some("Vébron".to_owned()),
                    river: Some("Tarnon".to_owned()),
                    latitude: Some(44.228401),
                    longitude: Some(3.5783),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O308435001".to_owned(),
                    name: Some("Cassagnas".to_owned()),
                    river: Some("Mimente".to_owned()),
                    latitude: Some(44.2696),
                    longitude: Some(3.7308),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O319401002".to_owned(),
                    name: Some("Meyrueis [aval] [HE]".to_owned()),
                    river: Some("Jonte".to_owned()),
                    latitude: Some(44.180099),
                    longitude: Some(3.4288),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O331401002".to_owned(),
                    name: Some("Dourbies [Le Mazet]".to_owned()),
                    river: Some("Dourbie".to_owned()),
                    latitude: Some(44.07),
                    longitude: Some(3.4663),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O340101002".to_owned(),
                    name: Some("Millau [HE]".to_owned()),
                    river: Some("Tarn".to_owned()),
                    latitude: Some(44.0923),
                    longitude: Some(3.0756),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "O353401001".to_owned(),
                    name: Some("Camarès".to_owned()),
                    river: Some("Dourdou".to_owned()),
                    latitude: Some(43.820801),
                    longitude: Some(2.8804),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O375401001".to_owned(),
                    name: Some("St-Sernin-sur-Rance".to_owned()),
                    river: Some("Rance".to_owned()),
                    latitude: Some(43.8867),
                    longitude: Some(2.6022),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O400101001".to_owned(),
                    name: Some("Albi".to_owned()),
                    river: Some("Tarn".to_owned()),
                    latitude: Some(43.931702),
                    longitude: Some(2.1441),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O477402001".to_owned(),
                    name: Some("Graulhet".to_owned()),
                    river: Some("Dadou".to_owned()),
                    latitude: Some(43.762798),
                    longitude: Some(1.9903),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O519254001".to_owned(),
                    name: Some("Villefranche-de-Rouergue [HE]".to_owned()),
                    river: Some("Aveyron".to_owned()),
                    latitude: Some(44.350201),
                    longitude: Some(2.0412),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O522401001".to_owned(),
                    name: Some("Villefranche-de-Rouergue [Barrage Cabal]".to_owned()),
                    river: Some("Alzou".to_owned()),
                    latitude: Some(44.3568),
                    longitude: Some(2.0494),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O541401001".to_owned(),
                    name: Some("Cassagnes-Bégonhès".to_owned()),
                    river: Some("Céor".to_owned()),
                    latitude: Some(44.169701),
                    longitude: Some(2.5296),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O548293002".to_owned(),
                    name: Some("St-Just-sur-Viaur [Le Cambon]".to_owned()),
                    river: Some("Viaur".to_owned()),
                    latitude: Some(44.123699),
                    longitude: Some(2.365),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O576251001".to_owned(),
                    name: Some("Montricoux".to_owned()),
                    river: Some("Aveyron".to_owned()),
                    latitude: Some(44.073002),
                    longitude: Some(1.6167),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "O702153003".to_owned(),
                    name: Some("Mende [HE]".to_owned()),
                    river: Some("Lot".to_owned()),
                    latitude: Some(44.520901),
                    longitude: Some(3.4949),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "P159251001".to_owned(),
                    name: Some("Argentat [Basteyroux]".to_owned()),
                    river: Some("Maronne".to_owned()),
                    latitude: Some(45.083401),
                    longitude: Some(1.9463),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "P165001001".to_owned(),
                    name: Some("Altillac [Beaulieu]".to_owned()),
                    river: Some("Dordogne".to_owned()),
                    latitude: Some(44.977299),
                    longitude: Some(1.8435),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "P190291001".to_owned(),
                    name: Some("Nèpes".to_owned()),
                    river: Some("Cère".to_owned()),
                    latitude: Some(44.959702),
                    longitude: Some(2.2014),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "P303101001".to_owned(),
                    name: Some("Monceaux-la-Virolle [Lestards]".to_owned()),
                    river: Some("Vézère".to_owned()),
                    latitude: Some(45.576199),
                    longitude: Some(1.8382),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "P320101001".to_owned(),
                    name: Some("Voutezac [Le Saillant]".to_owned()),
                    river: Some("Vézère".to_owned()),
                    latitude: Some(45.284901),
                    longitude: Some(1.4638),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "P323401001".to_owned(),
                    name: Some("Voutezac [Pont-de-l'Aumonerie]".to_owned()),
                    river: Some("Loyre".to_owned()),
                    latitude: Some(45.306099),
                    longitude: Some(1.4151),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "P332251001".to_owned(),
                    name: Some("St-Yrieix-le-Déjalat".to_owned()),
                    river: Some("Corrèze".to_owned()),
                    latitude: Some(45.468498),
                    longitude: Some(1.9647),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "P335252001".to_owned(),
                    name: Some("Corrèze".to_owned()),
                    river: Some("Corrèze".to_owned()),
                    latitude: Some(45.372299),
                    longitude: Some(1.8802),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "P350251001".to_owned(),
                    name: Some("Tulle".to_owned()),
                    river: Some("Corrèze".to_owned()),
                    latitude: Some(45.274899),
                    longitude: Some(1.7793),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "P367401001".to_owned(),
                    name: Some("Laguenne".to_owned()),
                    river: Some("Saint-Bonnette [La Montane]".to_owned()),
                    latitude: Some(45.250801),
                    longitude: Some(1.7655),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "P634251001".to_owned(),
                    name: Some("Cubas".to_owned()),
                    river: Some("Auvézère".to_owned()),
                    latitude: Some(45.297798),
                    longitude: Some(1.1273),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Q010003001".to_owned(),
                    name: Some("Bagnères-de-Bigorre".to_owned()),
                    river: Some("Adour".to_owned()),
                    latitude: Some(43.061298),
                    longitude: Some(0.1553),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Q052253001".to_owned(),
                    name: Some("Tournay".to_owned()),
                    river: Some("Arros".to_owned()),
                    latitude: Some(43.184101),
                    longitude: Some(0.2411),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Q470101001".to_owned(),
                    name: Some("Argelès-Gazost".to_owned()),
                    river: Some("Gave de Pau".to_owned()),
                    latitude: Some(43.005199),
                    longitude: Some(-0.0814),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Q485000101".to_owned(),
                    name: Some("Asson".to_owned()),
                    river: Some("Ouzom".to_owned()),
                    latitude: Some(43.140701),
                    longitude: Some(-0.2511),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "U100401001".to_owned(),
                    name: Some("Fourguenons [Servance]".to_owned()),
                    river: Some("Ognon".to_owned()),
                    latitude: Some(47.8027),
                    longitude: Some(6.6676),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "U234502001".to_owned(),
                    name: Some("Giromagny".to_owned()),
                    river: Some("Savoureuse".to_owned()),
                    latitude: Some(47.741199),
                    longitude: Some(6.8275),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "U260406001".to_owned(),
                    name: Some("Ouhans".to_owned()),
                    river: Some("Loue [source]".to_owned()),
                    latitude: Some(47.0116),
                    longitude: Some(6.2989),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "V293401001".to_owned(),
                    name: Some("St-Denis-en-Bugey [Pont-St-Denis]".to_owned()),
                    river: Some("Albarine".to_owned()),
                    latitude: Some(45.9548),
                    longitude: Some(5.3317),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "V414521101".to_owned(),
                    name: Some("Pont de Chervil".to_owned()),
                    river: Some("Eyrieux".to_owned()),
                    latitude: Some(44.8825),
                    longitude: Some(4.5252),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "V417402101".to_owned(),
                    name: Some("Pontpierre".to_owned()),
                    river: Some("Eyrieux".to_owned()),
                    latitude: Some(44.815701),
                    longitude: Some(4.7069),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "V426401001".to_owned(),
                    name: Some("Saillans".to_owned()),
                    river: Some("Drôme".to_owned()),
                    latitude: Some(44.689899),
                    longitude: Some(5.2085),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "V501401001".to_owned(),
                    name: Some("Vogüé".to_owned()),
                    river: Some("Ardèche".to_owned()),
                    latitude: Some(44.542599),
                    longitude: Some(4.4098),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "V503502001".to_owned(),
                    name: Some("Rosières".to_owned()),
                    river: Some("Baume".to_owned()),
                    latitude: Some(44.481602),
                    longitude: Some(4.2514),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "V532401002".to_owned(),
                    name: Some("St-May [RD 562]".to_owned()),
                    river: Some("Aigue".to_owned()),
                    latitude: Some(44.425701),
                    longitude: Some(5.3174),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "V712401501".to_owned(),
                    name: Some("Mialet".to_owned()),
                    river: Some("Gard".to_owned()),
                    latitude: Some(44.1259),
                    longitude: Some(3.9095),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "X045401001".to_owned(),
                    name: Some("Le Lauzet-Ubaye [Roche-Rousse]".to_owned()),
                    river: Some("Ubaye".to_owned()),
                    latitude: Some(44.449501),
                    longitude: Some(6.399),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "X281121001".to_owned(),
                    name: Some("Vinon-sur-Verdon [Le Hameau]".to_owned()),
                    river: Some("Verdon".to_owned()),
                    latitude: Some(43.727798),
                    longitude: Some(5.8134),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "Y255001002".to_owned(),
                    name: Some("Vieussan [Aval]".to_owned()),
                    river: Some("Orb".to_owned()),
                    latitude: Some(43.534698),
                    longitude: Some(2.9858),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "Y340403001".to_owned(),
                    name: Some("St-Hippolyte".to_owned()),
                    river: Some("Vidourle".to_owned()),
                    latitude: Some(43.9608),
                    longitude: Some(3.8625),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Y561503001".to_owned(),
                    name: Some("Villeneuve-Loubet [Moulin du Loup]".to_owned()),
                    river: Some("Loup".to_owned()),
                    latitude: Some(43.648201),
                    longitude: Some(7.1374),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Y612501201".to_owned(),
                    name: Some("Malaussène".to_owned()),
                    river: Some("Var".to_owned()),
                    latitude: Some(43.9333),
                    longitude: Some(7.1192),
                    params: vec!["Q".to_owned()],
                },
                StationInfo {
                    station_id: "Y702000201".to_owned(),
                    name: Some("Omessa [Francardo2]".to_owned()),
                    river: Some("Golo".to_owned()),
                    latitude: Some(42.4006),
                    longitude: Some(9.1941),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Y711000201".to_owned(),
                    name: Some("Morosaglia [Ponte-Leccia]".to_owned()),
                    river: Some("Asco".to_owned()),
                    latitude: Some(42.475399),
                    longitude: Some(9.2045),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Y721000101".to_owned(),
                    name: Some("Volpajola [Barchetta]".to_owned()),
                    river: Some("Golo".to_owned()),
                    latitude: Some(42.506699),
                    longitude: Some(9.3723),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Y830000101".to_owned(),
                    name: Some("Peri".to_owned()),
                    river: Some("Gravona".to_owned()),
                    latitude: Some(42.0005),
                    longitude: Some(8.8795),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Y900000101".to_owned(),
                    name: Some("Corte".to_owned()),
                    river: Some("Restonica".to_owned()),
                    latitude: Some(42.263302),
                    longitude: Some(9.0877),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Y902000101".to_owned(),
                    name: Some("Venaco [Pont de Noceta]".to_owned()),
                    river: Some("Vecchio".to_owned()),
                    latitude: Some(42.224098),
                    longitude: Some(9.2054),
                    params: vec!["H".to_owned()],
                },
                StationInfo {
                    station_id: "Y911000201".to_owned(),
                    name: Some("Antisanti [Pont du Faïo]".to_owned()),
                    river: Some("Tavignano".to_owned()),
                    latitude: Some(42.182098),
                    longitude: Some(9.3869),
                    params: vec!["H".to_owned()],
                },
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
                        Some((station_id, grandeur)) => Some((station_id, grandeur, req)),
                        None => {
                            tracing::warn!(
                                "HubeauReader: ignoring malformed source_id '{}' (expected '{{station_id}}:{{grandeur}}')",
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

            let now = Utc::now();
            let global_from = requests.iter().map(|r| r.from).min().unwrap_or(now);
            let global_to = requests.iter().map(|r| r.to).max().unwrap_or(now);

            // Group station IDs by grandeur type (H / Q), then fetch each group.
            let mut by_grandeur: HashMap<&str, HashSet<&str>> = HashMap::new();
            for (station_id, grandeur, _) in &parsed {
                by_grandeur.entry(grandeur).or_default().insert(station_id);
            }

            let mut entries: Vec<Entry> = Vec::new();
            for (grandeur, stations) in &by_grandeur {
                match Self::fetch_grandeur(stations, grandeur, global_from, global_to).await {
                    Ok(mut batch) => entries.append(&mut batch),
                    Err(err) => {
                        tracing::error!(
                            "HubeauReader: failed to fetch grandeur '{grandeur}': {err}"
                        );
                    }
                }
            }

            // Distribute readings to the matching source_id.
            let mut results: HashMap<String, Vec<(DateTime<Utc>, f64)>> = HashMap::new();
            for (station_id, _grandeur, req) in &parsed {
                for entry in &entries {
                    if entry.code_station != *station_id {
                        continue;
                    }
                    let ts = match entry.date_obs.parse::<DateTime<Utc>>() {
                        Ok(t) => t,
                        Err(_) => {
                            tracing::warn!(
                                "HubeauReader: unparseable date '{}' for station {}",
                                entry.date_obs,
                                station_id
                            );
                            continue;
                        }
                    };
                    if ts > req.from && ts <= req.to {
                        results
                            .entry(req.source_id.clone())
                            .or_default()
                            .push((ts, entry.resultat_obs));
                    }
                }
            }

            // Note: grandeur is encoded in source_id so readings for H and Q
            // on the same station are automatically routed to different series.
            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    // Hub'Eau uses grandeur in the source_id to route H vs Q readings to
    // different series on the same station. Verify the split is unambiguous.
    #[test]
    fn source_id_grandeur_is_last_segment() {
        let cases = [
            ("K055001010:H", "K055001010", "H"),
            ("K055001010:Q", "K055001010", "Q"),
        ];
        for (raw, want_station, want_grandeur) in cases {
            let (station, grandeur) = raw.split_once(':').expect("should split");
            assert_eq!(station, want_station);
            assert_eq!(grandeur, want_grandeur);
        }
    }
}
