---
name: dev-services
description: Start the paddlemate dev stack - Postgres, Keycloak, the API, Vite and headless Chrome - in the order that keeps auth working, then verify it. Use whenever the local services are down.
---

# Starting the dev services

Five things, and the order matters: **Keycloak before the API**. The API
caches the realm's JWK set at startup, so an API started first 401s every
request once Keycloak mints new keys.

Run it as one block. `SCRATCH` is any writable directory for logs.

```sh
cd ~/Repositories/Web/paddlemate
SCRATCH=/tmp/paddlemate-dev && mkdir -p "$SCRATCH/logs"

# 1. Database, and 2. Keycloak.
docker start paddlemate-db-1
docker compose --profile auth up -d keycloak

# Wait for both before going on.
for i in $(seq 1 30); do docker exec paddlemate-db-1 pg_isready -U postgres -d paddlemate >/dev/null 2>&1 && break; sleep 1; done
for i in $(seq 1 60); do curl -sf http://localhost:8080/realms/paddle >/dev/null 2>&1 && break; sleep 2; done

# 3. Migrations, then the API - always after Keycloak is answering.
cd api && cargo sqlx migrate run
nohup env KEYCLOAK_URL=http://localhost:8080 \
  KEYCLOAK_TOKEN_URL=http://localhost:8080/realms/paddle/protocol/openid-connect/token \
  KEYCLOAK_CLIENT_SECRET=local-dev-secret \
  cargo run > "$SCRATCH/logs/api.log" 2>&1 &

# 4. Vite. The .env points at production, and process env wins over it.
cd ../frontend
nohup env VITE_API_URL=http://localhost:3000 bun run dev > "$SCRATCH/logs/vite.log" 2>&1 &

# 5. Headless Chrome for the e2e scripts.
google-chrome --headless=new --disable-gpu --no-sandbox \
  --remote-debugging-port=9222 --window-size=1400,900 \
  --user-data-dir="$SCRATCH/profile" about:blank > "$SCRATCH/logs/chrome.log" 2>&1 &
```

## Ports

| Service | Port |
|---|---|
| API | 3000 |
| Vite | 5173 |
| Postgres | 6432 |
| Keycloak | 8080 |
| Chrome (CDP) | 9222 |

## Then check it, do not assume it

Readiness first:

```sh
for i in $(seq 1 90); do curl -sf "http://localhost:3000/api/v1/waterways?per_page=1" >/dev/null 2>&1 && { echo "api ready"; break; }; sleep 2; done
for i in $(seq 1 45); do curl -sf http://localhost:5173/ >/dev/null 2>&1 && { echo "vite ready"; break; }; sleep 2; done
curl -sf http://localhost:9222/json/version >/dev/null && echo "chrome ready"
```

Then sign in for real and make one authenticated call. A port that answers
proves nothing about auth: only a 200 on a token-gated route proves the API
trusts the realm's current signing keys.

```sh
bun e2e/login.ts          # signs in as vincent (server_admin, pinned id)
```

Drive the authed check through the browser, taking the token the app holds -
see `.claude/skills/verify/SKILL.md` for the CDP helper. `GET /api/v1/trips`
returning 200 with the fixture trip is the signal to trust.

Fixture still there?

```sh
docker exec paddlemate-db-1 psql -U postgres -d paddlemate -tAc \
 "SELECT 'migration '||max(version) FROM _sqlx_migrations
  UNION ALL SELECT 'trips '||count(*) FROM trips WHERE id IN (9001,9002);"
```

If it is gone, reseed with the `test-data` skill.

## Gotchas that cost time

- **A recreated Keycloak container mints new signing keys.** `docker compose
  up` says `Created` for a fresh one and `Starting` for an existing one. On
  `Created`, any already-running API must be restarted or every request 401s.
- **Restart the API after Rust edits** - `cargo run` does not reload. Kill it
  by name (`pkill -x paddlemate_api`), never `pkill -f`, which matches its own
  shell and exits 144.
- **Regenerating the API client needs the API running**: `npm run generate:api`
  reads `localhost:3000`, so restart the API first if the schema changed.
- Realm import only runs on a *fresh* Keycloak container. Realm edits go in
  `keycloak/build-realm.sh`, never in the generated `realm-local.json`.
