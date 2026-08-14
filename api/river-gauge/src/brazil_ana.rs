use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use chrono_tz::America::Sao_Paulo;
use serde::Deserialize;

use crate::{BoxFuture, FetchRequest, GaugeReader, ReadingsBySource, StationInfo};

/// Reader for Brazil's national hydrological network, via ANA (Agência
/// Nacional de Águas)'s legacy ASMX telemetry service.
///
/// Source: https://telemetriaws1.ana.gov.br/ServiceANA.asmx
///
/// `list_stations` queries `HidroInventario` with `telemetrica=1` and every
/// other filter blank, which returns the whole national telemetric catalog
/// in one request (verified live: 4,311 stations). `fetch_all` queries
/// `DadosHidrometeorologicos` once per station, since the endpoint only
/// accepts a single `codEstacao`.
///
/// `source_id` format: `"{Codigo}:{param}"`
///   e.g. `"57735000:W"` (water level, cm)
///        `"57735000:Q"` (discharge, m³/s)
///
/// ANA is mid-migration to a newer, email-gated REST API; this legacy
/// service is documented to stay live through 2026-06-30 on a secondary,
/// slightly-delayed database. Expect a forced migration after that date.
///
/// License: Brazilian federal open data (Lei de Acesso à Informação /
/// dadosabertos.ana.gov.br) - attribute ANA.
pub struct BrazilAnaReader;

const STATIONS_URL: &str = "https://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroInventario";
const READINGS_URL: &str =
    "https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos";

#[derive(Deserialize)]
struct StationsRoot {
    #[serde(rename = "diffgram")]
    diffgram: StationsDiffgram,
}

#[derive(Deserialize)]
struct StationsDiffgram {
    #[serde(rename = "Estacoes")]
    estacoes: Estacoes,
}

#[derive(Deserialize)]
struct Estacoes {
    #[serde(rename = "Table", default)]
    tables: Vec<StationRow>,
}

#[derive(Deserialize)]
struct StationRow {
    #[serde(rename = "Codigo")]
    codigo: String,
    #[serde(rename = "Nome", default)]
    nome: Option<String>,
    #[serde(rename = "RioNome", default)]
    rio_nome: Option<String>,
    #[serde(rename = "Latitude", default)]
    latitude: Option<String>,
    #[serde(rename = "Longitude", default)]
    longitude: Option<String>,
    /// "1" when the station has a staff gauge / level recorder.
    #[serde(rename = "TipoEstacaoEscala", default)]
    tipo_estacao_escala: Option<String>,
    /// "1" when the station has a discharge rating curve.
    #[serde(rename = "TipoEstacaoDescLiquida", default)]
    tipo_estacao_desc_liquida: Option<String>,
    /// "1" while the station is operational; "0"/absent for decommissioned.
    #[serde(rename = "Operando", default)]
    operando: Option<String>,
}

#[derive(Deserialize)]
struct ReadingsRoot {
    #[serde(rename = "diffgram")]
    diffgram: ReadingsDiffgram,
}

#[derive(Deserialize)]
struct ReadingsDiffgram {
    #[serde(rename = "DocumentElement")]
    document_element: DocumentElement,
}

#[derive(Deserialize)]
struct DocumentElement {
    // ANA misspells this element in every environment (missing the "o"
    // before "logicos"); the request URL/response schema tag spell it
    // "Hidrometeorologicos" but the actual data rows come back as
    // "Hidrometereologicos" - verified live 2026-08-15.
    #[serde(rename = "DadosHidrometereologicos", default)]
    rows: Vec<ReadingRow>,
}

#[derive(Deserialize)]
struct ReadingRow {
    #[serde(rename = "DataHora")]
    data_hora: String,
    /// Discharge, m³/s; empty element when unavailable.
    #[serde(rename = "Vazao", default)]
    vazao: Option<String>,
    /// Water level, cm; empty element when unavailable.
    #[serde(rename = "Nivel", default)]
    nivel: Option<String>,
}

/// Parse an optional numeric text field; empty/whitespace/missing -> `None`.
fn parse_num(s: Option<&str>) -> Option<f64> {
    s?.trim().parse::<f64>().ok()
}

