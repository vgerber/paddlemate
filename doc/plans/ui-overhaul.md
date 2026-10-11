# UI overhaul: the calm design

Branch `ui-overhaul`. This plan is not reference documentation: delete it,
with `doc/plans/ui-overhaul/`, when the work has landed. It is run by the lead
under "Agent workflow" in `AGENTS.md`.

## The design

The spec is [ui-overhaul/calm-design.html](ui-overhaul/calm-design.html), one
page with every agreed screen (open it in a browser; the region screenshots are
only in the published copy). The written rules are in
[design.md](design.md). Published pages, for the detail behind a screen:

| Topic | Page |
|---|---|
| The main design, light and dark, all screens | https://claude.ai/artifact/FoWxiVj9Y8eLBQ4fZhPJHU |
| Feature type icons, strip header, grouping | https://claude.ai/artifact/J19ZfLGgwdF8R9XASKiBqg |
| Sources tab and feature history | https://claude.ai/artifact/LWsNJ2Qcc8U8dno3NCMd8H |
| Region map: today and proposed, real data | https://claude.ai/artifact/GtbJN6QjKhiGYQL9eF5nYH |
| Region map: three specialists | https://claude.ai/artifact/26vuiF7WLxDX6Nux6M8QCQ |
| Region map on small phones | https://claude.ai/artifact/GQzyf8VVCUzd3W7CyCbWu5 |
| Chart card: three specialists | https://claude.ai/artifact/7W9pi6YBrVKUAaEPGqxd1m |
| Filter view: nine variants (paddler's variant chosen) | https://claude.ai/artifact/CR31nDRvjQVoGCG8RbwBX1 |
| Motion: choreography | https://claude.ai/artifact/JdaLPqGA4z9N5TvBvF4YLF |
| Motion: feedback | https://claude.ai/artifact/YCmuY5usfenNgUBjA4ejCm |
| Motion: engineering and tokens | https://claude.ai/artifact/SVmXoQxL6QduUdxo3hsKsC |
| Map motion: where it belongs, on real data | https://claude.ai/artifact/J8Rqa9WM1bfY9NckkDTqNB |
| Map motion: cost in MapLibre, battery policy | https://claude.ai/artifact/GYYCKYHGHv1T2J694HRUVx |
| Features list grouping: three specialists | https://claude.ai/artifact/P8J3vx7Upv1puRXZQCriJ1 |

## Where it stands

**WP0, the theme, is done** (`frontend/src/lib/theme.ts`): light calm tokens
under the existing names, so the 60 consumers re-skin without edits; Figtree
instead of Space Grotesk and Inter; real radii, three elevation steps, the
motion scale, touch sizes; MUI overrides for buttons, chips, tabs, inputs,
dialogs, menus, alerts; reduced motion as a floor; map labels ink on a white
halo. The Playwright setup is in place (`frontend/e2e/`: real Keycloak sign-in,
`phone`, `small` and `desktop` projects, shared helpers) with the first feature
spec, `e2e/theme`. Every guard in it was checked by breaking it.

What the theme step leaves visibly old, on purpose, because it belongs to a
feature: capitals and letter-spacing hard-coded in 31 places, the segmented
tab bars, square rows, the dark-era map layers, the lime-era wording of
"selected". Each is owned by a package below.

## Fixed interfaces

These are written once by WP1 and used by every package, so agents never
invent a rival.

| Piece | Where | What |
|---|---|---|
| Tokens | `lib/theme.ts` | colors, `radii`, `elevation`, `motion`, `touch`, `alphas`, `labelSx` (done) |
| `UnderlineTabs` | `components/UnderlineTabs.tsx` | the panel tab bar: value, items, 48px tabs, underline that can follow a drag |
| `useSwipeTabs` | `lib/hooks/useSwipeTabs.ts` | horizontal swipe between tab panes: direction lock, 40% or flick to commit, edge resistance, 24px edge left free, reduced motion |
| `BottomSheet` | `components/BottomSheet.tsx` | peek and open heights, drag between them, scrim, focus handling |
| `FeatureTypeIcon` | `components/FeatureTypeIcon.tsx` | the 14 feature type icons on one grid, sizes 16 to 24 |
| `ChipRow` | `components/ChipRow.tsx` | chips that are 32px to look at and 44px to hit, scrolling sideways with a fade |
| Motion helpers | `lib/motion.ts` | the tokens as CSS strings, `prefersReducedMotion`, a transition helper |
| Existing | `PanelHeader`, `ListPaneHeader`, `DockedAction`, `Fact`, `FormSection`, `PanelBottomBar`, `RowMenu`, `TimelineRail`, `ConfirmDialog`, `WaterLevelChip`, `components/states/*` | restyled to the calm design, same props |

## Work packages

Files are owned by exactly one package. A file two packages need belongs to the
lead and changes once per wave. Every package ships its Playwright spec with
the work.

### Wave 1: foundations (lead, sequential)

| WP | What | Owns | Spec |
|---|---|---|---|
| WP1 | The fixed interfaces above, and the shared components restyled | `components/*.tsx` (top level), `components/states/**`, `lib/motion.ts`, `lib/hooks/useSwipeTabs.ts` | `e2e/primitives` (tab swipe, sheet drag, chip hit areas, icon set) |

### Wave 2: features (parallel, one agent each, disjoint files)

| WP | Feature | Owns | Spec |
|---|---|---|---|
| WP2 | App shell and navigation: app bar, bottom nav pill, panels, overlay, tools, notifications | `routes/__root.tsx`, `routes/tools/**`, `components/map-page/{DesktopSidebar,MobileOverlay,SidebarContent,useMobilePanelState}`, `components/{ToolsList}.tsx`, `components/notifications/**` | `e2e/app-shell`, `e2e/navigation` |
| WP3 | Rivers and sections: the river list, section cards with the level pill, recent rivers | `components/waterway/{WaterwayBrowsePanel,SectionListItem,SectionLogsList}`, `components/search/{RiverRow,RiverList,SectionList,ListGroupHeader,ListViewToggle,RecentRiverList}` | `e2e/sections` |
| WP4 | Section detail: features list with strip, icons, bands and the fold; notes and comments | `components/waterway/section-details/**`, `components/waterway/{FeatureRow,CommentRow,CommentThread,ProposalCard}` | `e2e/section-detail` |
| WP5 | Charts and gauges: the chart card that opens, options, thresholds, gauge catalog, attribution | `components/charts/**`, `components/gauge-catalog/**`, `components/GaugeAttribution.tsx`, `components/map-page/MapCharts.tsx`, `components/waterway/{GaugesList,GaugeRangePicker}` | `e2e/charts` |
| WP6 | Search and filters: header and tabs, pinned field, chips, Filters sheet, region mode | `components/search/{WaterwaySearchPanel,SearchFiltersHeader,DifficultySelect,RegionSelect,AreaControls,useWaterwaySearchFilters,useVisibleSections,usePendingRiverProposals,SectionAdder}` | `e2e/search` |
| WP7 | The map and regions: calm layers, one-line region boundaries, picked region, peek sheet, map controls, markers | `components/map/**`, `components/map-page/{MapPane,SectionSpeedDial,useFeaturePicker,useMapPageState}`, `components/waterway/GeometryPicker.tsx` | `e2e/map` |
| WP8 | Trips: list, plan with the pinned week calendar and month, bases, members, invite | `components/trip-page/**`, `components/trips/**`, `routes/trips/**`, `routes/invite/**` | `e2e/trips` |
| WP9 | Logs and descents: lists, detail, the log descent wizard | `components/descents/**`, `components/logs-page/**`, `routes/logs*`, `components/StandingDescentBanner.tsx` | `e2e/logs` |
| WP10 | Wizards: suggest river, section and feature | `components/waterway/{SuggestFeatureForm,SuggestFeaturePanel,SuggestWaterwayPanel,SectionFeaturesStep,SectionLineStep,SectionNamingForm,useSectionWizardState,sectionPayload}`, `routes/waterways/**` | `e2e/wizards` |
| WP11 | Proposals, review and provenance: proposals list and detail, the Sources tab, feature history | `components/proposals/**`, `routes/proposals/**`, `routes/admin/**`; the Sources and history views | `e2e/proposals`, `e2e/provenance` |
| WP11b | The API behind provenance (Rust, one agent, owns migrations for the wave): a history endpoint per entry, direct admin edits writing a history step, creator on rivers, deletes that survive in history, user names in proposals | `api/**` | `api/tests/**` |
| WP12 | Settings and sign-in screens | `routes/settings.tsx`, `routes/auth/**`, `components/notifications/PushSettings.tsx` | `e2e/settings` |

Dependencies: WP1 before every wave 2 package. WP11 needs WP11b for real data.
WP7 wants a containment answer from the API (which region holds which) for the
rule that hides a range holding two or more others; until it exists, the map
uses bounding boxes, which is only an approximation. WP3 and WP6 share the
`search/` folder and the files are split above; neither edits the other's.

### Wave 3: across the app (after wave 2)

| WP | What |
|---|---|
| WP13 | Dark mode: tokens as CSS variables so the hex-alpha suffix becomes a helper; one switch for the system preference; the dark screens from the design page |
| WP14 | Motion applied: the panel, fold, chart, sheet, calendar and tab transitions from the choreography page; feedback states; the flow along the selected section on the map under the battery policy; one per-app reduced-motion switch |
| WP15 | The sweep: every screen at 320px and at 130% text, touch targets everywhere, keyboard and screen reader pass, then the Opus review |

### Map motion (for WP7 and WP14)

Decided from the two map motion pages; the hook sketch is
[ui-overhaul/useMapMotion.sketch.txt](ui-overhaul/useMapMotion.sketch.txt).

- **Kept.** One ambient motion, the flow along the *selected* section only; the
  selected line drawing in from put-in to take-out (360 ms, in-out) with the
  feature markers fading in as the head passes; camera easing to a selection
  (260 ms near, 360 ms up to 1.5 screens away, a jump beyond that), padded for
  the panel or sheet; a ring once on point targets; a level change filling the
  dot from its centre; the search pin and its radius; offline or stale as hollow
  dots with the flow stopped; one 260 ms fade on first load; labels and region
  tiers following zoom.
- **Dropped.** Flow on every river, a ripple on a line, the region outline
  drawing in, and any marking of an unchanged reading.
- **Techniques.** Flow: one dasharray layer filtered to the selected section,
  12 frames at 12 Hz, transition 0. Draw-in: a `line-gradient` step in its own
  source with `lineMetrics` (`line-trim-offset` does not exist in MapLibre
  5.24; `setData` per frame costs two to three times more). Level change: a DOM
  marker CSS transition (a paint transition does not run on data-driven
  expressions). Marker arrival: DOM markers with animation delays. Camera:
  `easeTo` with padding, `duration: 0` under reduced motion. Zoom fades:
  zoom-interpolated opacity.
- **Battery.** Ambient motion pauses when the tab is hidden, after 20 s idle,
  under reduced motion, when a full-screen overlay covers the map, and at 20%
  battery when not charging where the Battery API exists. At most one animated
  object, at 12 Hz.
- **Cost.** The flow keeps the map rendering about 60 times a second and costs
  roughly 45 to 67 ms of main thread per second at 1x CPU, and 180 to 265 at 4x:
  it is the one costly item. Measured in software-rendered headless Chrome;
  verify on a real phone before it ships. `lineMetrics` on the main sections
  source needs a tiling-cost check.
- **Data caveat.** Stored section lines are often two points, so a flow or a
  draw-in follows a straight stroke beside the real river. The production flow
  needs the OSM centreline.

## How each package runs

1. Read the design page section and `design.md`; read the owned files.
2. Write the Playwright spec first, from the design (what a user does, what the
   browser computes, `@small` where a layout can break); watch it fail.
3. Restyle or rebuild to the spec. Replace every `textTransform: "uppercase"`,
   literal radius, hand-written shadow and non-token color in the owned files.
4. Every guard in the spec is checked by removing it. Gates from `AGENTS.md`.
5. Report in under 15 lines: files, gate results, spec results with counts,
   deviations from the design page, decisions needed.

After a wave, one reviewer agent on Opus runs the stack, drives the flows at
320px, 390px and desktop, goes through the security table, reads the combined
diff and reports; the lead merges after it.

## Tests

`frontend/e2e/<feature>/<feature>.spec.ts`, helpers in `frontend/e2e/support/`.
Common checks that every package reuses: no sideways scroll at the project's
width, touch targets at least 44px (`expectTouchTargets`), computed tokens
(`computed`), the page ready when the map has drawn (`appReady`). Swipes are
driven with real touch events (`Input.dispatchTouchEvent` through a CDP
session), not by calling the handlers.

## Open decisions

- **Error color.** One expert proposes a berry error (`#8c2a5a`) so red is only
  ever a high water level. The theme uses the old red for now; one token.
- **Water now** is a new filter in the search design (Low, Medium, High from the
  level class the app computes). It is in the design page; keep or drop.
- **Ranges and districts** in region mode: keep (only those holding sections)
  or drop (the paddler's view).
- **Country on map labels.** The design drops "AT ·" in favour of AT and IT at
  the border; the picker and sheet keep it.
- **New words**, to be agreed before they ship: "Search" as a title, "Filters",
  "Reset", "Part of", "Mountain ranges in view (n)", "Sources", "History",
  "Falling", "Rising", "Steady", and "Tap" in place of "Click" on a phone.
- **Camera token.** A three-zoom move in 360 ms is brisk; a longer camera token
  may be wanted.
- **Dark mode** is WP13, after the features, because the hex-alpha suffix used
  in 38 places cannot take a CSS variable.
