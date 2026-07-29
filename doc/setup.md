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
  `RUN_MIGRATIONS=false` to apply them as a separate reviewed step.
- **Migrations are created with the CLI, never by hand**:
  `cd api && cargo sqlx migrate add <name>`.
- **Keep `RATE_LIMIT_PER_SECOND=0` on dev machines** - the limiter's clock
  does not survive a laptop suspend and every caller gets 429s until the
  process restarts. Production keeps the default (20/s per caller).
- After changing SQL queries: `cd api && cargo sqlx prepare` (offline cache).
  After changing the API surface: `cd frontend && npm run generate:api` (API
  must be running).
