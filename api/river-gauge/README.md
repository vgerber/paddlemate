# river-gauge

A multi-provider hydrological gauge reader for Rust. Fetches water level and
discharge time-series data from regional APIs across Europe (Austria,
Switzerland, France, Germany, Norway, Sweden, Italy, Spain/Catalonia, Poland,
Czech Republic, England, Scotland, Wales, Ireland, Slovenia, Croatia, Bosnia,
Greece, Rivermap), North America (USA, Canada), South America (Brazil),
Oceania (Australia, New Zealand) and Asia (Sri Lanka, Nepal).

Official pages:

- Rivermap API docs: [https://api.rivermap.org/](https://api.rivermap.org/)
- Rivermap website: [https://rivermap.org/](https://rivermap.org/)

## Outline

- [Providers](#providers)
- [Authentication & rate limits](#authentication--rate-limits)
- [Usage](#usage)
- [Source ID format](#source-id-format)
- [TODO](#todo)
- [Environment variables](#environment-variables)
- [Trait reference](#trait-reference)

## Providers

| Key        | Region                      | Stations | Historical data                | `list_stations` |
| ---------- | --------------------------- | -------- | ------------------------------ | --------------- |
| `tirol`    | Tyrol, AT                   | 144 (live)   | Snapshot only                  | ✅              |
| `ehyd`     | AT federal (NO/SB/ST/OÖ/KT) | 164 (live)   | Snapshot only                  | ✅              |
| `vbg`      | Vorarlberg, AT              | 14           | Snapshot only                  | ✅              |
| `by`       | Bavaria, DE                 | 40           | Snapshot only                  | —               |
| `bw`       | Baden-Württemberg, DE       | 320 (live)   | Snapshot only                  | ✅              |
| `po`       | Germany federal waterways   | 785          | 30 days                        | ✅              |
| `sx`       | Saxony, DE                  | 194 (live)   | 5 days (RSS)                   | ✅              |
| `bafu`     | Switzerland federal         | 185 (live)   | 32 days                        | ✅              |
| `hubeau`   | France                      | ~4150 (live) | 31 days                        | ✅              |
| `nve`      | Norway                      | ~1300 (live) | Years (requires `NVE_API_KEY`) | ✅              |
| `rivermap` | Rivermap API (v2)           | dynamic  | 6h per call (window-chunked)   | ✅              |
| `rz`       | Italy (riverzone.eu)        | 204          | Snapshot only                  | —               |
| `pl`       | Poland                      | 890 (live)   | Snapshot only                  | ✅              |
| `cz`       | Czech Republic              | 563 (live)   | 7 days                         | ✅              |
| `usgs`     | USA (USGS)                  | ~16.5k (live)| Decades (30-day cold-start cap)| ✅              |
| `wsc`      | Canada (ECCC/WSC)           | 2,627        | 30 days                        | ✅              |
| `ea`       | England (EA)                | 4,451 (live) | ~28 days                       | ✅              |
| `sepa`     | Scotland (SEPA)             | 394 (live)   | Years                          | ✅              |
| `nrw`      | Wales (NRW)                 | 266 (live)   | ~1 year (no coords yet)        | ✅              |
| `opw`      | Ireland (OPW)               | 459 (live)   | ~5 weeks                       | ✅              |
| `riverspy` | Ireland (riverspy.net)      | 812 (live)   | Snapshot only                  | ✅              |
| `arso`     | Slovenia                    | 163 (live)   | Snapshot only                  | ✅              |
| `hv`       | Croatia                     | 342 (live)   | Snapshot only                  | ✅              |
| `vodaba`   | Bosnia (AVP Sava)           | 230 (live)   | ~1 week                        | ✅              |
| `openhi`   | Greece (OpenHi.net)         | 22 (live)    | 1 year                         | ✅              |
| `bom`      | Australia (BOM)             | 7,613 (live) | 180 days (daily-batch updates) | ✅              |
| `hilltop`  | New Zealand (6 councils)    | 1,023 (live) | 30 days                        | ✅              |
| `ana`      | Brazil (ANA)                | 4,311 (live) | 45+ days (verified lower bound)| ✅              |
| `lk`       | Sri Lanka (mevinu.com)      | 40 (live)    | Snapshot only                  | ✅              |
| `np`       | Nepal (DHM)                 | 203 (live)   | Snapshot only (no coords yet)  | ✅              |
| `smhi`     | Sweden (SMHI)               | ~300 (live)  | ~1 day (`latest-day` period)   | ✅              |
| `aca`      | Catalonia, ES (ACA)         | ~84 (live)   | Snapshot only                  | ✅              |

## Authentication & rate limits

Most providers are open, unauthenticated snapshot/REST endpoints with no
documented quota; the table below calls out the ones that need a key or have
a real (documented or observed) limit. Where it says "no documented limit",
that means the source doesn't publish one, not that hammering it is fine -
readers cache snapshot responses and only poll linked gauges.

| Provider   | Key required | Env var            | Sign up                                                              | Rate limit / notes                                                                                                                                     |
| ---------- | ------------ | ------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tirol`    | No           | —                   | —                                                                       | No documented limit. Snapshot regenerated ~1/min; reader caches for `CACHE_TTL_SECS`, so a poll cycle costs one request.                                    |
| `ehyd`     | No           | —                   | —                                                                       | No documented limit. Snapshot-based; reader caches.                                                                                                         |
| `vbg`      | No           | —                   | —                                                                       | No documented limit. One WFS request returns every station.                                                                                                 |
| `by`       | No           | —                   | —                                                                       | No documented limit. Snapshot updates ~15 min; reader caches.                                                                                                |
| `bw`       | No           | —                   | —                                                                       | No documented limit. JS snapshot updates ~15-30 min; reader caches.                                                                                          |
| `po`       | No           | —                   | —                                                                       | No documented limit. Data under [DL-DE→Zero-2.0](https://www.govdata.de/dl-de/zero-2-0) (public-domain-equivalent) licence.                                 |
| `sx`       | No           | —                   | —                                                                       | No documented limit. RSS feed, ~15 min resolution, ~5 days retained.                                                                                         |
| `bafu`     | No           | —                   | —                                                                       | The existenz.ch wrapper asks for a 5-minute refresh interval, appending `&app={name}` for stats, and "please don't abuse the APIs"; non-commercial fair use. |
| `hubeau`   | No           | —                   | —                                                                       | No enforced quota found; docs cite a historical ~10 calls/s server capacity, not a hard limit. Support: assistance.brgm.fr.                                  |
| `nve`      | **Yes**      | `NVE_API_KEY`       | [hydapi.nve.no](https://hydapi.nve.no)                                | Required. Without it, `list_stations` returns empty and polling is skipped (logged as a warning).                                                            |
| `rivermap` | **Yes**      | `RIVERMAP_API_KEY`  | Contact Rivermap for a key                                            | Per-endpoint leaky-bucket limits are documented - see [Rivermap auth and rate-limit notes](#rivermap-auth-and-rate-limit-notes) below.                       |
| `rz`       | No           | —                   | —                                                                       | No documented limit found.                                                                                                                                    |
| `pl`       | No           | —                   | —                                                                       | No documented limit found.                                                                                                                                    |
| `cz`       | No           | —                   | —                                                                       | No documented limit found (HTML scrape; no official API).                                                                                                     |
| `usgs`     | Optional     | `USGS_API_KEY`      | [api.waterdata.usgs.gov/signup](https://api.waterdata.usgs.gov/signup) | ~100 req/hour unauthenticated, ~1,000/hour with a free key. The whole-catalog `list_stations` join (~16k stations, ~40 batched requests) can exceed the unauthenticated cap on its own - get a key for reliable syncs. |
| `wsc`      | No           | —                   | —                                                                       | No documented limit found. `hydrometric-realtime` rejects multi-station queries, so `fetch_all` is one request per station.                                  |
| `ea`       | No           | —                   | —                                                                       | No enforced limit observed; docs ask for one bulk `data/readings?latest` poll per 15 min rather than per-station crawling (this reader still does per-measure requests, bounded by linked gauges). OGL v3, attribute EA.                       |
| `sepa`     | No (optional)| —                   | Email hydrometry-requests@sepa.org.uk for a key                        | Anonymous access is capped at 5,000 credits/day (a data pull costs ~1 credit/1,000 values); register for a higher quota if polling heavily. OGL v3, attribute SEPA.                                                                              |
| `nrw`      | No           | —                   | [api-portal.naturalresources.wales](https://api-portal.naturalresources.wales/) (optional, for the documented-but-latest-only official API instead) | No documented limit on the no-auth endpoints used here; they are undocumented internal endpoints of NRW's own public website (more "may change" risk than a published API). OGL, attribute NRW.  |
| `opw`      | No           | —                   | —                                                                       | No documented limit found. **CC-BY 4.0** - attribute "Contains Irish Public Sector Information licensed under CC BY 4.0 (source http://waterlevel.ie - provided by the Office of Public Works.)".                                               |
| `riverspy` | No           | —                   | —                                                                       | No documented limit found; unofficial third-party aggregator with no site-wide licence - attribute the original agency (`OPW`/`EPA`/`ESB`) per gauge, not riverspy.                                                                              |
| `arso`     | No           | —                   | —                                                                       | No documented limit. XML snapshot refreshed every 30 min; reader caches. Attribute ARSO (Slovenian Environment Agency).                                                                                                                            |
| `hv`       | No           | —                   | —                                                                       | No documented limit. JSON snapshot refreshed ~hourly; reader caches. No explicit licence - attribute Hrvatske vode.                                                                                                                                |
| `vodaba`   | No           | —                   | —                                                                       | No documented limit; static pre-rendered JSON export (not a live API), regenerated continuously. No explicit licence - attribute AVP Sava, Sarajevo.                                                                                              |
| `openhi`   | No           | —                   | —                                                                       | No documented limit found. **CC-BY-SA 4.0** - attribute OpenHi.net / the station owner.                                                                                                                                                            |
| `bom`      | No           | —                   | —                                                                       | No documented limit found, but bom.gov.au rejects some non-browser/datacenter-IP clients - reader pins a browser User-Agent. **CC-BY 4.0 Australia** - attribute the Bureau of Meteorology.                                                       |
| `hilltop`  | No           | —                   | —                                                                       | No documented limit across the 6 independent council servers; one council failing only drops its own stations. Mostly **CC-BY 4.0** - attribute each council individually.                                                                        |
| `ana`      | No           | —                   | —                                                                       | No documented limit found. Legacy ASMX service, documented to stay live through 2026-06-30 (ANA is migrating to a newer, email-gated REST API). Federal open data - attribute ANA.                                                                |
| `lk`       | No           | —                   | —                                                                       | No documented limit found. Third-party aggregator (ArcGIS-shaped feed) - no stated licence; attribute Sri Lanka's Irrigation Department plus the aggregator.                                                                                       |
| `np`       | No           | —                   | —                                                                       | No documented limit found. No stated licence - attribute Nepal's Department of Hydrology and Meteorology (DHM).                                                                                                                                    |
| `smhi`     | No           | —                   | —                                                                       | No documented limit; responses are server-cached for 10 min, so polling faster returns nothing new. **CC-BY 4.0** - attribute "Källa: SMHI".                                                                                                        |
| `aca`      | No           | —                   | —                                                                       | No documented limit found. Sentilo REST API, 15-min cadence; reader caches. Open data - attribute ACA (Agencia Catalana de l'Aigua) / Generalitat de Catalunya.                                                                                     |

## Usage

### Add to `Cargo.toml`

```toml
[dependencies]
river-gauge = { path = "../river-gauge" }
anyhow = "1"
chrono = "0.4"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
```

### Fetch readings for specific gauges

```rust
use chrono::Utc;
use river_gauge::{build_registry, FetchRequest};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let registry = build_registry();

    // Find the PEGELONLINE reader
    let reader = registry
        .iter()
        .find(|r| r.provider_key() == "po")
        .expect("po reader not found");

    let now = Utc::now();
    let requests = vec![
        FetchRequest {
            // Dresden / Elbe — water level
            source_id: "70272185-b2b3-4178-96b8-43bea330dcae:W".into(),
            from: now - chrono::Duration::hours(6),
            to: now,
        },
        FetchRequest {
            // Dresden / Elbe — discharge
            source_id: "70272185-b2b3-4178-96b8-43bea330dcae:Q".into(),
            from: now - chrono::Duration::hours(6),
            to: now,
        },
    ];

    let results = reader.fetch_all(&requests).await?;

    for (source_id, readings) in &results {
        println!("{source_id}:");
        for (ts, value) in readings {
            println!("  {ts}  {value}");
        }
    }

    Ok(())
}
```

### Poll all providers at once

```rust
use chrono::Utc;
use river_gauge::{build_registry, FetchRequest};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let registry = build_registry();

    // One batch of requests per provider
    let by_provider: std::collections::HashMap<&str, Vec<FetchRequest>> =
        std::collections::HashMap::from([
            ("tirol", vec![
                FetchRequest {
                    source_id: "201038:W".into(),
                    from: Utc::now() - chrono::Duration::hours(2),
                    to: Utc::now(),
                },
            ]),
            ("po", vec![
                FetchRequest {
                    source_id: "70272185-b2b3-4178-96b8-43bea330dcae:W".into(),
                    from: Utc::now() - chrono::Duration::days(1),
                    to: Utc::now(),
                },
            ]),
        ]);

    for reader in &registry {
        let Some(requests) = by_provider.get(reader.provider_key()) else {
            continue;
        };
        match reader.fetch_all(requests).await {
            Ok(results) => {
                for (source_id, readings) in results {
                    println!("{}: {} readings", source_id, readings.len());
                }
            }
            Err(e) => eprintln!("{}: error: {e}", reader.provider_key()),
        }
    }

    Ok(())
}
```

### Check whether a provider supports back-filling

```rust
use river_gauge::build_registry;

fn main() {
    let registry = build_registry();
    for reader in &registry {
        match reader.history_depth() {
            Some(d) => println!("{}: {} days of history", reader.provider_key(), d.num_days()),
            None    => println!("{}: snapshot only", reader.provider_key()),
        }
    }
}
```

### Discover all stations from a provider

```rust
use river_gauge::build_registry;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let registry = build_registry();

    let reader = registry
        .iter()
        .find(|r| r.provider_key() == "po")
        .expect("po reader not found");

    let stations = reader.list_stations().await?;
    for s in &stations {
        println!(
            "{} | {} | {} | lat={:?} lon={:?} | params={:?}",
            s.station_id,
            s.name.as_deref().unwrap_or("-"),
            s.river.as_deref().unwrap_or("-"),
            s.latitude,
            s.longitude,
            s.params,
        );
    }
    // Build FetchRequests from the discovered station list:
    let now = chrono::Utc::now();
    let requests: Vec<_> = stations
        .iter()
        .flat_map(|s| {
            s.params.iter().map(|p| river_gauge::FetchRequest {
                source_id: format!("{}:{}", s.station_id, p),
                from: now - chrono::Duration::hours(1),
                to: now,
            })
        })
        .collect();
    let results = reader.fetch_all(&requests).await?;
    println!("{} series fetched", results.len());
    Ok(())
}
```

### Use Rivermap extended endpoints

`RivermapReader` also exposes convenience methods for other Rivermap v2
resources besides `GaugeReader::fetch_all`.

```rust
use chrono::{Duration, Utc};
use river_gauge::RivermapReader;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let reader = RivermapReader::default();

    // Sources / authorities
    let sources = reader.list_sources().await?;
    println!("sources: {}", sources.len());

    // Station metadata
    let stations = reader
        .list_stations_raw(Some("active"), Some("online"))
        .await?;
    println!("stations: {}", stations.len());

    // Sections (+ linked objects bundle)
    let sections = reader.list_sections().await?;
    println!("sections: {}", sections.sections.len());

    // Notes
    let recent_notes = reader.list_recent_notes(Some(24 * 60)).await?;
    println!("notes in last 24h: {}", recent_notes.len());

    // Raw readings per station
    if let Some(station) = stations.first() {
        let now = Utc::now();
        let by_unit = reader
            .get_station_readings(&station.id, now - Duration::hours(6), now)
            .await?;
        println!("units returned: {:?}", by_unit.keys().collect::<Vec<_>>());
    }

    Ok(())
}
```

### Rivermap auth and rate-limit notes

Official reference: [Rivermap API documentation](https://api.rivermap.org/)

- Authentication: send your API key in the `X-Key` header.
- Alternative auth: `key` query parameter is supported by Rivermap docs, but this
  crate uses header-based auth.
- Retries: handle HTTP `429 Too Many Requests` with exponential backoff + jitter.
- Caching: station/source/section metadata is mostly static; cache for minutes to
  hours instead of requesting every poll cycle.

Recommended polling intervals for Rivermap v2 endpoints:

| Endpoint                        | Suggested interval | Notes                                                                                     |
| ------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `GET /v2/stations/:id/readings` | 2-5 minutes        | Primary endpoint used by `fetch_all`; max range per call is 6 hours (reader auto-chunks). |
| `GET /v2/stations`              | 1-6 hours          | Station metadata changes infrequently.                                                    |
| `GET /v2/sources`               | 12-24 hours        | Sources/authorities are very static.                                                      |
| `GET /v2/sections`              | 30-120 minutes     | Section metadata is relatively static; avoid hammering.                                   |
| `GET /v2/notes`                 | 5-30 minutes       | Use this for user-note freshness rather than frequently reloading sections.               |

Indicative throttling documented by Rivermap (subject to change):

- `GET /v2/stations/:id/readings`: leaky bucket size 20, refill 1/sec.
- `GET /v2/stations/readings` (all stations): bucket size 2, refill 1 per 2 min.
- `GET /v2/stations`: bucket size 2, refill 1/hour.
- `GET /v2/sources`: bucket size 2, refill 1/hour.
- `GET /v2/sections`: bucket size 2, refill 1/min.
- `GET /v2/notes`: bucket size 2, refill 1/min.

## Source ID format

Each gauge series is identified by a `source_id` string. The format is
`"{station_identifier}:{param}"` where `param` is typically `W` (water level)
or `Q` (discharge). Provider-specific conventions:

| Provider   | Station identifier                                                 | Params                             |
| ---------- | ------------------------------------------------------------------ | ---------------------------------- |
| `tirol`    | HZBNR number, e.g. `201038`                                        | `W`, `Q`, `WT`                     |
| `ehyd`     | `{canton}.{id}`, e.g. `ooe.0150`                                   | `W`, `Q`                           |
| `vbg`      | WISID, e.g. `V334387`                                              | `W`, `Q`                           |
| `by`       | BLfU station number, e.g. `11418250`                               | `w`, `q` (lowercase)               |
| `bw`       | 4-digit HVZ ID, e.g. `0001`                                        | `W`, `Q`                           |
| `po`       | Station UUID, e.g. `70272185-b2b3-4178-96b8-43bea330dcae`          | `W`, `Q`                           |
| `sx`       | HWIMS station number, e.g. `550490`                                | `W`, `Q`                           |
| `bafu`     | BAFU station number, e.g. `2016`                                   | `height`, `flow`, `temperature`    |
| `hubeau`   | Hub'Eau station code, e.g. `K437311001`                            | `H`, `Q`                           |
| `nve`      | NVE parameter ID, e.g. `2.32.0`                                    | `1000` (stage), `1001` (discharge) |
| `rivermap` | Rivermap station UUID, e.g. `04d0980c-a251-422a-a2c0-e699c84936fe` | `W` (`cm`), `Q` (`m3s`)            |
| `rz`       | Riverzone UUID                                                     | `W`, `Q`                           |
| `pl`       | IMGW station number, e.g. `149200080`                              | `W`, `Q`                           |
| `cz`       | CHMI sequence ID, e.g. `20070907`                                  | `H`, `Q`                           |
| `usgs`     | USGS site id, e.g. `USGS-01646500`                                 | `W` (gage height), `Q` (discharge) |
| `wsc`      | WSC station number, e.g. `05BB001`                                 | `W`, `Q`                           |
| `ea`       | EA stationReference, e.g. `1029TH`                                 | `W`, `Q`                           |
| `sepa`     | SEPA station_no, e.g. `15018`                                      | `W`, `Q`                           |
| `nrw`      | NRW numeric station id, e.g. `4078`                                | `W` only (no flow in this network) |
| `opw`      | OPW 5-digit station code, e.g. `01041`                             | `W` only                           |
| `riverspy` | riverspy gauge code, e.g. `00008`                                  | `W`, `Q` (4 ESB dam-release gauges)|
| `arso`     | ARSO `sifra`, e.g. `1060`                                          | `W`, `Q`                           |
| `hv`       | Hrvatske vode `Sifra`, e.g. `3121` (or `SLxxxx` for shared Slovenian stations) | `W`, `Q`                |
| `vodaba`   | `{site_no}/{station_no}`, e.g. `4/4130`                            | `W` only advertised                |
| `openhi`   | OpenHi station id, e.g. `1486`                                     | `W-{group_id}-{ts_id}`, `Q-{group_id}-{ts_id}` |
| `bom`      | BOM station number, e.g. `403213`                                  | `W`, `Q`                           |
| `hilltop`  | `{council_key}/{site name}`, e.g. `wcrc/Buller Rv @ Te Kuha WCRC`  | `W`, `Q`                           |
| `ana`      | ANA `Codigo`, e.g. `57735000`                                      | `W` (level, cm), `Q` (flow, m³/s)  |
| `lk`       | Gauge name, e.g. `Deraniyagala`                                    | `W` only (no flow field)           |
| `np`       | DHM numeric station id, e.g. `4903`                                | `W` only (unit unconfirmed)        |
| `smhi`     | SMHI station key, e.g. `2357`                                      | `Q` only (level covers ~10 stations, not exposed) |
| `aca`      | Sentilo component id, e.g. `080060-001`                            | `W` (level, cm), `Q` (flow, m³/s)  |

## TODO

Riverzone.eu aggregates data from many regional sources across Europe. The
current `rz` reader only covers Italian stations (those with resolved UUIDs).
The following countries have `rz.*` stations in `gauges.csv` that are not yet
covered by any reader:

| Country        | `rz.*` stations | Notes                                             |
| -------------- | --------------- | ------------------------------------------------- |
| UK             | 101             | Covered directly by `ea`/`sepa`/`nrw` now; these `rz.*` rows are redundant, UUIDs not worth resolving |
| France         | 85              | Overlap with `hubeau`; UUIDs need resolving       |
| Slovakia       | 29              | No dedicated reader                               |
| Switzerland    | 28              | Overlap with `bafu`; UUIDs need resolving         |
| Austria        | 27              | Overlap with `tirol`/`ehyd`; UUIDs need resolving |
| Czech Republic | 27              | Overlap with `cz`; UUIDs need resolving           |
| Spain          | 26              | Catalonia covered by `aca`; other basins have no reader (see doc/fetching-gauge-data.md) |
| Slovenia       | 17              | Overlap with `arso`; UUIDs need resolving         |
| Bosnia         | 8               | Overlap with `vodaba`; UUIDs need resolving       |
| Montenegro     | 8               | No dedicated reader                               |
| Germany        | 9               | Overlap with `by`/`bw`/`po`/`sx`                  |
| Greece         | 7               | Overlap with `openhi`; UUIDs need resolving       |

Options to extend coverage:

- Resolve UUIDs in `import_gauges.py` for countries that overlap with existing
  readers (FR, CH, AT, CZ, DE) so the `rz` reader can serve them.
- Implement dedicated readers for SK and ME where there is a suitable
  public API (UK/Ireland now covered by `ea`/`sepa`/`nrw`/`opw`/`riverspy`;
  SI/BA/GR now covered by `arso`/`vodaba`/`openhi`; Catalonia by `aca` -
  the remaining Spanish basins are blocked per doc/fetching-gauge-data.md).
- `nrw` ships without coordinates - NRW's no-auth endpoints only expose
  British National Grid easting/northing, not WGS84; a verified OSGB36 datum
  transform (or pulling coordinates from the official, key-gated
  `StationData` API instead) would close this gap.

## Environment variables

| Variable           | Provider   | Description                                                                          |
| ------------------ | ---------- | ------------------------------------------------------------------------------------- |
| `NVE_API_KEY`      | `nve`      | Required. Register at [hydapi.nve.no](https://hydapi.nve.no)                          |
| `RIVERMAP_API_KEY` | `rivermap` | Required. Rivermap API key sent via `X-Key` header                                    |
| `USGS_API_KEY`     | `usgs`     | Optional. Free signup at [api.waterdata.usgs.gov/signup](https://api.waterdata.usgs.gov/signup); raises the rate limit from ~100 to ~1,000 req/hour |

## Trait reference

```rust
pub trait GaugeReader: Send + Sync {
    /// Provider key matching the `provider` column in the database.
    fn provider_key(&self) -> &'static str;

    /// Maximum historical window available, or `None` for snapshot-only providers.
    fn history_depth(&self) -> Option<chrono::Duration> { None }

    /// Discover all stations available from this provider.
    /// Returns `Ok(vec![])` for providers that do not expose a station listing.
    fn list_stations<'a>(&'a self) -> BoxFuture<'a, anyhow::Result<Vec<StationInfo>>>;

    /// Fetch readings for a batch of source IDs.
    fn fetch_all<'a>(
        &'a self,
        requests: &'a [FetchRequest],
    ) -> BoxFuture<'a, anyhow::Result<HashMap<String, Vec<(DateTime<Utc>, f64)>>>>;
}

pub struct FetchRequest {
    pub source_id: String,
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

pub struct StationInfo {
    pub station_id: String,       // station identifier (before the `:` in source_id)
    pub name: Option<String>,     // human-readable name
    pub river: Option<String>,    // river/water body name
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub params: Vec<String>,      // available params, e.g. ["W", "Q"]
}
```
