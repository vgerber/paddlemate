# Paddlemate

Platform for managing whitewater rivers, sections, and features.

## Services

| Service  | Path        | Description                    |
|----------|-------------|--------------------------------|
| API      | `api/`      | Rust/axum backend with PostGIS |
| Frontend | `frontend/` | React/Vite SPA                 |

See [api/README.md](api/README.md) for API details — database schema, authentication, and Keycloak setup.

## Development

### Requirements

- Rust (see `api/rust-toolchain.toml`)
- [sqlx-cli](https://github.com/launchbear/sqlx): `cargo install sqlx-cli`
- Bun
- Docker (for the database)

### Start

```sh
# Database
docker compose up -d

# API
cd api && cargo run

# Frontend
cd frontend && bun install && bun run dev
```
