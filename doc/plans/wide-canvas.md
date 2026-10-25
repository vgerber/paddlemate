# WP16 plan: wide screens, map as the canvas

Design: the "map as the canvas" concept (published at
https://claude.ai/artifact/1qgiaEkCBRxcVquBH5x152, page map-canvas.html). The user chose it.

## Rules (from the design)

- At md (768) and up, on every screen with geography (`/`, `/logs*`, `/trips*`, `/proposals*`) the
  map fills the window under the 56px app bar. Content sits in floating cards over it.
- Detail card: 38% of the window, min 420, max 720, full height, resizable with a grip from 360 to
  45%, width remembered per screen. List card: 20% (300-380). Side card (logs, proposals): 30%
  (420-600). All cards together cover at most 55% of the width; beyond that the lowest-priority
  card collapses to its header.
- The chart docks along the bottom of the free map area: height clamp(180px, 22vh, 260px); longer,
  not taller, on wide screens. Under 1280 the dock folds into the detail card as its first block.
- The free map area (window minus cards and dock, 32px margin) is the fit-bounds padding, so the
  subject is never under a card; recomputed while a card is dragged.
- 1600+ adds a members card on trips. Below md the phone layout stays exactly as it is.
- Settings has no map: a centred two-column page (240px nav, 720px column).
- Pickers, wizards, tools and gauge coverage keep their own embedded maps (not geography screens).

## Architecture

- **One host.** `__root.tsx` mounts `<CanvasHost/>` before `main`, at md+ only and only on the
  geography routes above; elsewhere it renders nothing and the map is released. The host is fixed
  under the app bar (z 0); cards float in a `pointer-events:none` overlay whose cards set
  `pointer-events:auto`, so the map pans in the gaps.
- **Scene contract** (`components/canvas/CanvasContext.tsx`, an external store with
  `useSyncExternalStore` so scene changes re-render only the host):
  `MapScene` = the existing `WaterwayMap` props (sections, features, proposedFeatures, rings,
  pointPins, selectedSectionId, sectionLevels, notes, gauges, area, regions, the `picking`,
  `drawing`, `chrome` groups, `camera` without padding) plus `subject: {key, bounds, maxZoom?} |
  null`. Routes call `useCanvasScene(scene)` (set in a layout effect, cleared on unmount, with an
  owner token so an old cleanup never clears a newer scene) and `useCanvasLayout()`.
- `MapCamera` gains `padding?: {top,right,bottom,left}` and `subject?`. `useMapCameraEffects` uses
  `padding ?? 60` everywhere (the phone's `focusPaddingBottom` folds into `padding.bottom`, same
  result), fits `subject.bounds` when `subject.key` changes, refits when padding changes (duration
  0 in rAF while dragging, 400ms after), and skips a refit when the subject is already inside.
- **Home:** `buildMapScene(state)` (new, pure, `map-page/mapScene.ts`) holds the props `MapPane`
  assembles today. md+: the route sets the scene and renders cards; phone: `MapPane` spreads the same
  scene into its own map (one source of truth). Map overlays (speed dial, area controls, region
  sheet, standing banner) move into a host overlay slot inside the free area.
- **Inline maps:** `DescentDetail` and `ProposalDetailPane` get `showMap` (default true; false
  inside the canvas, their data lifted into the scene). `BasesMap` stays on phone; its data memo
  becomes `useBasesScene(trip)`.
- At most one `.maplibregl-map` at md+ on every geography route, including after navigating
  between them. `window.__paddlemateMap` stays valid.

## Shared pieces (`components/canvas/`)

- `CanvasLayout` `{children}`: overlay root, card registry, cover budget.
- `FloatingCard` `{id, side: "left"|"right", kind: "detail"|"list"|"side", header, children,
  screen?, resizable?, fullHeight?, priority?}`; spec table `detail {frac .38, min 420, max 720,
  resize [360, .45]}`, `list {.20, 300, 380}`, `side {.30, 420, 600}`; 16px margins; width from one
  rAF-throttled `useWindowWidth`; reports its rect by ResizeObserver; collapsed = header only (56px),
  header is a button with `aria-expanded`, a click expands it and collapses the lowest peer.
- `ResizeGrip`: 6x44 visual, 20px hit area, `role="separator"`, `aria-orientation="vertical"`,
  `aria-valuenow/min/max`, focusable; pointer capture, Left/Right 16px (Shift 64), Home/End. Writes
  the width fraction on pointer-up/key-up via `lib/cardWidth.ts` (`readCardFrac`/`writeCardFrac`,
  localStorage in try/catch, clamped on read).
- `useCoverBudget`: expanded widths <= 0.55 x window; non-detail cards collapse first by priority.
- `ChartDock` `{children}`: from the rightmost left card edge + 16 to the leftmost right card edge -
  16; `useDockMode()` returns "dock" from 1280, "inline" below; `ChartCard` gets `variant="dock"`
  (no own shadow or radius, fills the dock height).
- `useFreeArea(): {rect, padding}` from the registry; padding = card edges + 32, each side clamped
  to 45%; under 240x200 free it falls back to the whole host.
- Tokens in `lib/theme.ts`: `canvas.margin`, `canvas.coverMax`, `canvas.dockMin/Max`, card specs.

## Per screen

| Screen | Cards | Scene and subject |
|---|---|---|
| Map and section `/` | Detail card left (`SidebarContent`: search, river, section, features, notes, sources); dock: `MapCharts` | sections, features as numbered markers matching the rows, gauges, notes, area, regions, picking/drawing; subject: selected section, else river, else results |
| Logs | List card left; side card beside it with the open log (`DescentDetail showMap={false}`) | the run's sections in teal, put-in and take-out, other logs as dim ghost lines; subject: the open log, else all logs |
| Trips | List card left; detail card (`TripDetail`); at 1600+ a members side card right | watch-list sections, base rings; subject: all rings and sections |
| Proposals | List card left; detail card (diff as the main block, review docked) | before dim, after teal; subject: the union |
| Settings | no map; centred 240 + 720 | none |

## Work packages

- **WP16a Foundation** (first): `components/canvas/*`, `lib/cardWidth.ts`, `routes/__root.tsx`
  (host and route allowlist), `components/map/Map.tsx` (camera padding/subject),
  `components/map/useMapCameraEffects.ts`, `components/charts/ChartCard.tsx` (dock variant),
  `lib/theme.ts` (canvas tokens), bun tests for the width and budget math, a DEV-only demo route
  `routes/dev/canvas.tsx` with a fake scene, `e2e/canvas/`. Acceptance: detail card 486 at 1280,
  547 at 1440, 720 at 1920 (+/-1); grip drag persists across reload and the page renders with
  localStorage throwing; ArrowRight on the grip widens by 16; free-area padding = card edge + 32
  and the subject's projected bounds lie inside the free rect (+/-2px); exactly one map at md+,
  none at 412; two cards at 1024 collapse the second to a 56px header; dock 180 at 1280x720, 238 at
  1920x1080, 260 at 1920x1440; 0 map render events while idle for 2s.
- **WP16b Map and section** (after a): `routes/index.tsx`, `components/map-page/*` (new
  `mapScene.ts`), their e2e specs. Acceptance: the selected section inside the free area at
  1280/1440/1920; dock spans card edge + 16 to window edge - 16, wider at 1920 than 1280, at most
  260 tall; under 1280 the chart is the first block of the card; phone at 412 and 320 unchanged
  (screenshots taken before the change, compared after).
- **WP16c Logs**, **WP16d Trips**, **WP16e Proposals**, **WP16f Settings** (parallel, after b): each
  owns its routes, components and e2e folder. Acceptance per screen: card widths per the spec, the
  subject inside the free area, deep links (`/logs/<id>`, `/trips?selected=`, `/proposals/<id>`)
  load with the item open and drawn, phone unchanged; trips show the members card at 1600 and not
  at 1599; proposals draw one dim and one teal layer; settings nav 240 and column 720, centred, no
  map.
- **WP16g Sweep** (last): full suite, the AGENTS.md "Desktop is not a wide phone" paragraph and
  doc/design.md updated to the canvas rules and the `MapScene` contract, old-layout specs updated.

## Risks and how they are handled

1. Always-on map: mounted only on geography routes, released elsewhere; refits are event-driven
   (subject key, drag end), never a loop; idle render count tested.
2. Route changes: the map persists between geography routes (no tile reload); scenes are cleared on
   unmount with an owner token; fits keyed on the subject.
3. Deep links: scenes derive from route params and cached queries; the first fit waits for the map
   load and the measured card rects.
4. Focus: cards follow the map in DOM order; the grip is a labelled separator; Escape in the map
   returns focus to the active card header.
5. Old specs that assume the two-pane grid or the inline maps are updated by the package that owns
   them; phone specs must pass unchanged.
6. Phone regression from splitting `MapPane`: baseline screenshots at 412 and 320 before WP16b.
7. Crossing 768 mounts or unmounts the host; accepted.
