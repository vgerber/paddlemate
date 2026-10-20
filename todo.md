# UI overhaul: to do

State on 2026-10-20 evening. Delete this file when the overhaul has landed on `main`.

## Where the work is

`ui-overhaul` (checked out in the main repo; not pushed since fcc25a6) holds
everything: the wide-screen canvas and reading rail, the calm borderless
chart, the values pane, one header menu, panel spacing, river state, grade
rules, region search (migrations 0050, 0051), level dots, the map following
the filters, phone margins, the smooth swipe, the calm phone chart card,
review waves 1 and 2, the frontend follow-up pass, the API security and
history fixes (deleted history readable, one tracked write path, error
envelope for bad query params, region search bounded, fill cap), the API
leftovers, the docs pass and the layers popover fix.

Gates green on the merge: tsc, biome, 499 bun tests; cargo check, clippy 0
warnings, 128 API tests. The local database has migrations up to 0051.

Still out of `ui-overhaul`:

| Branch / worktree | Holds | State |
|---|---|---|
| `w3-specs-1020` (`.claude/worktrees/w3-specs`) | wave 3: shared e2e helpers, no casts, no fixed waits, fewer MUI selectors | stopped at session end; continue from `.claude/handoffs/2026-10-20-wave3-specs.md` if it wrote one, else from the branch's commits |
| `plan-trip-places-1020` (`.claude/worktrees/plan-trip-places`) | `doc/plans/trip-places.md`: pasting addresses, coordinates and map links into trip bases | plan only; waits for the answers below |

Reports (git-ignored, `.claude/handoffs/ui-work/review/`): `perf.md` and
`deploy.md` (done), `a11y.md` and `features-on-map.md` (partial or missing if
the agents were stopped; finish them), plus the earlier code reviews.

## Next, in order

0. Fix first (from `review/features-on-map.md`, partial): tapping a feature on the map (point, line, put-in, take-out) deselects the open section instead of opening the feature, on desktop, phone and 320: `useMapClickHandler.ts` only handles section hit layers. On a phone, a feature opened from the list is focused under the full-screen overlay and the collapsed bar does not name it (`map-page/MobileOverlay.tsx`, `MapPane.tsx`). Minor: the open feature is not in the URL, only a ring shows (not the line), desktop centres on the window instead of the free area, the FAB covers a row's km at 320. Not yet checked: signed out, 320 and edge taps, note markers over pins, closing a feature, polygon features.
1. Finish wave 3 and merge it.
2. Finish the accessibility audit (`review/a11y.md`, partial: 2 must, 9 should, 6 nit; not yet checked: form wizards, proposal detail, tools and admin, the lightbox and add-member dialog, snackbar announcement, reduced motion, contrast over the map) and the features-on-map test, then one fix wave from them and from `perf.md`:
   - a11y musts: map markers nest our button inside MapLibre's `role=button` wrapper (NoteMarkers, GaugeMarkers, MarkerHit); the chart svg is focusable with no name, no focus ring and an unannounced readout. Shoulds include nested star buttons in rows, tabs without tabpanels, a drag-only sheet handle, the phone search panel's focus and Escape, an unnamed spinner, "1 run" contrast at 4.46:1, small attribution and "Show the month" targets, Area centre by map click only, radio groups without arrow keys.
   - perf: lazy-load the map and chart libraries (-376 kB on logs, settings, trips), `autoCodeSplitting` in the router plugin, the markdown pipeline out of the React chunk, shorten the chart's data chain and preconnect to the tile server, remove the N+1 requests on trips, notes history and river state, profile the Notes tab's long tasks.
3. One full Playwright run on `ui-overhaul` (phone, desktop, small). Known failures to sort: trips (week strip, day labels, today ring, card radius, trip panel; likely fixture date drift), panel-spacing header menu groups, provenance "an empty history says so", logs headings and canvas cards, settings row padding, proposals selectors.
4. Opus review of the combined diff (AGENTS.md "Agent workflow"), then push `ui-overhaul` and merge into `main` with the user's OK, following `deploy.md` (RUN_MIGRATIONS=false, migrate as its own step, then `derive_section_regions` and `import_region_outlines`; check the four VITE_* values; set CORS_ALLOWED_ORIGINS; document DISABLE_GAUGE_READERS, BASE_URL, PORT and KEYCLOAK_* in AGENTS.md).
5. Delete `doc/plans/wide-canvas.md` and `doc/plans/ui-overhaul.md` (and its folder) when the work is on `main`.

## Waiting on the user

- Trip places plan: (1) production geocoder: self-host a Photon extract on the NAS, or public Photon behind the cache; (2) store and show `place_label` (a migration); (3) "Where it is" second, above Dates; (4) which cut items to keep: Plus Codes, OSM node links, "use my location", Google consent-page short links.
- Open questions: keep the picked area across Name/Area/Region; move the seven regions whose country changes under the overlap rule; fetch `natural=mountain_range` ranges (about 28 in the Alps); the valley cap of 120.

## Decided but not built

- Region picking: one kind at a time, a segmented control instead of the chips, valleys as a thin line with a light fill, a tap preview with "Pick" on a phone (`.claude/handoffs/ui-work/design/region-pick.html`).
- Showing the history of deleted rivers, sections and features in the app (the API serves it on the existing `.../history` routes).
- The rest of the review `should` findings (about half per area, in `review/*.md`).

## Later (overhaul plan)

Dark mode, motion, the 320px sweep, line icons, numbered feature markers.

## Environment notes

- The machine reboots now and then: start Postgres and Keycloak, then the API and Vite from the main repo checkout (the dev-services skill; Vite with `CHOKIDAR_USEPOLLING=1 VITE_API_URL=http://localhost:3000 bunx vite --port 5174`), then reseed the fixture. Run `bun install` after pulling new frontend dependencies.
- Agents' commits are sometimes refused by the permission check; the lead commits after the user's OK.
- `.vscode/settings.json` has a local change nobody here made; leave it.
