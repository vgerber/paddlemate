# UI overhaul: to do

State on 2026-10-23. Delete this file when the overhaul has landed on `main`.

## Where the work is

`ui-overhaul` (checked out in the main repo; not pushed since fcc25a6) holds
everything up to the 2026-10-23 fix wave: the canvas, chart, phone grid
(`tokens.phone`, doc/design.md "The phone grid"), one icon per idea
(`lib/icons.ts` plus a Biome rule), lazy-loaded map, chart and markdown, the
swipe fixes, accessible markers and chart, the history of deleted things kept for one year and
not shown in the app (daily purge, migrations 0052 and 0053), region picking one
kind at a time, the API hardening (localization writes admin-only, comment
writes scoped by parents, bounded descents, paged `/users` and `/proposals`,
group owner fixed, votes need an open proposal, 8 MB uploads, region fills
that release and back off), and the fix wave from the 2026-10-23 reviews
(logs form, canvas free area, chart, trips, proposals, phone sheet and search).

Gates on the last merge: tsc, biome, 522 bun tests; cargo check, clippy 0
warnings, 152 API tests. The local database has migrations up to 0053.

Still out of `ui-overhaul`:

| Branch / worktree | Holds | State |
|---|---|---|
| `p-places-parser-1022` | the API parser for pasted places (coordinates and map links) | done; waits for the trip places answers |
| `plan-trip-places-1020` | `doc/plans/trip-places.md` | plan only; waits for the answers below |
| `w3-specs-1020` | wave 3: shared e2e helpers, no casts, no fixed waits | paused since the phone grid; rebase or redo on today's specs |

Reports (git-ignored, `.claude/handoffs/ui-work/review/`): the 2026-10-23
round is api-break.md, backend-code.md, frontend-code.md, ux-phone.md,
ux-desktop.md (screenshots in review/shots-1023/). Their musts are fixed;
shoulds and nits that no agent reached are listed in each fix agent's report
and below.

## Next, in order

1. Make the test fixture's dates relative to today (`.claude/skills/test-data/seed.sql`), so the trips specs stop failing from date drift (the fixture trip now opens with a "Before" day on 18 Oct: week strip, today ring, day labels, trip cards, trip panel, states Bases/plan).
2. One full Playwright run on `ui-overhaul` (phone, small, desktop, one worker); sort every failure.
3. Opus review of the combined diff, then push `ui-overhaul` and merge into `main` with the user's OK, following `review/deploy.md` (RUN_MIGRATIONS=false, migrate as its own step, `derive_section_regions` and `import_region_outlines`; check the VITE_* values; set CORS_ALLOWED_ORIGINS).

## Known, not yet fixed

- The phone sheet covers the bottom nav, and its peek does not show a first result (changing its stops waits for the phone feature sheet).
- Area search: no sort by distance, no start at the user's location, no keyboard way to set the centre.
- Search rows: the Region tab's empty heading, the "3 regions here" popup staying open, the "river" pill on every row, "Similar names" in Sections, nested star buttons in rows.
- Canvas: tab order, focus ring and Escape as Back; a spec that map-less routes load no map chunk.
- Trips: candidate and day framing on the map (`useBasesScene`), week strip opening on today, invite share sheet, bell events deep-linking to Bases, the Members role chip width.
- The phone section view's map appears about 0.5 s later since the lazy map.
- Batch endpoints that would cut requests: waterways by ids, water status for many sections, section plus feature histories, the gauge series id on the section.
- Deleted things are not shown in the app (the user's call, 2026-10-23); `GET .../deleted-features` stays in the API unused.
- Frontend code review shoulds: one phone-grid module in `lib/` (the padding is written by hand about 14 times, the trailing slot and row card three ways each), `maplibre-gl.css` in every route's entry CSS.

## Waiting on the user

- The phone feature sheet (pattern B, `.claude/handoffs/ui-work/design/phone-feature-open.html`): say go.
- Trip places plan: (1) production geocoder: self-host Photon on the NAS, or public Photon behind the cache; (2) store and show `place_label` (a migration); (3) "Where it is" second, above Dates; (4) which cut items to keep. And the parser's calls: links up to 2048 characters, tabs and newlines as spaces, unmarked number pairs over 90 as a search, regional Google domains (google.de and so on) to be added.
- Open questions: keep the picked area across Name/Area/Region; the seven regions whose country changes under the overlap rule; `natural=mountain_range` ranges; the valley cap of 120.

## Environment notes

- The machine reboots now and then: start Postgres and Keycloak, then the API and Vite from the main checkout (the dev-services skill; Vite with `CHOKIDAR_USEPOLLING=1 VITE_API_URL=http://localhost:3000 bunx vite --port 5174`), then reseed the fixture. Run `bun install` after pulling new frontend dependencies.
- Agents' commits are sometimes refused by the permission check; the lead commits after the user's OK.
- `.vscode/settings.json` has a local change nobody here made; leave it.
