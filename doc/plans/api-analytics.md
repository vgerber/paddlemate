# API analytics (plan, delete when landed)

One event per API request, stored in ClickHouse and explored in Grafana.
Decided with the user 2026-11-01: API calls only (no app tracking),
self-hosted ClickHouse + the NAS Grafana. Prometheus `/metrics` stays for
ops and alerts; this is separate and can be switched off.

## Event

| Column | Type | Notes |
|---|---|---|
| `ts` | DateTime64(3, 'UTC') | request start |
| `route` | LowCardinality(String) | axum `MatchedPath` template, `unmatched` otherwise |
| `method` | LowCardinality(String) | |
| `status` | UInt16 | |
| `latency_ms` | UInt32 | |
| `client` | LowCardinality(String) | anonymous, api_token, app (as in `metrics.rs`) |
| `caller` | FixedString(16) or String | hash of (daily salt, client IP, user agent); the salt lives in memory, is replaced at UTC midnight and never stored, so callers cannot be linked across days; never the raw IP, user id or token |
| `ua_family` | LowCardinality(String) | browser / app / curl / python / other, from a small allowlist, not the raw UA |
| `query` | Map(String, String) | allowlisted parameters only (e.g. `q` truncated to 64 chars, `category`, `discipline`, `page`); nothing else |
| `bytes` | UInt32 | response size if cheap |

Table `api_events`: `MergeTree`, `PARTITION BY toYYYYMM(ts)`,
`ORDER BY (route, ts)`, `TTL ts + INTERVAL 90 DAY` (raw), and `query` with a
shorter column TTL (30 days). A materialized view `api_events_hourly` keeps
hourly counts per route, status class and client with latency quantiles
(`quantilesState`), TTL 3 years. Country is cut for now (needs a GeoIP
database): listed as a known limitation.

## API

- `src/analytics/`: a tower layer builds the event after the response (not
  for `/metrics`), pushes it to a bounded channel (`try_send`; full = drop and
  count `analytics_events_dropped_total` in Prometheus); a background task in
  `src/jobs/` batches (1000 rows or 5 s) and inserts with one HTTP request
  (`INSERT ... FORMAT JSONEachRow`, 10 s timeout, the `clickhouse` crate if
  it fits, else reqwest which is already a dependency). Failure drops the
  batch with a warning; requests never wait.
- Off unless `ANALYTICS_URL` is set. Also `ANALYTICS_USER`,
  `ANALYTICS_PASSWORD`, `ANALYTICS_DATABASE` (default `paddlemate`); typed in
  `src/config.rs`; rows in the AGENTS.md Environment table.
- Schema: `deploy/analytics/schema.sql` (database, table, view, TTLs) applied
  by the API at start-up when enabled (`CREATE ... IF NOT EXISTS`, idempotent),
  so it is versioned with the code; a later change is a new numbered file.
- Local dev: a `clickhouse` service under an `analytics` profile in the root
  `docker-compose.yml` (memory-capped), plus a Grafana dashboard
  `deploy/analytics/api-usage.dashboard.json` (ClickHouse datasource uid
  `clickhouse`): requests over time by route/client, top routes, status mix,
  latency p50/p95 by route, unique callers per day, top search terms,
  slowest routes, error routes.

## NAS (node-setup's part)

ClickHouse server container with `max_server_memory_usage` about 1 GB and its
data volume in the NAS backups; users `paddlemate_ingest` (INSERT on
`paddlemate.*` only) and `grafana_ro` (SELECT only); the Grafana ClickHouse
plugin with datasource uid `clickhouse`; the dashboard provisioned. The API
reaches ClickHouse over the NAS network, not the internet.

## Acceptance

- With `ANALYTICS_URL` unset nothing is sent and no task runs (test).
- With it set (local ClickHouse), N requests produce N rows with the
  template route, the client kind and no IP, user id or token (test, or an
  integration test behind an env flag if ClickHouse is not in CI).
- ClickHouse down: requests still answer with normal latency; dropped events
  are counted (test with an unreachable URL).
- `query` holds only allowlisted keys, truncated (test).
- Two requests from one caller on the same day share `caller`; the salt is
  never written anywhere (test).
- Gates as in AGENTS.md; the security table answered; doc/setup.md and a
  privacy note (what is stored, how long, legitimate interest) updated.
