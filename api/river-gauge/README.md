# river-gauge

A multi-provider hydrological gauge reader for Rust. Fetches water level and
discharge time-series data from 13 regional APIs across Europe (Austria,
Switzerland, France, Germany, Norway, Italy, Poland, Czech Republic).

## Providers

| Key      | Region                      | Stations | Historical data                | `list_stations` |
| -------- | --------------------------- | -------- | ------------------------------ | --------------- |
| `tirol`  | Tyrol, AT                   | 218      | Snapshot only                  | —               |
| `ehyd`   | AT federal (NO/SB/ST/OÖ/KT) | ~34      | Snapshot only                  | —               |
| `vbg`    | Vorarlberg, AT              | 14       | Snapshot only                  | ✅              |
| `by`     | Bavaria, DE                 | 40       | Snapshot only                  | —               |
| `bw`     | Baden-Württemberg, DE       | 15       | Snapshot only                  | —               |
| `po`     | Germany federal waterways   | 785      | 30 days                        | ✅              |
| `sx`     | Saxony, DE                  | 7        | 5 days (RSS)                   | —               |
| `bafu`   | Switzerland federal         | ~87      | 32 days                        | —               |
| `hubeau` | France                      | ~133     | 31 days                        | —               |
| `nve`    | Norway                      | 32       | Years (requires `NVE_API_KEY`) | —               |
| `rz`     | Italy (riverzone.eu)        | 204      | Snapshot only                  | —               |
| `pl`     | Poland                      | 9        | Snapshot only                  | —               |
| `cz`     | Czech Republic              | 26       | 7 days                         | —               |

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

## Source ID format

Each gauge series is identified by a `source_id` string. The format is
`"{station_identifier}:{param}"` where `param` is typically `W` (water level)
or `Q` (discharge). Provider-specific conventions:

| Provider | Station identifier                                        | Params                             |
| -------- | --------------------------------------------------------- | ---------------------------------- |
| `tirol`  | HZBNR number, e.g. `201038`                               | `W`, `Q`, `WT`                     |
| `ehyd`   | `{canton}.{id}`, e.g. `ooe.0150`                          | `W`, `Q`                           |
| `vbg`    | WISID, e.g. `V334387`                                     | `W`, `Q`                           |
| `by`     | BLfU station number, e.g. `11418250`                      | `w`, `q` (lowercase)               |
| `bw`     | 4-digit HVZ ID, e.g. `0001`                               | `W`, `Q`                           |
| `po`     | Station UUID, e.g. `70272185-b2b3-4178-96b8-43bea330dcae` | `W`, `Q`                           |
| `sx`     | HWIMS station number, e.g. `550490`                       | `W`, `Q`                           |
| `bafu`   | BAFU station number, e.g. `2016`                          | `height`, `flow`, `temperature`    |
| `hubeau` | Hub'Eau station code, e.g. `K437311001`                   | `H`, `Q`                           |
| `nve`    | NVE parameter ID, e.g. `2.32.0`                           | `1000` (stage), `1001` (discharge) |
| `rz`     | Riverzone UUID                                            | `W`, `Q`                           |
| `pl`     | IMGW station number, e.g. `149200080`                     | `W`, `Q`                           |
| `cz`     | CHMI sequence ID, e.g. `20070907`                         | `H`, `Q`                           |

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

| Variable      | Provider | Description                                                  |
| ------------- | -------- | ------------------------------------------------------------ |
| `NVE_API_KEY` | `nve`    | Required. Register at [hydapi.nve.no](https://hydapi.nve.no) |

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
