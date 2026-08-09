# river-gauge

A multi-provider hydrological gauge reader for Rust. Fetches water level and
discharge time-series data from 14 regional APIs across Europe (Austria,
Switzerland, France, Germany, Norway, Italy, Poland, Czech Republic, Rivermap).

Official pages:

- Rivermap API docs: [https://api.rivermap.org/](https://api.rivermap.org/)
- Rivermap website: [https://rivermap.org/](https://rivermap.org/)

## Outline

- [Providers](#providers)
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

## TODO

Riverzone.eu aggregates data from many regional sources across Europe. The
current `rz` reader only covers Italian stations (those with resolved UUIDs).
The following countries have `rz.*` stations in `gauges.csv` that are not yet
covered by any reader:

| Country        | `rz.*` stations | Notes                                             |
| -------------- | --------------- | ------------------------------------------------- |
| UK             | 101             | Scottish/English rivers; no public UUID mapping   |
| France         | 85              | Overlap with `hubeau`; UUIDs need resolving       |
| Slovakia       | 29              | No dedicated reader                               |
| Switzerland    | 28              | Overlap with `bafu`; UUIDs need resolving         |
| Austria        | 27              | Overlap with `tirol`/`ehyd`; UUIDs need resolving |
| Czech Republic | 27              | Overlap with `cz`; UUIDs need resolving           |
| Spain          | 26              | No dedicated reader                               |
| Slovenia       | 17              | No dedicated reader                               |
| Bosnia         | 8               | No dedicated reader                               |
| Montenegro     | 8               | No dedicated reader                               |
| Germany        | 9               | Overlap with `by`/`bw`/`po`/`sx`                  |
| Greece         | 7               | No dedicated reader                               |

Options to extend coverage:

- Resolve UUIDs in `import_gauges.py` for countries that overlap with existing
  readers (FR, CH, AT, CZ, DE) so the `rz` reader can serve them.
- Implement dedicated readers for UK, SK, SI, ES, BA, ME, GR where there is a
  suitable public API.

## Environment variables

| Variable           | Provider   | Description                                                  |
| ------------------ | ---------- | ------------------------------------------------------------ |
| `NVE_API_KEY`      | `nve`      | Required. Register at [hydapi.nve.no](https://hydapi.nve.no) |
| `RIVERMAP_API_KEY` | `rivermap` | Required. Rivermap API key sent via `X-Key` header           |

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
