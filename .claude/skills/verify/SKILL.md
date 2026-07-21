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
