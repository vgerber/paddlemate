---
description: Tooling reference — how to run checks, access the DB, and manage migrations in this project
applyTo: "**/*.rs, **/*.toml, **/*.ts, **/*.tsx"
---

# Tooling

## Rust

**Check for errors/warnings** after any Rust edit:

```
cd api && cargo check 2>&1
```

**Update SQLx offline cache** after any SQL query change (new/modified `sqlx::query*!` macros or raw SQL strings):

```
cd api && cargo sqlx prepare 2>&1
```

**Apply pending migrations:**

```
cd api && cargo sqlx migrate run 2>&1
```

**Run the API:**

```
cd api && cargo run
```

## TypeScript

The frontend uses **Biome** for linting/formatting and `tsc` for type-checking. Run both after any frontend edit:

```
cd frontend && bun tsc --noEmit 2>&1
cd frontend && bun run lint 2>&1
```

## Database

PostgreSQL runs in Docker — there is no local `psql`. Always use:

```
docker exec paddlemate-db-1 psql -U postgres -d paddlemate -c "<SQL>"
```

Start the container if needed:

```
docker start paddlemate-db-1
```

Connection string (from `api/.env`): `postgresql://postgres:postgres@localhost:6432/paddlemate`

## Migrations

Always create migration files with the SQLx CLI — **never by hand**:

```
cd api && cargo sqlx migrate add <name>
```

This assigns the correct sequential numeric prefix automatically. Manually created files risk duplicate prefixes, which cause SQLx to panic at compile time.
