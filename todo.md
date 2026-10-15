# UI overhaul: to do

State on 2026-10-15. Delete this file when the overhaul has landed on `main`.

## Where the work is

| Branch | Holds | State |
|---|---|---|
| `ui-overhaul` | the pushed overhaul up to 8607914 | behind `integrate-2b` by about 180 commits |
| `integrate-2b` (worktree `.claude/worktrees/integrate-2b`) | every round since: wide-screen canvas and reading rail, calm borderless chart, values pane, one header menu, panel spacing, river state, grade rules, region search fixes (migration 0050), level dots, map follows the filters, phone margins, swipe preview and smooth swipe | gates green (tsc, biome, 467 bun tests); not yet merged into `ui-overhaul` |
| `review-w1-1015` (worktree `.claude/worktrees/review-w1`) | review wave 1: one source for the current level, level colours, section grade, log title, reading time, geometry | 8 commits on top of `integrate-2b` 8dc2d0a; gates and specs not run yet |

Reviews, briefs, designs and test notes are in `.claude/handoffs/ui-work/` (git-ignored): `review/*.md`, `design/*.html`, `search-test/`.

## Next, in order

1. Gate `review-w1-1015` (tsc, biome, bun test, the affected specs) and merge it into `integrate-2b`.
2. Review wave 2, four agents in parallel on separate files (findings in `review/*.md`):
   - Theme and shared pieces: small buttons and toggles at 44px; one active-tab rule in `routes/__root.tsx`; `PanelBottomBar` drops the dead `leftIcon`; shared busy, segmented-control and marker-shadow pieces; tidy `theme.ts` (aliases, unused tokens, raw colours, radii off the scale); one shared `useSession` store.
   - Trips, logs, proposals: errors shown once (`meta.errorHandledLocally`); trip actions in one list (`TripFab`); confirm dialogs that wait and catch; the inbox's `EmptyState`; one way back; load errors not silent (`useFollows`, `useTripTimeline`); one vote control; one open-row style.
   - Search and waterway: the `routes/waterways/$waterwayId.tsx` stub; the double submit in `SuggestFeatureForm`; the copied `flatRowSx`, recent-river row, three timeline rails and the hand-rolled menu in `CoordsInfo`; Sources and history errors with Retry; the notes field's touch targets and 13px text; dead code; plurals.
   - Map, canvas, charts: the dead features-fold state; three-branch ternaries as sub-components; the gauge marker's 44px hit area; split `useMapPageState`; dead exports; cards using `PanelHeader`.
3. Review wave 3: shared e2e helpers and mocks, no casts in specs and tests, no `waitForTimeout`, fewer MUI class selectors.
4. One full Playwright run on `integrate-2b` (phone, desktop, small). About 20 failures were reported but not checked against the base: trips (week strip, day labels, today ring, card radius, trip panel), logs (headings, wrapped pill, detail, canvas cards), sections and search flat-row radius, proposals (6, `map-layer-toggle` selectors). Fix or update each.
5. Opus review of the combined diff (AGENTS.md "Agent workflow"), then fast-forward `ui-overhaul` to `integrate-2b` and push.
6. Update the design system (https://claude.ai/artifact/E8VZQSwJmQhnfLGuPrK585) for the 8px rail gap, the dotted resize tab and the stat-tile values pane; log decisions in the control room (https://claude.ai/artifact/H7yXYXDMdwq9oJwiMWrZhC).

## Decided but not built

- Region picking: one kind at a time following the zoom, a segmented control instead of the chips, valleys as a thin line with a light fill, a tap preview with "Pick" on a phone (`design/region-pick.html`).
- Phone chart card without its sliders icon (`design/panel-details.html`, item 4).

## Open questions

- Keep the picked area when switching between Name, Area and Region?
- Move the seven regions whose country changes under the new overlap rule?
- Clear a pointed chart point when the pointer leaves?
- Fetch `natural=mountain_range` ranges (about 28 in the Alps)? Valleys stay capped at 120.
- What the self-hosted Overpass (nas-1:5569) returns when a reply fails to decode: the API now logs its first 200 characters.

## Later (overhaul plan)

Dark mode, motion, the 320px sweep, line icons, numbered feature markers, an API for the history of deleted features.

## Environment notes

- The machine reboots now and then: restart Postgres, Keycloak, the API (from `integrate-2b/api`) and Vite with `CHOKIDAR_USEPOLLING=1` (the dev-services skill), then reseed the fixture.
- Agents' commits are sometimes refused by the permission check; the lead commits after the user's OK.
