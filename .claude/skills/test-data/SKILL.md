---
name: test-data
description: Seed or remove the paddlemate dev-DB test fixture (Test River with sections, put-in/take-out features, gauge with readings, descents, API token). Use when local testing needs data, or to reset it.
---

# Test data fixture

Seeds a self-contained fixture into the local dev database. All ids are in
the 9xxx range so it never collides with real data and can be removed
cleanly.

## Prerequisites

- DB container running: `docker start paddlemate-db-1`
- Migrations applied: `cd api && cargo sqlx migrate run`
- At least one row in `users` (log in once via Keycloak; the fixture assigns
  everything to the first user).

## Seed / reset / remove

Scripts live next to this file. Always clean before seeding (seed is not
idempotent):

```sh
docker exec -i paddlemate-db-1 psql -U postgres -d paddlemate -v ON_ERROR_STOP=1 < .claude/skills/test-data/cleanup.sql
docker exec -i paddlemate-db-1 psql -U postgres -d paddlemate -v ON_ERROR_STOP=1 < .claude/skills/test-data/seed.sql
```

Remove only: run just `cleanup.sql`.

## What you get

| Entity | Ids | Notes |
|---|---|---|
| Waterway "Test River" | 9001 | river |
| Sections Upper/Lower/Empty Test | 9101/9102/9103 | each with put_in + take_out features (9511-9532) at its line ends, like a normal entry |
| Gauge "Test Gauge" + series | 9301 / 9401 | water_level in cm; a week of 2-hourly sinusoidal readings (55-115) |
| Water range | 9601 | on Lower Test's put_in (9521): L 60 / M 80 / H 120 - so 9102 has water status + chart |
| Descents | 9201-9204 | see below; all owned by the first user |
| API token `pm_testtoken123` | name `test-data` | for authed curl: `-H "X-Api-Key: pm_testtoken123"` |

Descents (times relative to NOW at seed time):

- 9201 "Public multi-section run" - public, 2 days ago, 2 h, on Upper + Lower
- 9202 "Private upper run" - private, 1 day ago, 1 h, on Upper (visibility testing: hidden from anonymous)
- 9203 "Public lower-only run" - public, 3 days ago, 1 h, on Lower
- 9204 "Long weekend trip" - public, 6 days ago, 36 h, on Lower (wide chart band)

Empty Test (9103) intentionally has no descents (empty-state testing).

## Using it

- Map entry points: `/?waterway=9001` (section list with paddle-count
  badges), `/?waterway=9001&section=9102` (chart with descent bands, Logs tab).
- Frontend against the local API: `cd frontend && VITE_API_URL=http://localhost:3000 bun run dev`
  (the checked-out `.env` points at production).
- Authed API checks: `curl -H "X-Api-Key: pm_testtoken123" localhost:3000/api/v1/descents?scope=owned`
- To drive an authenticated browser session headlessly, see the `verify`
  skill (fake oidc user in localStorage + CDP header rewrite to the API key).
