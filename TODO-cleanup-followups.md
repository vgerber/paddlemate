# Frontend cleanup follow-ups

Closed out 2026-08-08. Conventions live in AGENTS.md ("Frontend code
style"). Keeping this file as the record of what was decided and why.

## Done

- [x] Map.tsx layer JSX split: `SectionLayers`, `FeatureGeoJSONLayers`
      (proposed flag collapses the duplicated real/proposed stacks),
      `DraftLayers` + `FeatureDraftLayer`, `PickModeButtons`,
      `MapNumberMarker`, `useMapClickHandler`. Map.tsx 1066 -> ~400 lines.
      Verified with before/after screenshot diffs (map pixels identical;
      only the time-relative chart moved).
- [x] Map prop grouping: 32 props -> 14 plus `picking` / `drawing` /
      `chrome` objects (`MapPicking`, `MapDrawing`, `MapChrome`, exported
      from `map/Map.tsx`). All five call sites migrated.
- [x] WaterwaySearchPanel: `useWaterwaySearchFilters`, `useVisibleSections`,
      `SearchFiltersHeader`, `ListViewToggle`. Panel ~470 -> ~220 lines.
- [x] suggest-section.tsx: `useSectionWizardState`.
- [x] ProposalCard split: `ProposalCardHeader`, `ProposalCreateSummary`,
      `ProposalDiffTable`, `ProposalVoteBar`. ProposalDetailPane shares the
      diff table for updates instead of being a third renderer.
- [x] Geometry casts in `map/mapLayers.ts` and `map/useMapCameraEffects.ts`
      removed via `lineCoords`/`pointCoords` and union narrowing.
- [x] `EmptyState` adopted at the three icon+text sites. Typography-only
      one-liners stay as they are.
- [x] Unit tests (bun test): lib/format, lib/waterLevel, lib/proposals,
      sectionPayload - 45 tests. `tsconfig.test.json` covers `src` with
      jsx/DOM so `tsc -b` checks the tests too; the root tsconfig carries
      the `@/` paths for bun's resolver.
- [x] Style leftovers: dead `borderRadius: 1`, 12 no-op `borderRadius: 0`
      declarations, and the hardcoded font literals (theme.ts now consumes
      its own `fonts.label`).

## Decided against

- **MapPageStateContext.** Measured instead of guessed: 8 keystrokes into
  the river search (which updates map-page state, so every consumer
  re-renders) cost a median of 16 ms each - the two-frame measurement floor
  - with **zero long tasks** and 126 ms of scripting across the whole run.
  The item's own criterion was "revisit only if re-render cost shows up in
  profiling"; it does not. A context would not have helped anyway: one
  large value re-renders every consumer exactly like a prop does, and the
  tree is only two levels deep, so there is no drilling to remove. If this
  ever does show up, the fix is splitting the state by concern or
  memoizing leaves - not a context.

## Authenticated smoke - now automated

Rather than hand-writing a session (which tests a fiction), local dev now
runs a real identity provider: `docker compose --profile auth up -d keycloak`
imports `keycloak/realm-local.json`, whose user's subject equals the fixture
owner id and carries `server_admin`. `bun .claude/skills/verify/login.ts`
signs in through the actual PKCE redirect and login form; `smoke.ts` then
runs the flows. See the `verify` skill.

- [x] 12/12 checks pass, 60 API calls, **0 auth failures**: token accepted,
      owned-scope returns the 4 fixture descents, the *private* descent is
      visible to its owner (so the identity really matches), descent detail
      and its map, the log-descent form through to the section-picker map
      with the put-in/take-out controls, the signed-in map page, the admin
      approve/reject controls, and the mobile layout.

Three things only a real token could have caught, all fixed:

- The frontend reads roles from the **ID token**, not the access token, so
  the client needs the `realm-roles-in-id-token` mapper or admin UI never
  appears. Now in `paddlemate-web-client.json`.
- A user assigned only `server_admin` loses `default-roles-<realm>`, which
  carries `offline_access` - the scope the frontend requests. Without it the
  code-to-token exchange fails with "Offline tokens not allowed".
- The approve/reject and vote buttons had no accessible name (icon-only,
  tooltip-labelled). Fixed with `aria-label`s.

## Still open

- [ ] Drawing a feature geometry end to end (place point, draw line/area,
      edit, delete) is exercised only as far as the map mounting with the
      drawing props; the multi-click drawing itself is still manual.
