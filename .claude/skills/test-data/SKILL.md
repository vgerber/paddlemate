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
| Sections | 9101-9107 | each with put_in + take_out features (9511-9572) at its line ends, like a normal entry |
| Whitewater features | 9523/9543/9553 | difficulty III / II / IV-V on sections 9102/9104/9105, spanning put-in to take-out - difficulty chip in the section list |
| Extra features on Lower Test | 9524-9529 | rapid "Slot Machine" (III+), hole "Big Hole", weir "Altes Wehr", strainer, portage, bridge - 9102 is the feature-rich section for timeline/map/delete testing |
| Gauge "Test Gauge" + series | 9301 / 9401, 9402 | water_level in cm; 9401 has a week of 2-hourly sinusoidal readings (55-115, latest ~85), 9402 has none |
| Water ranges | 9601-9608 | thresholds around the ~85 cm reading so the section list shows every chip variant (see below); section defaults sit on the whitewater features; 9607/9608 sit on the Lower Test rapid/hole (same series as the 9601 default) so selecting them in the timeline swaps the chart thresholds |
| Descents | 9201-9204 | see below; all owned by the first user |
| API token `pm_testtoken123` | name `test-data` | for authed curl: `-H "X-Api-Key: pm_testtoken123"` |

Descents (times relative to NOW at seed time):

- 9201 "Public multi-section run" - public, 2 days ago, 2 h, on Upper + Lower
- 9202 "Private upper run" - private, 1 day ago, 1 h, on Upper (visibility testing: hidden from anonymous)
- 9203 "Public lower-only run" - public, 3 days ago, 1 h, on Lower
- 9204 "Long weekend trip" - public, 6 days ago, 36 h, on Lower (wide chart band)

Empty Test (9103) intentionally has no descents (empty-state testing).

Section chip variants in the list view:

- 9101 Upper Test - uncalibrated range (9602): plain reading chip
- 9102 Lower Test - medium level (9601: 60/80/120) + chart with descent bands
- 9103 Empty Test - no gauge: no chip
- 9104 Low Water Test - low level (9603: 80/100/130)
- 9105 High Water Test - high level (9604: 40/50/70)
- 9106 Dry Test - below low = empty level (9605: 100/120/150)
- 9107 Silent Gauge Test - calibrated on series 9402 which has no readings: level-letter fallback

## Using it

- Map entry points: `/?waterway=9001` (section list with paddle-count
  badges), `/?waterway=9001&section=9102` (chart with descent bands, Logs tab).
- Frontend against the local API: `cd frontend && VITE_API_URL=http://localhost:3000 bun run dev`
  (the checked-out `.env` points at production).
- Authed API checks: `curl -H "X-Api-Key: pm_testtoken123" localhost:3000/api/v1/descents?scope=owned`
- To drive an authenticated browser session headlessly, see the `verify`
  skill (fake oidc user in localStorage + CDP header rewrite to the API key).
