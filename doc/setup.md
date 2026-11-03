# Setup

Running the stack locally.

## Services

| Service  | Path        | Port | Description                    |
|----------|-------------|------|--------------------------------|
| Database | `docker-compose.yml` | 6432 | PostgreSQL 18 with PostGIS |
| API      | `api/`      | 3000 | Rust/axum backend              |
| Frontend | `frontend/` | 5173 | React/Vite SPA                 |

## Requirements

- Rust (see `api/rust-toolchain.toml`)
- [sqlx-cli](https://github.com/launchbadge/sqlx): `cargo install sqlx-cli`
- Bun
- Docker (for the database and the optional local Keycloak)

## Start

```sh
# Database
docker compose up -d

# API (applies pending migrations on boot - see below)
cd api && cargo run

# Frontend
cd frontend && bun install && bun run dev
```

Copy `api/.env.example` to `api/.env` and fill in the Keycloak values. The
frontend expects the API on `http://localhost:3000`.

For a local sign-in, `docker compose --profile auth up -d keycloak` starts
Keycloak on port 8080 with a ready-made realm; the API's `KEYCLOAK_URL` must
match the frontend's. The `dev-services` skill (`.claude/skills/dev-services/`)
brings up the whole stack in the right order.

## Test data

A self-contained fixture (rivers with diacritic-heavy names, sections,
features, a gauge with a week of readings, descents, and an API token) lives
in `.claude/skills/test-data/`. All fixture ids are in the 9xxx range.

```sh
docker exec -i paddlemate-db-1 psql -U postgres -d paddlemate -v ON_ERROR_STOP=1 < .claude/skills/test-data/cleanup.sql
docker exec -i paddlemate-db-1 psql -U postgres -d paddlemate -v ON_ERROR_STOP=1 < .claude/skills/test-data/seed.sql
```

## Things worth knowing

- **Migrations run at API startup** (`sqlx::migrate!()`), so `cargo run`
  applies anything pending. They are forward-only - no down scripts. Set
  `RUN_MIGRATIONS=false` to skip them on boot (the production image has no
  other way to migrate; see Deploying).
- **Migrations are created with the CLI, never by hand**:
  `cd api && cargo sqlx migrate add <name>`.
- **Keep `RATE_LIMIT_PER_SECOND=0` on dev machines** - the limiter's clock
  does not survive a laptop suspend and every caller gets 429s until the
  process restarts. Production keeps the defaults (reads 20/s, writes 1/s,
  expensive reads 2/s per caller). Set the write and expensive rates to 0 there
  as well.
- After changing SQL queries: `cd api && cargo sqlx prepare` (offline cache).
  After changing the API surface: `cd frontend && npm run generate:api` (API
  must be running).

## Deploying

Production runs the API as one Docker image on a NAS and serves the built
frontend from nginx. The scripts live in `deploy/`; the NAS connection
(user, host, folder) comes from `deploy/deploy.env` (copy
`deploy/deploy.env.example`), and `deploy/backend/.env` carries the API's
settings and secrets. Both files stay out of git.

- **The image cannot migrate on its own.** It holds `paddlemate_api` and the
  import tools, no `sqlx-cli` and no `migrate` binary. Migrations therefore run
  when the API boots (`RUN_MIGRATIONS`, default `true`). `deploy.sh` builds the
  image, ships it, then runs `down` and `up -d`, so the old API is stopped
  while the new one migrates. Do not set `RUN_MIGRATIONS=false` on a release
  that has migrations: the new code would serve on the old schema. Use it only
  to start an older image against a newer database (rollback).
- **Cost of the latest migrations**, measured locally (586k readings, 45
  countries); production is a slower disk, so expect a multiple:

  | Migration | What | Lock | Local time |
  |---|---|---|---|
  | 0050 | region search indexes, country borders (PostGIS) | SHARE on `regions` | 12 s, CPU bound, scales with country outlines |
  | 0051 | border lock function | brief | 7 ms |
  | 0052, 0053 | partial indexes on `entity_history` | SHARE, small table | under 1 s |
  | 0054 | covering index on `gauge_readings`, drops the DESC index | SHARE (blocks reading inserts) then ACCESS EXCLUSIVE | 0.3 s; the new index is about 1.7x the primary key |

  Plain `CREATE INDEX` is fine because the API is stopped. A future release that
  must migrate while serving needs `-- no-transaction` files with one statement
  each (`CREATE INDEX CONCURRENTLY`, then the drop in its own migration).
- **A failed migration restart-loops** (`restart: unless-stopped`), repeating
  the slow ones. `docker stop paddlemate-api` and read the log.
- **Background tasks** start with the API and need no setting: the daily
  history pruner (`query::history::run_pruner`, purges deleted history past
  retention in batches), the notification pruner, and the region fill, which
  fetches from Overpass at most 4 tiles per request and 32 at once, backs off a
  failing tile from 60 s up to 1 h and remembers at most 1024 of them.
- **One-off import jobs**, run by hand with `docker exec paddlemate-api <tool>`
  and best off-peak since they call Overpass at one request a second:
  `derive_section_regions` (fills `regions` of sections that have none), then
  `import_region_outlines` (the boundary of every region a section names).
- **Settings to check in `deploy/backend/.env`**: `CORS_ALLOWED_ORIGINS` (leave
  it unset: the API is public, so any origin may call it),
  `OVERPASS_URLS` (the self-hosted instance first), and the rate limits
  (`RATE_LIMIT_PER_SECOND`, `WRITE_RATE_LIMIT_PER_SECOND`,
  `EXPENSIVE_RATE_LIMIT_PER_SECOND`). The limiter keys on the peer address and
  believes `X-Forwarded-For` / `X-Real-IP` only from `TRUSTED_PROXIES`
  (default: loopback and the private ranges, which covers a proxy on the Docker
  network or LAN). If the proxy reaches the API from a public address, set
  `TRUSTED_PROXIES` to it, or every visitor shares the proxy's budget. The
  proxy must append the client to `X-Forwarded-For` (or set `X-Real-IP`); a
  LAN client that talks to the API port directly is also trusted, so keep
  that port off the internet. Startup logs which mode is active.
- **Monitoring**: the API serves Prometheus metrics at `/metrics`, at the
  root of the host, deliberately **outside** the base path (`/api/v1`) and
  unauthenticated. Prometheus on the NAS scrapes `192.168.178.53:5566/metrics`,
  the published API port. The public reverse proxy forwards only `/api/`, so
  `/metrics` is not on the internet: never proxy the root, and keep the API
  port off the internet. Series: `http_requests_total{method,route,status,client}`
  (`route` is the matched template, `unmatched` for 404s; `client` is
  `anonymous`, `api_token` or `app`), `http_request_duration_seconds{method,route}`,
  `http_requests_in_flight`, `rate_limit_rejections_total{budget}`
  (`general`, `write`, `expensive`), `db_pool_connections`,
  `db_pool_idle_connections`, `proposals_submitted_total{entity_type}`,
  `material_image_mirror_total{result}` (`ok`, `failed`, `blocked`) and the
  `process_*` gauges (CPU, memory, fds, start time). No label carries a user
  id, address or token. Scrapes are neither counted nor rate limited. Code:
  `api/src/metrics.rs`.
  A Grafana dashboard and suggested alert rules for these series are in
  `deploy/monitoring/` (`paddlemate-api.dashboard.json`,
  `paddlemate-api.alerts.yml`); the NAS stack (Prometheus + Grafana, run from
  the node-setup project) provisions them.
- **Frontend**: build on the dev machine with the production `VITE_*` values
  (`frontend/.env`), check `grep -c localhost frontend/dist/assets/*.js` is 0,
  then `deploy/frontend/deploy.sh`, right after the API (it deletes old hashed
  assets). Open apps are not reloaded for the person: when the new service worker takes
  over, a snackbar says "A new version is ready." with a Reload button, so an
  open form is not lost. Bundles already in the field (released before that
  listener existed) do not show it and need one manual reload after this deploy.
- **Rollback**: the schema is additive, so roll back code only. Tag the running
  image `paddlemate-api:previous` before deploying and keep `dist.prev`; the
  backend deploy takes the database dump and media snapshot itself (see
  Backups). To go back, retag, set
  `RUN_MIGRATIONS=false` (the old image does not know the applied versions and
  would panic), `down`, `up -d`. There are no down migrations, and production
  data changes go through a migration in the next release, never by hand.

## Analytics and privacy

The API can record one event per request in ClickHouse for a Grafana
dashboard (which features are used, errors, slow routes, browsers and systems). It is
off unless `ANALYTICS_URL` is set; Prometheus `/metrics` is separate and stays.

**Locally**

```
docker compose --profile analytics up -d clickhouse
ANALYTICS_URL=http://localhost:8123 ANALYTICS_USER=paddlemate ANALYTICS_PASSWORD=paddlemate cargo run
```

The API creates the database, tables and views itself (`api/analytics/*.sql`,
`CREATE ... IF NOT EXISTS`); a later change is a new numbered file. Events are
sent in batches (1000 rows or 5 s); a failed insert drops the batch with a
warning and counts `analytics_events_dropped_total`, requests never wait.

**On the NAS**: ClickHouse runs in the monitoring stack (node-setup project,
`nas1/monitoring`), about 1 GB server memory, nightly `BACKUP DATABASE
paddlemate`. The API container joins its external docker network `analytics`
(see `deploy/backend/docker-compose.yml`) and reaches it as
`http://clickhouse:8123`. `deploy/backend/.env` gets:

```
ANALYTICS_URL=http://clickhouse:8123
ANALYTICS_USER=paddlemate_ingest
ANALYTICS_DATABASE=paddlemate
ANALYTICS_PASSWORD=<from /volume1/services/monitoring/secrets/clickhouse_ingest_password on the NAS>
```

`paddlemate_ingest` may create and insert in `paddlemate.*` only (no DROP or
ALTER), so a schema change after the first deploy needs the tables dropped by
the NAS admin first. Grafana reads with a read-only user on the datasource uid
`clickhouse`; `deploy/analytics/api-usage.dashboard.json` (uid
`paddlemate-api-usage`) is provisioned there as "Paddlemate API usage".

**Privacy: anonymous by design**

The analytics answer "which features are used", nothing about who uses them.
There is no personal data, no identifier and nothing per person: no caller
hash, no salt, no address, no user id, no token, no raw user agent, no free
text. The code never reads the client address for analytics.

| Stored | How long |
|---|---|
| time, route template (`/api/v1/waterways/{id}`, never the real path), method, status, latency, response size, client kind (anonymous, api_token, app), `browser` and `os` | 90 days; hourly counts per route, status class and client for 3 years |
| feature filters: `category`, `discipline`, `construction`, `sort` (a value outside the known list is stored as `other`), and for a comparison only how many entries `ids` asks for (1-8), never which | 90 days |

`browser` (chrome, safari, firefox, edge, samsung, other_browser, app, curl,
python, other) and `os` (android, ios, windows, macos, linux, other) are coarse
families derived in memory from the User-Agent by a short fixed match
(`api/src/analytics/event.rs`); only these families are kept, never the header
and never a version. Everything else in the query string (search text, page,
ids, other parameters), request and response bodies and headers are dropped.
Country is not recorded. The data is not shared and not used for profiling.

## Backups

The database and the uploaded and mirrored photos are backed up every night
and before every backend deploy, and the copies leave the NAS volume through
Hyper Backup.

| Layer | What | Where | Kept |
|---|---|---|---|
| [`deploy/backend/backup.sh`](../deploy/backend/backup.sh) | `pg_dump -Fc` of the database, checked with `pg_restore --list`, plus a hard-linked snapshot of `data/media` | `<NAS_ROOT>/paddlemate-backend/backups/nightly/` | newest 14 (`KEEP`) |
| DSM Hyper Backup | `backups/` and `data/media` | another volume, USB disk or a cloud target | its own rotation, about 30 versions |
| DSM Snapshot Replication (optional) | the whole `shared_services` share | same volume | hourly for a day, daily for two weeks |

The live `data/postgres` folder is never in Hyper Backup: a file-by-file copy
taken while Postgres writes can be inconsistent and fail to start. The dump is
the database backup; a snapshot is only a quick undo on the same disk.

Setting it up once in DSM:

1. **Control Panel > Task Scheduler > Create > Scheduled Task > User-defined
   script**: user `root`, daily at 01:30, script
   `bash /volume1/shared_services/paddlemate-backend/backup.sh`.
   Run it once by hand and check that a `.dump` appears in `backups/nightly/`.
2. **Hyper Backup > Create > Data backup task**: pick a target off this
   volume, select `shared_services/paddlemate-backend/backups` and
   `shared_services/paddlemate-backend/data/media` (not `data/postgres`),
   schedule daily at 02:30, enable integrity checks and Smart Recycle.
3. Optional: **Snapshot Replication > Snapshots** on `shared_services`, hourly.

To restore, copy the chosen dump to `paddlemate_export.dump` beside
`restore.sh` and run it on the NAS (it drops and recreates the database), then
copy the matching media snapshot back into `data/media`.
