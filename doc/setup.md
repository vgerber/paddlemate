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
- Docker (for the database)

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
frontend from nginx. The scripts live in `deploy/` (not tracked: they hold
host names and secrets), and `deploy/backend/.env` carries the settings.

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
- **Frontend**: build on the dev machine with the production `VITE_*` values
  (`frontend/.env`), check `grep -c localhost frontend/dist/assets/*.js` is 0,
  then `deploy/frontend/deploy.sh`, right after the API (it deletes old hashed
  assets). Open apps are not reloaded for the person: when the new service worker takes
  over, a snackbar says "A new version is ready." with a Reload button, so an
  open form is not lost. Bundles already in the field (released before that
  listener existed) do not show it and need one manual reload after this deploy.
- **Rollback**: the schema is additive, so roll back code only. Tag the running
  image `paddlemate-api:previous` before deploying, keep `dist.prev`, and take a
  `pg_dump -Fc` plus a copy of `data/media`. To go back, retag, set
  `RUN_MIGRATIONS=false` (the old image does not know the applied versions and
  would panic), `down`, `up -d`. There are no down migrations, and production
  data changes go through a migration in the next release, never by hand.
