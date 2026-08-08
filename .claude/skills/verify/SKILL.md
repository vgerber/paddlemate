---
name: verify
description: Build, run, and drive the paddlemate app (API + frontend) to verify changes end-to-end at the UI/API surface.
---

# Verifying paddlemate changes

## Backend (API on :3000)

```sh
docker start paddlemate-db-1                 # DB must be up (port 6432)
cd api && cargo sqlx migrate run             # local DB is often behind on migrations
cd api && cargo run                          # serves /api/v1, OpenAPI at /api/v1/docs/openapi.json
```

Drive API changes with curl. For an authenticated request without Keycloak,
mint an API token directly in the DB (auth layer accepts `X-Api-Key: pm_...`,
stored as sha256):

```sh
TOKEN="pm_testtoken123"; HASH=$(printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1)
docker exec paddlemate-db-1 psql -U postgres -d paddlemate \
  -c "INSERT INTO api_tokens (user_id, name, token_hash) SELECT id, 'verify', '$HASH' FROM users LIMIT 1;"
curl -H "X-Api-Key: pm_testtoken123" localhost:3000/api/v1/...
```

Delete the token row afterwards.

## Frontend (Vite on :5173)

**Gotcha:** `frontend/.env` sets `VITE_API_URL=https://paddle.vgerber.io`
(production). To test against the local API, override it — process env wins
over `.env`:

```sh
cd frontend && VITE_API_URL=http://localhost:3000 bun run dev
```

The dev DB may be empty (0 waterways). Seed minimal fixtures via
`docker exec -i paddlemate-db-1 psql ...` (note `-i` for stdin/heredocs).
Constraints to satisfy: `water_sections.location` is a required PostGIS
LineString; `descents` needs put-in as feature-id XOR lat+lon. Use high ids
(9000+) and delete them when done (descents cascade to descent_sections).

## Signing in (authenticated flows)

Do **not** hand-write an oidc session into localStorage. It puts the app in a
state no real user reaches: the browser believes one identity while the API
acts on another, so ownership, visibility and admin checks are all tested
against a fiction, and token expiry/refresh/401 paths never run.

Instead run a local identity provider and sign in for real:

```sh
docker compose --profile auth up -d keycloak    # imports keycloak/realm-local.json
```

There are two ways to provision a Keycloak, and they are not interchangeable:

| | `docker compose --profile auth up` | `keycloak/setup-keycloak.sh` |
|---|---|---|
| How | imports `realm-local.json` at boot | Admin REST API |
| Works on | a container with an empty database only | any reachable Keycloak, any time |
| Re-runnable | no - needs a fresh container | yes, idempotent |
| Creates the dev user | **yes, with a pinned id** | no |

Use the compose path for local development: pinning the user id to the
fixture owner is what makes a signed-in session see the seeded data, and only
realm import can do that. Use the script for a server, for a realm that
already exists, or to roll out an edit to `paddlemate-*-client.json`:

```sh
./keycloak/setup-keycloak.sh https://auth.example.com https://app.example.com
```

The realm ships a user `vincent` / `paddle` whose subject **equals the
fixture owner id**, so a signed-in session sees the seeded descents,
favourites and proposals, and carries `server_admin` for the review controls.

Point both sides at it (neither file needs editing - process env wins over
`.env`, and `frontend/.env.development.local` already has the three
`VITE_AUTH_*` lines):

```sh
cd api && KEYCLOAK_URL=http://localhost:8080 \
  KEYCLOAK_TOKEN_URL=http://localhost:8080/realms/paddle/protocol/openid-connect/token \
  KEYCLOAK_CLIENT_SECRET=local-dev-secret cargo run
```

Then, with headless Chrome up (below):

```sh
bun .claude/skills/verify/login.ts    # real PKCE redirect through the login form
bun .claude/skills/verify/smoke.ts    # authenticated smoke, prints PASS/FAIL
```

Gotchas that cost time:

- **Recreating the keycloak container mints new realm signing keys.** The API
  caches the JWK set at startup, so restart the API after any
  `docker compose up --force-recreate keycloak`, or every request 401s.
- Keycloak's SSO cookie survives between runs; `login.ts` clears cookies so
  each run exercises the full form, not a silent re-issue.
- Realm changes go in `keycloak/build-realm.sh` (regenerates
  `realm-local.json` from the shared `*-client.json`), never in the generated
  file. Import only runs on a fresh container.

## Driving the UI headlessly

No Playwright installed; use system Chrome + CDP over WebSocket with a bun
script (Bun has native WebSocket):

```sh
google-chrome --headless=new --disable-gpu --no-sandbox \
  --remote-debugging-port=9222 --window-size=1400,900 \
  --user-data-dir=$SCRATCH/profile about:blank &
```

Get the page target from `http://localhost:9222/json`, then send
`Page.navigate`, `Runtime.evaluate` (click via `document.querySelector(...).click()`),
`Page.captureScreenshot`, and `Emulation.setDeviceMetricsOverride`
(width 375, mobile: true) for the mobile overlay. Allow ~6s settle on first
navigation (Vite dep optimization); ~2s after clicks.

Useful entry points (selection is URL-driven):
- `/?waterway=<id>&section=<id>` — map page with a section open
- `/logs`, `/logs/<descentId>?edit=false` — logs list / detail
