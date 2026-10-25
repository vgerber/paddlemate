# Plan: motion applied (WP14)

Status: in progress, started 2026-10-25. Delete this file when the work has
landed; the rules move to [design.md](../design.md#motion), the tokens stay
in `lib/theme.ts` and `lib/motion.ts`.

WP14 of [ui-overhaul.md](ui-overhaul.md): the panel, fold, chart, sheet,
calendar and tab transitions from the choreography page; feedback states; the
flow along the selected section on the map under the battery policy; one
per-app reduced-motion switch.

## What it does for the user

Things move only to show where something came from or went: a detail pushes
in from the right, a folded list hands its height to the chart, the trip
calendar's disc follows the day you scroll to, a wizard step slides the way
you are going. Taps answer at once. The selected section on the map flows
gently and draws itself in from put-in to take-out. **Settings > Appearance >
Motion** has Full (the default), Reduced and System; Reduced keeps short
fades and drops all movement, also on the map.

## Sources

| Page | Copy for agents | Wins on |
|---|---|---|
| Motion: choreography (https://claude.ai/artifact/JdaLPqGA4z9N5TvBvF4YLF) | `.claude/handoffs/ui-work/motion-language.html` | tokens, the six rules, the six moments (panel, features card, chart, region sheet, calendar, wizards) |
| Motion: feedback (https://claude.ai/artifact/YCmuY5usfenNgUBjA4ejCm) | `.claude/handoffs/ui-work/motion-feedback.html` | press and selection, segmented and tabs, loading and refetch, number and level change, stale, results of an action |
| Motion: engineering (https://claude.ai/artifact/SVmXoQxL6QduUdxo3hsKsC) | (summarised below) | techniques |
| Map motion (ui-overhaul.md, "Map motion") | `doc/plans/ui-overhaul/useMapMotion.sketch.txt` | everything on the map |

Where the pages disagree, the choreography page's token scale (90 / 160 / 260
/ 360, the four easings) wins over the feedback page's own numbers; the
feedback page's structure (overlay opacities, what changes when) is kept. The
feedback page's berry error colour is **not** adopted: the error colour stays
(ui-overhaul.md, Decisions).

Engineering choices: disclosure by `grid-template-rows` (or MUI `Collapse`
with token timing); sheets by `transform` only; the calendar's active day by
IntersectionObserver plus a transform transition; MapLibre by paint
expressions and `easeTo`, never `setData` per frame or CSS left/top on
markers; no view transitions over the map canvas.

## Fixed interfaces (the lead's, merged before any feature agent starts)

`lib/motionMode.ts` (new):

```ts
export type MotionMode = "system" | "reduced" | "full";
export const MOTION_KEY = "pm-motion";               // localStorage
export function resolveMotion(mode: MotionMode, osReduced: boolean): "reduced" | "full";
export function useMotionMode(): [MotionMode, (m: MotionMode) => void];
```

The resolved value lives on `<html data-motion="reduced|full">`, set before
first paint by the inline script in `index.html` and kept live (OS change and
the setting) by `useMotionMode`'s provider effect, mounted once in the root.

`lib/motion.ts` (extended; existing exports keep their names):

```ts
export function prefersReducedMotion(): boolean;     // reads html[data-motion]
export function useReducedMotion(): boolean;          // live, re-renders on change
export function ms(d: Duration): number;              // 0 under reduced
export function releaseMs(px: number): number;        // 220 + 0.25 px, max 360
export function stepMs(steps: number): number;        // 160 + 20 per step, max 300
export function cameraMs(screens: number): number;    // 260 up to 0.5 screen, 360 up to 1.5, else 0 (a jump); 0 under reduced
export const css: { ...; settle: string };            // settle easing added
```

`tokens.motion.easeSettle` = `cubic-bezier(0.22, 0.9, 0.28, 1.02)`, sheets only.
The global CSS rule in `MuiCssBaseline` keys on `html[data-motion="reduced"]`
instead of the media query (the attribute already folds in the OS setting).
JS-timed transitions (MUI `Collapse`, `Slide`, `Fade` timeouts, MapLibre
durations) take `useReducedMotion()`: movement 0, opacity `REDUCED_FADE_MS`.

## Packages

Each package owns its files; nobody edits another's. Shared files belong to
the lead: `lib/motion.ts`, `lib/motionMode.ts`, `lib/theme.ts` (M7 gets the
press-state overrides in its wave), `index.html`, `routes/__root.tsx`.

| # | Wave | What | Owns | Spec |
|---|---|---|---|---|
| M1 | 1 | The switch and the interfaces above | `lib/motion.ts`, `lib/motionMode.ts`, `lib/theme.ts`, `index.html`, `routes/__root.tsx` (provider mount), `components/settings/AppearanceSection.tsx` | `e2e/motion/switch.spec.ts`, `e2e/theme/theme.spec.ts` |
| M2 | 2a | Map ambient: flow along the selected section (12 frames, 12 Hz), draw-in (360 ms, `line-gradient` with `lineMetrics` in its own source), first-load fade (260 ms once), battery policy (hidden tab, 20 s idle, reduced, full-screen overlay, battery under 20% not charging) | new `components/map/useMapMotion.ts`, `components/map/SectionLayers.tsx`, `components/map/Map.tsx`, `components/map/calmStyle.ts` | `e2e/map/motion.spec.ts` |
| M3 | 2a | Camera: `easeTo` with padding and `cameraMs` for selections; fits and flights on the scale (base or slow), 0 under reduced | `components/map/useMapCameraEffects.ts`, `components/gauge-catalog/GaugeCatalogMap.tsx` | `e2e/map/camera.spec.ts` |
| M4 | 2a | Panels and sheets: moment 1 (detail push 40 px, list steps back 16 px and dims, close 70% with the row tint; desktop pane cross-fade), moment 4 (release by `releaseMs`, settle going up, region pick sequence in the search bar) | `components/map-page/MobileOverlay.tsx`, `components/BottomSheet.tsx`, `components/map-page/SearchSheet.tsx`, `components/canvas/FloatingCard.tsx`, the region bar in `components/search/` (name it in the report) | `e2e/motion/panels.spec.ts` |
| M7 | 2a | Feedback: press overlay (.04 hover, .08 press; filled .10/.20), scale .985 on buttons, cards and chips (not rows), selection wash and bar at 90 ms, spinner delay on every bare spinner outside wizards, snackbar enter 200 / exit 120 with 8 px, level pill colour cross-fade in a fixed width | `lib/theme.ts` (component overrides only), `components/states/**`, `components/AppSnackbar.tsx`, `components/WaterLevelChip.tsx`, `components/VoteButton.tsx`, `PanelBottomBar.tsx`, `map-page/MapPane.tsx`, `search/RegionBrowse.tsx`, `waterway/CommentThread.tsx` | `e2e/motion/feedback.spec.ts` |
| M5a | 2b | Features card: band fold (grid rows, rows fade first, chevron), card fold to the strip, selection fill | `components/waterway/section-details/**` | `e2e/section-detail` |
| M5b | 2b | Chart: the height hand-over from the features card on the same curve, options open (grid rows, 3-row stagger), redraw (old fades, new revealed by clip-path, area after), skeleton mirroring the card, the reading's number change (old up and out, new in, tabular) and stale reading (60%, dashed neutral pill) | `components/charts/**`, `components/waterway/useChartGrow.ts`, `components/waterway/WaterwayBrowsePanel.tsx`, `components/map-page/MapCharts.tsx` | `e2e/charts` |
| M6 | 2b | Trip calendar (moment 5: disc follows the scroll, week slide, month pull with the 22 ms fan) and the trip folds on the scale | `components/trip-page/**` | `e2e/trips` |
| M9 | 2b | Wizards (moment 6): direction-aware step change, progress fill, success mark | the log descent and suggest section, river and feature wizards (`components/descents/DescentForm*`, `components/waterway/{SuggestFeatureForm,SuggestFeaturePanel,SuggestWaterwayPanel,SectionFeaturesStep,SectionLineStep,SectionNamingForm}`) | `e2e/wizards`, `e2e/logs` |
| M8 | 3 | Map markers: ring on point targets (travels, once), level dot fills from its centre, markers fade in as the draw-in head passes, stale or offline gauges as hollow dots with the flow stopped | `components/map/GaugeMarkers.tsx`, `NoteMarkers.tsx`, `components/LevelDots.tsx`, new `components/map/TargetRing.tsx`, and `Map.tsx` after M2 has merged | `e2e/map/markers.spec.ts` |

Tabs and the swipe are already built to the page (`useSwipeTabs`,
`UnderlineTabs`); M7 checks the segmented thumb's `stepMs`.

## Acceptance

- With Motion on Reduced, at 390 px: opening a river detail moves nothing
  (every transform on the panel is `none` mid-transition) and the panel's
  opacity goes 0 to 1 in 140 ms +-30; the camera jumps (`easeTo` duration 0);
  no flow frame is requested for 2 s. With Full, the panel's translateX at
  100 ms is between 2 and 40 px (260 ms on the out curve).
- The setting survives a reload with no flash: `html[data-motion]` is set
  before the bundle runs (checked from an init script).
- The flow animates only the selected section, at 12 Hz +-2, and stops within
  one frame of the tab going hidden, of 20 s without input, and of an overlay
  covering the map; at most one animated map object at a time.
- Camera: a selection 0.3 screens away eases in 260 ms +-40, 1.2 screens in
  360 ms +-40, 3 screens jumps.
- Folding the features card: its bottom edge and the chart's top edge differ
  by at most 1 px in every frame; the chart is taller by the same pixels at
  the end.
- A bare spinner never shows for a request answering under 150 ms.
- Press: a row's overlay reaches 0.08 within 90 ms of pointer-down.
- Every guard is checked by removing it. Frame budget: the existing
  `e2e/swipe/frames.spec.ts` style check on the panel and the fold, no long
  task over 50 ms.
- On a real phone (the user, before ship): the flow's cost, and whether the
  camera wants a longer time for moves of three zoom levels or more
  (ui-overhaul.md, still open).

## Known limitations

- Frame budget: in software-rendered headless Chrome the map alone makes
  long tasks of 70-180 ms (measured on the phone panel and the features
  fold, identical under Reduced motion), so the 50 ms line cannot hold there.
  `e2e/motion/frames.spec.ts` keeps a 300 ms bound; the 50 ms budget is
  checked on a real phone before ship.
- Stored section lines are often two points, so the flow and the draw-in
  follow a straight stroke beside the river until the OSM centreline is used.
- Phone panel (M4): the list is unmounted while a detail shows, so it does
  not step back and dim behind it, and the detail has no slide-out on close;
  the facts stagger, the row tint after close and the title flight are cut.
  The desktop pane only fades in (the old content is gone when the new one
  arrives). Of the region pick sequence only the region chip rising in is
  built.
- Chart (M5b): the period choice is a menu, so options open as a staggered
  menu, not a panel inside the card; a redraw remounts the chart, so the old
  line does not fade out first.
- Calendar (M6): a second week change mid-swap drops the first slide; a drag
  started while the month settles starts from its target.
- Markers (M8): feature markers are GL layers, so they do not fade in as the
  draw-in head passes; the flow does not stop for a stale gauge on the
  selected section (only offline and stale gauge dots turn hollow).
- Wizards (M9): the log descent and suggest feature flows close straight away,
  so only the suggest section and river flows show the success mark.
- The flow pauses on software-rendered WebGL (no GPU), where each repaint
  costs about 80 ms; its cost on a real phone is still to be judged.