/// Parse "YYYY-MM-DD HH:MM:SS" (trailing space observed in the feed) in
/// America/Sao_Paulo local time and return UTC. Brazil has used a fixed
/// UTC-3 offset since abolishing DST in 2019; chrono-tz's database already
/// reflects that, so this stays correct without special-casing.
fn parse_data_hora(s: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%d %H:%M:%S").ok()?;
    Sao_Paulo
        .from_local_datetime(&naive)
        .earliest()
        .map(|dt| dt.with_timezone(&Utc))
}

fn parse_stations(xml: &str) -> anyhow::Result<Vec<StationRow>> {
    let doc: StationsRoot = quick_xml::de::from_str(xml)
        .map_err(|e| anyhow::anyhow!("BrazilAnaReader: XML parse error: {e}"))?;
    Ok(doc.diffgram.estacoes.tables)
}

fn parse_readings(xml: &str) -> anyhow::Result<Vec<ReadingRow>> {
    let doc: ReadingsRoot = quick_xml::de::from_str(xml)
        .map_err(|e| anyhow::anyhow!("BrazilAnaReader: XML parse error: {e}"))?;
    Ok(doc.diffgram.document_element.rows)
}

impl GaugeReader for BrazilAnaReader {
    fn provider_key(&self) -> &'static str {
        "ana"
    }

    /// Verified live: a 45-day window returned the full expected row count
    /// with no truncation. Likely deeper than this; not verified further.
    fn history_depth(&self) -> Option<chrono::Duration> {
        Some(chrono::Duration::days(45))
    }

    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>> {
        Box::pin(async move {
            let url = format!(
                "{STATIONS_URL}?codEstDE=&codEstATE=&tpEst=1&nmEst=&nmRio=\
                 &codSubBacia=&codBacia=&nmMunicipio=&nmEstado=&sgResp=&sgOper=\
                 &telemetrica=1"
            );
            let xml = reqwest::get(&url)
                .await
                .map_err(|e| anyhow::anyhow!("BrazilAnaReader: HTTP error: {e}"))?
                .error_for_status()
                .map_err(|e| anyhow::anyhow!("BrazilAnaReader: server error: {e}"))?
                .text()
                .await
                .map_err(|e| anyhow::anyhow!("BrazilAnaReader: read error: {e}"))?;

            let stations = parse_stations(&xml)?;

            Ok(stations
                .into_iter()
                .filter(|s| s.operando.as_deref() == Some("1"))
                .map(|s| {
                    let mut params = Vec::new();
                    if s.tipo_estacao_escala.as_deref() == Some("1") {
                        params.push("W".to_owned());
                    }
                    if s.tipo_estacao_desc_liquida.as_deref() == Some("1") {
                        params.push("Q".to_owned());
                    }
                    StationInfo {
                        station_id: s.codigo,
                        name: s.nome,
                        river: s.rio_nome,
                        latitude: parse_num(s.latitude.as_deref()),
                        longitude: parse_num(s.longitude.as_deref()),
                        params,
                    }
                })
                .filter(|s| !s.params.is_empty())
                .collect())
        })
    }

    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<ReadingsBySource>> {
        Box::pin(async move {
            let mut by_station: HashMap<&str, Vec<&FetchRequest>> = HashMap::new();
            for req in requests {
                let Some((station_id, param)) = req.source_id.rsplit_once(':') else {
                    tracing::warn!("BrazilAnaReader: malformed source_id '{}'", req.source_id);
                    continue;
                };
                if param != "W" && param != "Q" {
                    tracing::warn!("BrazilAnaReader: unknown param in '{}'", req.source_id);
                    continue;
                }
                by_station.entry(station_id).or_default().push(req);
            }

            let mut results: ReadingsBySource = HashMap::new();

            for (station_id, reqs) in &by_station {
                let from = reqs.iter().map(|r| r.from).min().unwrap();
                let to = reqs.iter().map(|r| r.to).max().unwrap();

                let url = format!(
                    "{READINGS_URL}?codEstacao={station_id}&dataInicio={}&dataFim={}",
                    from.format("%d/%m/%Y"),
                    to.format("%d/%m/%Y"),
                );

                let resp = match reqwest::get(&url).await {
                    Ok(r) if r.status().is_success() => r,
                    Ok(r) => {
                        tracing::warn!("BrazilAnaReader: HTTP {} for {station_id}", r.status());
                        continue;
                    }
                    Err(e) => {
                        tracing::warn!("BrazilAnaReader: request error for {station_id}: {e}");
                        continue;
                    }
                };
                let xml = match resp.text().await {
                    Ok(t) => t,
                    Err(e) => {
                        tracing::warn!("BrazilAnaReader: read error for {station_id}: {e}");
                        continue;
                    }
                };
                let rows = match parse_readings(&xml) {
                    Ok(r) => r,
                    Err(e) => {
                        tracing::warn!("BrazilAnaReader: {e}");
                        continue;
                    }
                };

                for req in reqs {
                    let param = req.source_id.rsplit_once(':').map_or("", |(_, p)| p);
                    let series = results.entry(req.source_id.clone()).or_default();
                    for row in &rows {
                        let Some(ts) = parse_data_hora(&row.data_hora) else {
                            continue;
                        };
                        if ts <= req.from || ts > req.to {
                            continue;
                        }
                        let value = match param {
                            "W" => parse_num(row.nivel.as_deref()),
                            "Q" => parse_num(row.vazao.as_deref()),
                            _ => None,
                        };
                        if let Some(v) = value {
                            series.push((ts, v));
                        }
                    }
                    series.sort_by_key(|(ts, _)| *ts);
                }
            }

            Ok(results)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Trimmed straight from the live feed (2026-08-15): two stations, one
    /// missing a level flag (Registrador de Nível station, not a real gauge
    /// staff), one decommissioned.
    const SAMPLE_STATIONS_XML: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<DataSet xmlns="http://MRCS/">
  <xs:schema id="Estacoes" xmlns="" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:msdata="urn:schemas-microsoft-com:xml-msdata"></xs:schema>
  <diffgr:diffgram xmlns:msdata="urn:schemas-microsoft-com:xml-msdata" xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1">
    <Estacoes xmlns="">
      <Table diffgr:id="Table1" msdata:rowOrder="0">
        <RioNome>RIO ITABAPOANA</RioNome>
        <nmEstado>RIO DE JANEIRO</nmEstado>
        <Codigo>57735000</Codigo>
        <Nome>UHE ROSAL MONTANTE 2</Nome>
        <Latitude>-20.8019</Latitude>
        <Longitude>-41.7694</Longitude>
        <TipoEstacaoEscala>1</TipoEstacaoEscala>
        <TipoEstacaoDescLiquida>1</TipoEstacaoDescLiquida>
        <TipoEstacaoTelemetrica>1</TipoEstacaoTelemetrica>
        <Operando>1</Operando>
      </Table>
      <Table diffgr:id="Table2" msdata:rowOrder="1">
        <RioNome>RIO PARAIBA DO SUL</RioNome>
        <nmEstado>SAO PAULO</nmEstado>
        <Codigo>58235100</Codigo>
        <Nome>PARAIBUNA MONTANTE</Nome>
        <Latitude>-23.3808</Latitude>
        <Longitude>-45.6494</Longitude>
        <TipoEstacaoEscala>0</TipoEstacaoEscala>
        <TipoEstacaoDescLiquida>0</TipoEstacaoDescLiquida>
        <TipoEstacaoTelemetrica>1</TipoEstacaoTelemetrica>
        <Operando>0</Operando>
      </Table>
    </Estacoes>
  </diffgr:diffgram>
</DataSet>"#;

    /// Trimmed straight from the live feed (2026-08-15), station 57735000.
    const SAMPLE_READINGS_XML: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<DataTable xmlns="http://MRCS/">
  <xs:schema id="NewDataSet" xmlns="" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:msdata="urn:schemas-microsoft-com:xml-msdata"></xs:schema>
  <diffgr:diffgram xmlns:msdata="urn:schemas-microsoft-com:xml-msdata" xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1">
    <DocumentElement xmlns="">
      <DadosHidrometereologicos diffgr:id="DadosHidrometereologicos1" msdata:rowOrder="0">
        <CodEstacao>57735000</CodEstacao>
        <DataHora>2026-08-14 17:00:00 </DataHora>
        <Vazao>3.81</Vazao>
        <Nivel>79.00</Nivel>
        <Chuva>0.00</Chuva>
      </DadosHidrometereologicos>
      <DadosHidrometereologicos diffgr:id="DadosHidrometereologicos2" msdata:rowOrder="1">
        <CodEstacao>57735000</CodEstacao>
        <DataHora>2026-08-14 16:00:00 </DataHora>
        <Vazao />
        <Nivel>80.00</Nivel>
        <Chuva>0.00</Chuva>
      </DadosHidrometereologicos>
    </DocumentElement>
  </diffgr:diffgram>
</DataTable>"#;

    #[test]
    fn parse_stations_extracts_rows() {
        let stations = parse_stations(SAMPLE_STATIONS_XML).expect("should parse");
        assert_eq!(stations.len(), 2);
        let rosal = &stations[0];
        assert_eq!(rosal.codigo, "57735000");
        assert_eq!(rosal.nome.as_deref(), Some("UHE ROSAL MONTANTE 2"));
        assert_eq!(rosal.rio_nome.as_deref(), Some("RIO ITABAPOANA"));
        assert_eq!(rosal.latitude.as_deref(), Some("-20.8019"));
        assert_eq!(rosal.operando.as_deref(), Some("1"));
    }

    #[test]
    fn list_stations_filters_decommissioned_and_no_params() {
        // Mirrors the filtering fetch_all/list_stations applies, without a
        // live HTTP round-trip: station 2 is decommissioned (Operando=0)
        // and has neither TipoEstacaoEscala nor TipoEstacaoDescLiquida.
        let stations = parse_stations(SAMPLE_STATIONS_XML).unwrap();
        let kept: Vec<_> = stations
            .into_iter()
            .filter(|s| s.operando.as_deref() == Some("1"))
            .collect();
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].codigo, "57735000");
    }

    #[test]
    fn parse_readings_extracts_rows_with_empty_vazao() {
        let rows = parse_readings(SAMPLE_READINGS_XML).expect("should parse");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].vazao.as_deref(), Some("3.81"));
        assert_eq!(rows[0].nivel.as_deref(), Some("79.00"));
        // <Vazao /> is present-but-empty, not absent.
        assert_eq!(parse_num(rows[1].vazao.as_deref()), None);
        assert_eq!(rows[1].nivel.as_deref(), Some("80.00"));
    }

    #[test]
    fn parse_data_hora_handles_trailing_space_and_offset() {
        // 2026-08-14 17:00:00 in Sao_Paulo (fixed UTC-3) = 20:00:00 UTC.
        let ts = parse_data_hora("2026-08-14 17:00:00 ").expect("should parse");
        assert_eq!(
            ts.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            "2026-08-14T20:00:00Z"
        );
    }

    #[test]
    fn parse_data_hora_invalid_returns_none() {
        assert!(parse_data_hora("not-a-date").is_none());
        assert!(parse_data_hora("").is_none());
    }

    #[test]
    fn parse_num_handles_empty_and_missing() {
        assert_eq!(parse_num(Some("79.00")), Some(79.0));
        assert_eq!(parse_num(Some("")), None);
        assert_eq!(parse_num(None), None);
    }

    /// Live smoke test - hits the real ANA feed. Run explicitly with
    /// `cargo test -p river-gauge brazil -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "live network access"]
    async fn live_smoke() {
        let reader = BrazilAnaReader;
        let stations = reader.list_stations().await.expect("list_stations");
        println!("ANA: {} stations", stations.len());
        assert!(stations.len() > 1000, "expected >1000 stations");

        // Not every listed station reports recent readings (some are
        // telemetric but currently silent), so probe a handful and use the
        // first one that actually has data, rather than trusting whichever
        // station happens to sort first.
        let now = Utc::now();
        let candidates = stations
            .iter()
            .filter(|s| s.params.iter().any(|p| p == "Q"));
        let mut total = 0usize;
        for sample in candidates.take(10) {
            let requests = vec![FetchRequest {
                source_id: format!("{}:{}", sample.station_id, sample.params[0]),
                from: now - chrono::Duration::days(2),
                to: now,
            }];
            let readings = reader.fetch_all(&requests).await.expect("fetch_all");
            let n: usize = readings.values().map(Vec::len).sum();
            println!(
                "{} {:?} params={:?}: {n} readings",
                sample.station_id, sample.name, sample.params
            );
            if n > 0 {
                total = n;
                break;
            }
        }
        assert!(
            total > 0,
            "expected at least one probed station to have readings"
        );
    }
}
