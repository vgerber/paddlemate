# Plan: dark mode (WP13)

Status: plan, not started. Delete this file when the work has landed; the
user-facing part moves to [design.md](../design.md) and the README feature
list, the palette to `lib/theme.ts`.

WP13 of [ui-overhaul.md](ui-overhaul.md): "tokens as CSS variables so the
hex-alpha suffix becomes a helper; one switch for the system preference; the
dark screens from the design page".

## What it does for the user

Paddlemate gets a night look. By default it follows the phone or computer:
dark after sunset if the device is set that way, light otherwise, changing
live when the device changes, with no reload and no white flash on start-up.
**Settings > Appearance** has three choices - System (the default), Light,
Dark - and the choice is remembered on that device only. The browser bar and
the phone status bar take the colour of the screen under them.

In dark, everything is dark, including the map: soft dark ground, muted
green and water, the same teal as the one accent (a lighter teal, so it still
reads), sections and put-in/take-out markers that keep their meaning
(colour-blind safe hues unchanged where they already read). Water level
chips keep their four looks (outline, green, amber, red) on the night
ground; charts keep their shape and reading rail. Satellite imagery stays
imagery. Printing always prints the light version.

Light mode does not change by a single pixel.

## Measured starting point (branch `ui-overhaul`, `d80b60c`)

| What | Number |
|---|---|
| `tokens.` references in `frontend/src` | 1022 in 168 files |
| of which colour tokens, outside `theme.ts` and tests | 516 in 135 files (the rest are `touch`, `radii`, `elevation`, `phone`, `motion`, `chrome`, `canvas`) |
| Colour tokens in the object | 67 entries, plus 4 level groups, 14 feature colours, 6 region colours; 70 colour literals in `theme.ts` |
| MUI palette strings in `sx` (`"text.secondary"`, `"background.paper"` ...) | 115, and they follow the palette for free |
| Hex-alpha through `alphas.<step>` | 51 uses, 34 files (steps: wash 16, hairline 12, hover 8, tint 6, strong 5, border 2, scrim 1) |
| Hex-alpha written by hand (`${tokens.x}55`, `${teal}40`, `${pin.color}55`) | 7 sites (`LevelDots`, `Map.tsx` x2, `AreaControls`, `CommentThread` x3, `theme.ts` e3); `ui-overhaul.md` says 38, the real number is 58 sites in 37 files |
| `alpha()` from MUI | 0 |
| `color-mix` | 1 (`UnderlineTabs`, works with `var()` as it is) |
| Colour literals outside `theme.ts` | `index.css` 9 literals (map popup, attribution), `ChipRow` and `WaterwayBrowsePanel` `#000` (a mask, not a colour), 2 test files |
| `tokens.white` | 16 (8 outside `theme.ts`: 6 map files, `NumberBadge`, `TripStays`); `"white"` in `mapIcons.ts` SVG |
| MapLibre paint colours | 112 lines in 9 files (`SectionLayers` 26, `FeatureGeoJSONLayers` 28, `RegionLayers` 14, `DraftLayers` 10, `CountryBorderLayer` 8, `calmStyle` 8, `Map` 6, `RangeRingLayers` 6, `GaugeCatalogMap` 6) plus the marker SVG string in `mapIcons.ts` |
| SVG colour attributes in React | 41 in 5 files (`SeriesChart` 14, `FeatureStrip` 12, `RailOverlay` 8, `DonutCluster` 6, `MapCompass` 1) |
| Runtime colours read from tokens at module level | `waterLevel.ts` (`levelConfig`, `levelInk`, `levelMarkerColor`), `comments.ts`, `tripRange.ts` (region palette), `LocationPin.tsx` (`PUT_IN_COLOR`) |
| Base map | OpenFreeMap Liberty restyled in one place, `calmStyle.ts` (100 lines, one function); satellite is Esri raster imagery |
| Public assets | `favicon.svg`/`logo.svg` (identical, #1e2022 glyph with #8bd1e8 and #c2cf47; no use in `src`, `favicon.svg` linked from `index.html`), `icons.svg`, `icons/put-in.svg`, `icons/take-out.svg`, `hero.png`, `vite.svg` (all unused in `src`); 5 PWA PNGs |
| PWA / browser chrome | `index.html` `theme-color` `#0c0e10`, manifest `theme_color` and `background_color` `#0c0e10` (both already dark, with a light app) |
| Print rules | none (no `@media print` anywhere) |
| Existing dark code | none: no `prefers-color-scheme`, no `colorScheme`, no mode state. `languagePreference.ts` is the model for a per-device setting |
| Libraries | MUI 9.0.1 (no MUI X), Recharts 3.8, MapLibre 5.24, react-map-gl 8.1; Biome 2.4.15 |
| Contrast test today | `lib/contrast.test.ts` checks light pairs by parsing hex from `theme.tokens` |
| Specs that take screenshots | `theme.spec.ts` (screens for review), `swipe/neighbour.spec.ts`; Playwright's default colour scheme is light, so they stay light |

Design source. The design system "Paddlemate Calm" artifact (read with the
Artifact tool) has **no dark theme**: `project/tokens.json` lists one theme
(`light`) with 80 colour tokens. The dark values live only on the design
page `doc/plans/ui-overhaul/calm-design.html` (lines 11-12, 42, 1208-1265):
ground `#141b1f`, card `#1b2429`, tint `#212c32`, line `#2a353c`, ink
`#e8eef0`, ink 2 `#9aa8ae`, accent `#67c7e0` on `#062530`, levels empty
`#a2aeb3`, low `#86d2b2`, medium `#f0c06c`, high fill `#f08c8a` with `#1b2429`
text, shadows `0 1px 2px #0006`, `0 10px 28px #0009`, `0 4px 14px #0008`.
Two things there disagree and are settled here: the page declares the accent
twice (`#67c7e0` in the media query and on the dark phones, `#79b9e0` under
`[data-theme=dark]`; this plan uses `#67c7e0`, 8.1:1 on the card), and its
medium level text is `#8f5b00` while the app ships `#855400` (the app wins,
light is untouched). The page has no dark map, no dark chart colours and no
feature-colour values; the palette below derives them. The lead adds a `dark`
theme to the design system's `tokens.json` from the palette below in the
merge wave (decision: the design system is the reference, so it must hold
what ships).

## Interfaces (fixed here, agents code against them)

### Tokens in two forms

`lib/theme.ts` keeps `tokens` as the one source and splits it:

```ts
export const lightTokens = { ...as today, colours literal };
export const darkTokens: typeof lightTokens;      // same keys, same shape
export const tokens: typeof lightTokens;          // colour leaves are CSS var strings
export type Scheme = "light" | "dark";
```

- `tokens.surface` is the string `var(--pm-surface)` after the flip, nested
  names kebab-joined: `tokens.levels.low.text` is `var(--pm-level-low-text)`,
  `tokens.mapRegionPalette[2]` is `var(--pm-map-region-3)`,
  `tokens.featureColors.put_in` is `var(--pm-feature-put-in)`. Non-colour
  groups (`touch`, `radii`, `motion`, `phone`, `canvas`, `chrome`) are the
  same numbers as today and the same object identity.
- `elevation` is colour-bearing (shadows) and becomes variables too
  (`--pm-e1`, `--pm-e2`, `--pm-e3`, `--pm-marker`, `--pm-marker-raised`); the
  value types stay `string`, so `boxShadow: tokens.elevation.e2` compiles
  unchanged.
- The variables are emitted by one `GlobalStyles` block built from
  `lightTokens` and `darkTokens`: `:root { --pm-... }` and
  `:root[data-theme="dark"] { --pm-... }`. Both are generated from the two
  objects; there is no hand-written CSS variable.
- Rule that makes the flip safe: **a `var()` string works wherever the
  browser parses CSS (`sx`, `style`, `styled`, `boxShadow`, CSS gradients,
  `color-mix`), and nowhere else.** MapLibre paint, a canvas, an SVG string
  turned into an image, and anything that does maths on the hex need real
  values.

```ts
// lib/useTokens.ts
export function useTokens(): typeof lightTokens;   // resolved hex for the active scheme
export function tokensFor(scheme: Scheme): typeof lightTokens;  // non-hook form (calmStyle, tests)
```

`useTokens()` returns the module-level `lightTokens` or `darkTokens` object
(stable identity, so it is a safe dependency) following the active scheme. It
re-renders its component when the scheme changes. Every place that paints
outside CSS uses it: the 112 MapLibre lines, `mapIcons.ts`, `calmStyle.ts`
(through `tokensFor`), the 41 SVG attributes, `levelInk`/`levelMarkerColor`,
`pin.color` data. (Whether React SVG presentation attributes accept `var()` is
probed in P1a; the plan assumes **no** and uses `useTokens()` for them, which is
correct either way.)

AGENTS.md "Theme and styling" ("static `import { tokens }`, not `useTheme()`")
stays true for CSS contexts and gains one line: JS-painted contexts use
`useTokens()`.

### The alpha helper

```ts
// lib/alpha.ts
export type AlphaStep = keyof typeof alphas;      // tint wash hover strong hairline border scrim
export function withAlpha(color: string, amount: AlphaStep | number): string;
```

Returns `color-mix(in srgb, <color> <p>%, transparent)` with `p` the step's
byte over 255 as a percentage to two decimals (`wash` 7.84, `hover` 12.16,
`tint` 5.10, `strong` 18.04, `hairline` 33.33, `border` 60, `scrim` 80); a
`number` is a percentage `0-100` for the seven one-off sites (`80` -> 50.2
as `50.2`, `55` -> 33.33, `99` -> 60, `29` -> 16.08, `40` -> 25.1). It works
on a hex, an `rgb()` and a `var(--pm-x)`; it is **not** for MapLibre or
SVG-attribute contexts (they set `fill-opacity` or `opacity` instead, which
none of the 58 sites currently needs: every one is `sx`/`style`/`boxShadow`).
`alphas` stays exported as the step table. The suffix form `${token}${step}`
is deleted everywhere; `check:colours` forbids it.

### The switch

MUI 9.0.1 has the unified API (checked in `node_modules/@mui/material`
types): `createTheme({ cssVariables, colorSchemes })`, `ThemeProvider` with
`defaultMode`, `modeStorageKey`, `noSsr`, `disableTransitionOnChange`, and
`useColorScheme()`.

```ts
createTheme({
  cssVariables: { colorSchemeSelector: '[data-theme="%s"]', cssVarPrefix: "mui" },
  colorSchemes: { light: { palette: lightPalette }, dark: { palette: darkPalette } },
  ...rest as today,
});
<ThemeProvider theme={theme} defaultMode="system"
  modeStorageKey="paddlemate-color-mode" noSsr disableTransitionOnChange>
```

- The MUI palette (`text.*`, `background.*`, `divider`, `action.*`,
  `primary/error/success/warning`) is built twice from `lightTokens` and
  `darkTokens`; MUI emits its own `--mui-palette-*` variables per scheme and
  sets `color-scheme` (native scrollbars, form controls, date inputs) itself.
  `palette.mode: "light"` in the current theme goes away.
- `lib/colorMode.ts` is the setting: `useColorMode(): ["system" | "light" |
  "dark", (m) => void]`, a thin wrapper over `useColorScheme()`. MUI stores
  the mode under `paddlemate-color-mode` in `localStorage`; no second store.
  `storageManager` failure (private window) leaves System, no crash.
- `index.html` gets a small inline script before the bundle (not React): read
  `paddlemate-color-mode`, resolve `system` with `matchMedia`, set
  `<html data-theme>`, set `<meta name="theme-color">`. It is the only thing
  that runs before first paint; it keeps the cold start free of a white flash.
  A comment in the file says it mirrors `colorMode.ts`; a unit test
  (`colorMode.test.ts`) evaluates the same function from a shared string.
- `useColorMode` effect keeps `meta[name=theme-color]` equal to
  `tokensFor(scheme).surface` (white / `#1b2429`) and listens to
  `prefers-color-scheme` changes only while the mode is System (MUI does the
  listening; the meta update hangs off its `colorScheme`).
- Manifest `theme_color` and `background_color` stay `#0c0e10` (a manifest
  holds one value; it is the splash colour and is dark in both schemes today).
  Known limitation, listed in the Cuts section.
- `@media print` in `index.css`: re-declare the light variables on `:root`
  and `color-scheme: light`, so printing a river page from dark mode prints
  dark ink on white. (Print has no rules today; this is the first.)
- Settings: group `appearance` in `settings/groups.ts` ("Appearance", hint
  "Light, dark or follow the device"), `AppearanceSection.tsx` with
  `FormSection` and a three-option segmented control (`UnderlineTabs` is for
  views; use the existing segmented pattern from `design.md`), case in
  `SettingsDetail`.

### `check:colours`

`frontend/scripts/check-colours.sh` (`set -e`, run as `npm run check:colours`,
added to the frontend gate in AGENTS.md). It fails, with the file and line, on:

1. a hex or `rgb()/rgba()/hsl()` literal in `src/**/*.{ts,tsx,css}` outside
   `lib/theme.ts` and `*.test.ts`, except the two `#000` masks (marked
   `/* mask */` on the line);
2. the hex-alpha suffix form: `}[0-9a-f]{2}[`"]` after a `${...}`, or
   `alphas.` used anywhere but `lib/alpha.ts`;
3. `tokens.<colour>` (anything but `touch|radii|elevation|motion|phone|chrome|canvas`)
   in the **paint files**: the 9 MapLibre files, `mapIcons.ts`,
   `calmStyle.ts`, `SeriesChart`, `RailOverlay`, `FeatureStrip`,
   `DonutCluster`, `MapCompass`, `waterLevel.ts` (list in
   `scripts/paint-files.txt`; a new paint file is added to the list);
4. `"white"`, `"black"`, `#fff`, `#000` as a colour name in `src`
   (`tokens.white` is allowed only where the plan keeps it, see below).

A grep, not a Biome rule: Biome 2.4 can do it with a GritQL plugin, but the
plugin would be a new tool to maintain for four patterns. Each rule has a
unit test in `scripts/check-colours.test.ts` (bun) that feeds it a bad file.

### `white`

`tokens.white` stays, the same `#ffffff` in both schemes (not a surface: it is
the ring around a marker on the map and the text on a solid hue). The 16 uses
are settled, not left to the agents:

| Use | Becomes |
|---|---|
| `error.contrastText`, `levels.high.text` | new token `onError`: `#ffffff` light, `#1b2429` dark |
| marker ring on the map (`Map`, `GaugeMarkers` x2, `NoteMarkers`, `RangeRingLayers`, `mapIcons` x2, `FeatureGeoJSONLayers`) | `white`, unchanged: a white ring reads on the dark map (15.75:1 against the dark ground) |
| `NumberBadge`, `TripStays` text on a solid fill | `onPrimary` |
| `theme.ts` `warning.contrastText`, `error.contrastText` | `onError` / `#1b2429` per scheme |

## The dark palette

Every key in `darkTokens`, with its ratio against the ground it is read on.
AA means 4.5:1 for text and 3:1 for icons, control borders and map geometry.
Light ratios are in `contrast.test.ts` today and stay.

| Token | Light | Dark | Dark ratio, on |
|---|---|---|---|
| `background` / `surfaceLow` | `#eef2f3` | `#141b1f` | - |
| `surface` / `surfaceLowest` | `#ffffff` | `#1b2429` | - |
| `surfaceHigh` | `#f6f8f9` | `#212c32` | - |
| `surfaceHighest` | `#e7edef` | `#2a353c` | - |
| `surfaceBright` | `#ffffff` | `#243038` | - |
| `onSurface` | `#1f2b31` | `#e8eef0` | 13.5 on surface, 14.9 on ground |
| `onSurfaceVariant` | `#58666d` | `#9aa8ae` | 6.5 on surface, 5.8 on surfaceHigh |
| `primary` | `#0e7490` | `#67c7e0` | 8.1 on surface, 9.0 on ground |
| `onPrimary` | `#ffffff` | `#062530` | 8.2 on primary |
| `primaryDark` (pressed) | `#0b5d74` | `#4db4cf` | 6.6 on surface |
| `primaryContainer` | `#e0f2f6` | `#12343f` | - |
| `onPrimaryContainer` | `#0b5d74` | `#9fdcee` | 8.8 on container |
| `success` | `#1d6b4f` | `#86d2b2` | 8.9 on surface |
| `successContainer` / `onSuccessContainer` | `#d9eee5` / `#154f3a` | `#173a2d` / `#b9e8d2` | 9.3 |
| `onSuccess` | `#ffffff` | `#062018` | 9.7 on success |
| `error` | `#b4373f` | `#f08c8a` | 6.6 on surface |
| `errorDark` | `#8e2b32` | `#f4a4a2` | 8.0 on surface |
| `errorContainer` | `#f7dcde` | `#4a2326` | 5.7 for `error` text on it |
| `onError` (new) | `#ffffff` | `#1b2429` | 6.6 on error |
| `outline` | `#7c8a90` | `#7f8d93` | 4.6 on surface, 4.2 on surfaceHigh (3:1 control border) |
| `outlineVariant` | `#dde4e7` | `#2a353c` | 1.3, a rule only (as 1.3 today) |
| `white` | `#ffffff` | `#ffffff` | unchanged |
| `levels.empty` text / border | `#5b676e` / `rgba(91,103,110,.45)` | `#a2aeb3` / `rgba(162,174,179,.45)` | 6.9 |
| `levels.low` text / wash | `#1d6b4f` / `rgba(29,107,79,.13)` | `#86d2b2` / `rgba(134,210,178,.16)` | 6.2 on the wash over surface, 5.6 over surfaceHigh |
| `levels.medium` text / wash | `#855400` / `rgba(133,84,0,.15)` | `#f0c06c` / `rgba(240,192,108,.16)` | 6.5, 5.9 |
| `levels.high` text / fill | `#ffffff` / `#b4373f` | `#1b2429` / `#f08c8a` | 6.6 |
| `levels.*.marker` | `#89969d #2f9e63 #d57f00 #e5483f` | unchanged | 5.2 / 4.6 / 5.2 / 4.0 on the dark map ground |
| `featureColors` (Okabe-Ito) | as today | unchanged except `put_in` and `bridge`, `putIn` | rapid 4.6, orange 4.1, whitewater 5.1, waterfall 5.2, freestyle 5.2, amber 5.2, all on the dark map ground |
| `featureColors.put_in`, `putIn` | `#0072B2` | `#3b9be0` | 5.2 (the light blue is 3.0, too close) |
| `featureColors.bridge` | `#58666d` | `#8a979d` | 5.2 |
| `mapRegionPalette` | blue, orange, ... | blue -> `#3b9be0`, rest unchanged | 4.1 or better |
| `mapGround` | `#f3f2ec` | `#1c2429` | - |
| `mapGreen` | `#e3ebd6` | `#1f2e29` | - |
| `mapWater` | `#d3e5f0` | `#12303f` | - |
| `mapRiver` | `#b5d5ec` | `#2f6384` | water to ground stays a hue step, as in light |
| `mapRoad` | `#dcd8cb` | `#34424a` | 1.5, a thin hint line as in light |
| `mapSectionLine` | `#2b88c8` | `#5fb0e6` | 6.6 |
| `mapSectionLineCasing` | `#ffffff` | `#10171b` | the line's edge |
| `mapSelectedLine`, `mapSectionHighlight`, `mapAreaCircle` | `#0e7490` | `#67c7e0` | 8.1 |
| `mapSectionGhost` | `#c4d3dc` | `#46565f` | 2.1, decorative and not clickable (as the light ghost) |
| `mapLabelText` / `mapLabelHalo` | `#1f2b31` / `#ffffff` | `#c9d4d8` / `#141b1f` | 10.4 on ground |
| `mapCountryBorder` / casing | `#3a454b` / `#ffffff` | `#aab6bb` / `#141b1f` | 7.6 |
| `gaugeTracked` / `gaugeUntracked` | `#236d98` / `#9aa5aa` | `#5aaee0` / `#6b7a81` | 6.4 / 3.5 |
| `chartSeries` | `#0e7490` | `#67c7e0` | 8.1 |
| `chartGrid` | `rgba(31,43,49,.08)` | `rgba(232,238,240,.10)` | a rule |
| `elevation.e1` / `e2` / `e3` | ink shadows, teal glow | `0 1px 2px rgba(0,0,0,.4), 0 1px 1px rgba(0,0,0,.2)` / `0 10px 28px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.35)` / `0 4px 14px rgba(103,199,224,.25)` | - |
| `elevation.marker`, `markerRaised` | black halos | unchanged | - |

All ratios were computed with the WCAG 2 relative-luminance formula (script in
the review notes); `contrast.test.ts` re-computes every row above in both
schemes and fails below the stated bound, so the table cannot drift. Hovers
and washes are `withAlpha(primary, step)` and so follow the accent
automatically (`#67c7e0` at 8% over `#1b2429`).

Depth in dark: shadows alone do not lift a card on a dark ground, so the
floating step (`e2`: popovers, menus, the floating desktop cards) is read from
the surface steps: a floating card is `surface`, a popover or menu is
`surfaceBright`. That is one rule applied in `theme.ts` (`MuiPopover`,
`MuiMenu`, `MuiDialog` paper), not per screen.

## The map in dark

`calmStyle.ts` recolours every Liberty layer from `tokens`, so dark needs **no
second style**: `applyCalmStyle(map, tokens)` takes the resolved tokens and
runs again on a scheme change. Same layer rules (hidden layers, road zoom
ranges, label rules); only the colour values change (the `map*` rows above).
Concretely:

- `useCalmBaseMap` gets the scheme in its dependency list and in the
  `styleKey`, so a switch re-applies on the loaded style without a reload.
  `useMutedBaseMap` stores and restores `line-opacity`, no colours, and is
  unchanged.
- App layers (`SectionLayers`, `FeatureGeoJSONLayers`, `RegionLayers`,
  `DraftLayers`, `RangeRingLayers`, `CountryBorderLayer`, `Map`) read
  `useTokens()` and pass hex to `paint`; react-map-gl updates the paint
  properties in place.
- Marker icons (`mapIcons.ts`) are SVG strings rasterised once per level. They
  are registered per scheme (`put-in-icon-<level>-<scheme>`; the layer's
  `icon-image` expression includes the scheme) or re-added on a scheme change;
  the agent picks the smaller change and says which.
- Popups, the zoom and compass controls, attribution: the 9 colour literals in
  `index.css` and the `.maplibregl-ctrl-group` block in `theme.ts` become
  `var(--pm-*)` (the attribution background is `withAlpha`-equivalent
  `color-mix` in CSS), so they follow the scheme with no JS.
- Satellite stays Esri imagery in both schemes. Its toggle button, labels and
  halo use the scheme (labels over imagery already use a halo).
- `GaugeCatalogMap` loads `LIBERTY_STYLE` without `applyCalmStyle` today; it
  gets the same hook so it is not a light island in dark.

Readability criterion for the map: each geometry colour in the table meets 3:1
against `mapGround` (section line 6.6, selected 8.1, markers 4.0 to 5.2, country
border 7.6), labels 10.4:1, and a section highlighted over the ghost stays
distinguishable by lightness (8.1 against 2.1).

## The chart in dark

`SeriesChart`, `RailOverlay`, `ReadingChart` read `useTokens()` for every SVG
attribute (14 + 8). The level bands (low/medium text colours at low opacity)
use the dark `levels` text, which reads on the chart's `surface`; the area
gradient stops are `primary` at the same opacities; ticks are `outline`
(4.6:1); the tooltip is `surface` with an `outlineVariant` border. Grid is
`chartGrid`. The chart's reading rail and dots use `surface` as their ring, so
they punch out of the line in both schemes. `levelInk(level)` returns the
scheme's text colour for SVG text; `levelConfig` (CSS) returns vars.

## Images and the logo

| File | Treatment |
|---|---|
| `favicon.svg` | P1a opens it in a dark tab at 16/32 px; if the #1e2022 glyph lacks an opaque ground it gets a `@media (prefers-color-scheme: dark)` block inside the SVG (the favicon follows the device, not the app setting, and cannot do better) |
| PWA PNGs, apple-touch icon, maskable icon | unchanged (full-bleed art) |
| `logo.svg`, `icons.svg`, `icons/put-in.svg`, `icons/take-out.svg`, `hero.png`, `vite.svg` | not referenced in `src`; left alone, listed in the cuts so nobody expects them to change |
| Feature type icons (`FeatureTypeIcon`, `TripIcons`) | `currentColor` / tokens; follow automatically (`FeatureStrip` 12 attributes are in P1c's scope) |
| User photos | shown as uploaded; no filter |

## Order of work

```
Phase 0  lead (about 1 hour, no agent)
Phase 1  P1a  P1b  P1c  P1d      four agents in parallel, disjoint files
Merge 1  lead: gate, then the flip (one line), then "light identical"
Phase 2  D1 D2 D3 D4 D5 D6       six agents in parallel, disjoint folders
Merge 2  lead: gate, design system, docs, README
Phase 3  review (Opus), then fixes by one agent per finding group
```

Why this order. The risk of dark mode is not the palette, it is the 1022
`tokens.` references changing meaning. So the meaning changes **once**, in a
step the lead performs after every place that cannot take a `var()` has moved
to `useTokens()`, and light mode is proven unchanged before any dark work
starts. Phase 2 is then visual: with the flip in, dark works everywhere that is
CSS, and each agent fixes what looks wrong in its own folder.

### Phase 0 (lead)

Before any agent starts, on `ui-overhaul`:

1. `lib/alpha.ts` (full implementation, `withAlpha`, with `alpha.test.ts`):
   works on hex today, so P1b can use it before the flip.
2. `lib/useTokens.ts` stub: returns `tokens` as they are (light hex), the
   final signature. P1c and P1d code against it and compile.
3. `e2e/support/dark.ts`: `useScheme(page, "light" | "dark" | "system")`
   (sets `localStorage` `paddlemate-color-mode` before load and
   `page.emulateMedia({ colorScheme })`), `noLightSurface(page)` (walks
   visible elements; fails on a `background-color` with alpha above 0.5 and
   luminance above 0.5, except `img`, `canvas`, `[data-imagery]`),
   `contrastReport(page)` (every visible text node and every control border
   against its effective background, per WCAG), and `SCREENS` (the named screen
   list below).
4. **Light baseline**: on the unchanged branch, a spec `e2e/dark/baseline.spec.ts`
   writes a screenshot of each of the 14 named screens at phone, small and
   desktop into `e2e/dark/__baseline__/` (git-ignored; the folder is deleted
   with the plan). Playwright is run for this only when the user has asked for
   Playwright runs (memory: Playwright on request); the lead asks once at the
   start of phase 0.
5. The 14 screens (all of them exist in the fixture): start map `/`, river
   detail on the Test River with the chart, section detail (features tab),
   section detail (sources tab), gauge panel, descent log list, descent form,
   trips list, trip detail, proposals list, proposal detail, search results,
   settings (language group), notifications.

### Phase 1: infrastructure (4 agents, parallel, about 30 min and 200k each)

| Agent | Owns (files) | Does | Spec |
|---|---|---|---|
| **P1a Foundation** | `lib/theme.ts`, `lib/colorMode.ts`, `lib/colorMode.test.ts`, `lib/contrast.test.ts`, `main.tsx`, `index.html`, `index.css`, `public/favicon.svg`, `e2e/theme/theme.spec.ts` (additions only) | Splits tokens into `lightTokens`/`darkTokens` with the palette above; `toVars`, the `GlobalStyles` block, `onError`; `createTheme` with `colorSchemes` and the data selector; `ThemeProvider` props; inline script and meta; `index.css` to variables plus the print block; MUI overrides in `theme.ts` (popover/menu/dialog paper, scrollbar, maplibre control group) onto tokens; the probe of SVG attributes with `var()`. **Leaves `export const tokens = lightTokens`** (the lead flips it) and `useTokens` untouched. `contrast.test.ts` checks both schemes. | `theme.spec.ts`: in dark the ground computes `#141b1f`, the accent `#67c7e0`, the meta theme-color follows, `color-scheme` is `dark`, no reload on switch |
| **P1b Alpha sweep** | the 37 files with hex-alpha (51 `alphas.` uses, 7 hand-written), `scripts/check-colours.sh`, `scripts/check-colours.test.ts`, `scripts/paint-files.txt`, `package.json` script | Codemod to `withAlpha(...)`; the 7 hand-written sites by hand; the guard script rules 1-4 | the bun test for each rule, each checked by removing the rule |
| **P1c Map paint** | `components/map/**` paint code (`calmStyle.ts`, `mapIcons.ts`, `SectionLayers`, `FeatureGeoJSONLayers`, `RegionLayers`, `DraftLayers`, `RangeRingLayers`, `CountryBorderLayer`, `Map.tsx`, `MapCompass`, `LocationPin`, `useMapSources`), `components/gauge-catalog/**` | MapLibre paint and marker SVG strings onto `useTokens()` / `tokensFor`; `applyCalmStyle(map, tokens)`; scheme in `styleKey`; `GaugeCatalogMap` gets the calm hook; `white` rows from the table | `bun test` for `applyCalmStyle` with a fake map recording `setPaintProperty` per scheme (every `map*` token reaches a paint property); light screens unchanged |
| **P1d SVG and runtime colours** | `components/charts/**`, `components/waterway/section-details/FeatureStrip.tsx`, `components/trips/TripIcons.tsx`, `lib/waterLevel.ts`, `lib/comments.ts`, `lib/tripRange.ts` and their tests | The 41 SVG attributes and the module-level colour reads onto `useTokens()`; `levelInk`, `levelMarkerColor` take the scheme (or return from `useTokens`) | `bun test` updated for `waterLevel`, `comments`, `tripRange` in both schemes |

P1a, P1b, P1c, P1d never edit the same file: `theme.ts`, `main.tsx`, `index.*` are
P1a's alone; `alphas`-using files in the map and chart folders belong to P1b
for the alpha lines only. That is the one overlap: P1b's edits there are the
7-and-51 alpha lines, P1c and P1d edit paint lines. To keep it a non-overlap,
**P1b runs first on those folders** (15 minutes, merged before P1c and P1d are
merged), and P1c and P1d rebase on it; the alpha uses in `components/map`
(1) and `components/charts` (3) are the whole intersection.

#### Merge 1 (lead)

1. Merge in the order P1b, P1a, P1c, P1d. Gate: `npx tsc -b --force`,
   `npx biome check src e2e`, `bun test`, `npm run check:colours` (exit codes,
   not piped).
2. The flip: in `theme.ts`, `export const tokens = toVars(lightTokens)`. One
   line. `check:colours` rule 3 passes only if the paint files are clean, which
   is what proves P1c and P1d finished.
3. "Light identical": run the baseline spec's comparison on the 14 screens at
   three sizes (see Acceptance). Anything over the bound is a P1 bug, fixed
   before phase 2.
4. Tag the commit `dark-infra`; phase 2 branches from it.

### Phase 2: dark sweep (6 agents, parallel, by folder)

With the flip in, dark already works for every CSS use. Each agent opens its
screens in dark at Pixel 7, 320 wide and 1280 wide, runs `noLightSurface` and
`contrastReport`, and fixes what fails: a hard-coded light assumption (a
`surfaceLowest` used as "white"), a `text.disabled` that does not clear 4.5:1
because it is `outline` (4.6:1 on surface, 4.2 on surfaceHigh: acceptable for
disabled, not for hints), shadows that disappear, a scrim that is too light, a
third-party inline colour. Fixes are in the screen's own `sx`, never an
exception inside the token layer (AGENTS.md: a third exception means redesign).

| Agent | Owns | Colour refs | Size |
|---|---|---|---|
| **D1 Map** | `components/map/**` (non-paint: markers, controls, popups, `LabelModeToggle`, `NoteMarkers`, `GaugeMarkers`, `PickModeButtons`, `Region*`), `components/map-page/**`, `components/logs-page/**`, `routes/index.tsx`, `routes/logs*` | about 120 | 45 min / 200k; the map screens are the hardest to judge, so no other folder is added |
| **D2 Charts and levels** | `components/charts/**`, `components/LevelDots.tsx`, `components/WaterLevelChip.tsx`, `components/waterway/section-details/**` (except `FeatureStrip` if P1d moved it), gauge panel | about 100 | 30 min / 160k |
| **D3 Waterway** | `components/waterway/**` (except `section-details`), `routes/waterways/**` | about 50 | 30 min / 150k |
| **D4 Trips** | `components/trip-page/**`, `components/trips/**`, `routes/trips/**`, `routes/invite/**` | about 55 | 30 min / 150k |
| **D5 Content screens** | `components/search/**`, `components/proposals/**`, `components/descents/**`, `components/provenance/**`, `components/notifications/**`, `routes/proposals/**`, `routes/admin/**`, `routes/logs/**` | about 55 | 35 min / 180k |
| **D6 Shell and settings** | `components/canvas/**`, `components/states/**`, `components/dev/**`, `routes/__root.tsx`, `routes/dev/**`, `routes/tools/**`, `routes/auth/**`, `routes/settings.tsx`, `components/settings/**` (new `AppearanceSection.tsx`, `groups.ts`, `SettingsDetail.tsx`), the 21 top-level `components/*.tsx` | about 90 | 40 min / 200k |

Each agent's spec lives in its own file, `e2e/dark/<area>.spec.ts`
(`map`, `charts`, `waterway`, `trips`, `content`, `shell`), on `phone` and
`desktop`, `@small` where a layout can break at 320: the screens above in dark,
`noLightSurface`, `contrastReport` with no violation, no sideways scroll. D6's
`e2e/dark/switch.spec.ts` covers the setting (System follows
`emulateMedia`; Light and Dark override it; a reload keeps the choice;
switching does not reload the page: a `window.__marker` set before the switch
is still there after). Each guard in a spec is checked by removing it.

Shared files, held by the lead during the wave: `README.md` (feature row),
`doc/design.md` (dark section), `AGENTS.md` (the `useTokens` and
`check:colours` lines), the design system artifact (dark theme in
`tokens.json`), `lib/theme.ts`, `lib/useTokens.ts`, `lib/alpha.ts`,
`lib/colorMode.ts`, `index.css`, `index.html`. An agent that needs a token
changed reports it; it does not edit the file.

Hand back at 200k tokens or 45 minutes (AGENTS.md "Hand back early").

### Phase 3: review

One Opus reviewer after merge 2 (AGENTS.md roles): starts the stack with the
`dev-services` skill, drives the Acceptance statements below, walks the
Security and hardening table (what is new: a `localStorage` key, an inline
script in `index.html`, no new route, table or outbound call; the inline script
reads one `localStorage` value and writes one attribute: no
`innerHTML`, no URL), and reads the combined diff. It reports; fixes go to one
agent per finding group.

## Risks

| Risk | Where | Handling |
|---|---|---|
| A `var()` reaches a place that cannot parse it: MapLibre prints "could not parse color" and draws nothing | 112 paint lines, `mapIcons.ts`, `pin.color` | rule 3 of `check:colours` plus the paint-file list; the flip is gated on it; P1c's fake-map test |
| SVG presentation attributes and `var()` | 41 sites in 5 files | assumed unsupported; `useTokens()`; P1a probes and records the result so the plan's assumption is a fact |
| Hex-alpha on a runtime value | `${pin.color}55` in `Map.tsx` (colour is data), `LevelDots` | `withAlpha` takes any CSS colour; a marker pin colour is already a feature colour, so it is a `var()` or hex either way |
| MapLibre has no CSS: popup, controls, attribution | `index.css`, `theme.ts` control group | CSS with variables, so they switch without JS; verified by D1's spec in both schemes |
| Style swap loses the recolour | satellite -> vector, scheme switch while a style loads | the existing `style.load` listener plus the scheme in `styleKey`; spec: toggle satellite twice, then switch scheme |
| First paint flashes white | cold start with dark preference | inline script in `index.html`; spec: block the bundle, assert `data-theme` and background are already dark |
| MUI components with inline colours | `Autocomplete`, `Select` menus, `Tooltip`, `Snackbar`, `Switch`, `Checkbox`, `Skeleton` | the palette is dark, so they follow; D6's spec opens each once in dark; `Skeleton` and `Tooltip` get their grounds from `MuiSkeleton`/`MuiTooltip` overrides in `theme.ts` (P1a) |
| `react-markdown` content | `MarkdownRender` (2 `theme.palette` uses) | variables via the palette; D3 checks a comment with a link, code and a quote |
| Recharts internals (tooltip cursor, active dot, default stroke) | `SeriesChart` | every prop already explicit; D2 reads the DOM for any remaining default `#ccc`/`#666` and sets it |
| Third-party CSS ordering | `maplibre-gl.css` imported after the theme | the existing comment in `index.css` stays; `.maplibregl-*` rules remain in `index.css`, on variables |
| Print | none today | the print block (light variables); a spec with `page.emulateMedia({ media: "print" })` in dark asserts the ground computes white |
| Screenshot specs | `theme.spec.ts`, `swipe/neighbour.spec.ts` | Playwright's default scheme is light and the specs do not set storage, so they stay light; P1a sets `colorScheme: "light"` explicitly in `playwright.config.ts` so a dark-mode CI machine cannot change them |
| 38-site claim in `ui-overhaul.md` | doc | corrected to 58 in the same change as the README row |
| Contrast regressions by later code | all | `contrastReport` runs in each dark spec; `contrast.test.ts` runs in the gate |
| A test or tool that parses `theme.tokens` as hex | `contrast.test.ts` (and any e2e that reads `theme.tokens`) | those use `lightTokens`/`darkTokens`; found by `tsc` after the flip because `tokens` leaves keep type `string` - so the lead also greps `e2e` and `*.test.ts` for `tokens.` once |
| Agents overlap on `components/map/**` | P1c then D1 | sequential by phase; D1 is the only phase-2 agent in that folder |

## Acceptance

Statements the reviewer checks by running the app (or the stated test).
"Dark" means `paddlemate-color-mode=dark`; "N screens" are the 14 in Phase 0.

1. **Light unchanged after phase 1**: on the 14 named screens at Pixel 7, 320
   and 1280 wide (42 screenshots), the flipped branch differs from the phase-0
   baseline in 0 pixels beyond a per-channel difference of 1/255 (Playwright
   `maxDiffPixels: 0`, `threshold: 0.01`; the 1/255 allowance is the byte
   rounding of the alpha percentages), and `getComputedStyle` of
   `body`, the app bar, the first list row and the primary button match.
2. **No light surface left**: in dark, `noLightSurface` reports 0 elements on
   each of the 14 screens at the three sizes, and on the dialogs and menus
   each screen opens (the wizard, the confirm dialog, the row menu, the period
   menu, the language picker).
3. **Contrast**: in dark and in light, `contrastReport` reports 0 text
   violations below 4.5:1 (3:1 at 24px or larger and for bold 18.66px) and 0
   control borders, icons or focus rings below 3:1, on the same screens; the
   water level chips measure at least 6.0:1 in dark. `contrast.test.ts` holds
   every palette row of this plan.
4. **Map readable**: in dark at 1280 and Pixel 7, on the start map, a river
   and a section selected, the computed colour of the map canvas background,
   the section line, the selected line, the label text and a feature marker
   (read from the style through `map.getPaintProperty`) equal the palette
   values; each geometry colour clears 3:1 against `mapGround`; no
   `Could not parse color` or `Missing image` message in the console during the
   session.
5. **Chart readable**: in dark, the section chart's line, ticks, tooltip and
   rail text measure 3:1 or better (ticks 4.5:1) against the chart ground;
   the three level bands are distinguishable by their text colours.
6. **Switch**: System follows `emulateMedia({ colorScheme })` live; Light and
   Dark override it; the choice survives a reload; the page object is not
   reloaded when switching (a window marker survives); the map recolours in
   under 1 second after a switch with satellite on and off; the second device
   (a fresh browser context) starts at System.
7. **No flash**: with the bundle request delayed 2 seconds, the document
   background is already `#141b1f` in dark before the first React render.
8. **Browser chrome**: `meta[name=theme-color]` is `#ffffff` in light and
   `#1b2429` in dark, updated on a switch; `getComputedStyle(documentElement)
   .colorScheme` is `dark` in dark.
9. **No literal colours outside the theme**: `npm run check:colours` exits 0;
   the script's own test shows each of its 4 rules failing when the offending
   line is added (rule removal checked in the same test).
10. **Print**: with `emulateMedia({ media: "print" })` in dark the body
    background computes to white and the text to `#1f2b31`.
11. **Gates**: `tsc -b --force`, `biome check src e2e`, `bun test`,
    `check:colours` exit 0; `cargo check` untouched (no backend change in this
    plan).
12. **Layout**: 320px wide in dark has no sideways scroll on the 14 screens
    (the same `@small` specs as light, run with the scheme set).

## Cuts and known limitations

Each has a spec line showing the symptom (AGENTS.md "Cuts are visible").

- The PWA manifest `theme_color`/`background_color` stay `#0c0e10`; a manifest
  holds one value. Symptom: the installed app's splash is dark in light mode
  (as today).
- The favicon follows the device colour scheme, not the app setting.
- Satellite imagery is not darkened.
- Unused public assets (`logo.svg`, `icons.svg`, `icons/*.svg`, `hero.png`,
  `vite.svg`) are not recoloured.
- No automatic schedule (sunset); System is the only automatic mode.
- No per-screen override and no account-level (synced) preference: the choice
  is per device, as asked.
- Dark map labels reuse the English/local label fields Liberty has; the
  calm rules (few labels) are unchanged.

## Internals

- **Files created**: `lib/alpha.ts` (+test), `lib/useTokens.ts`,
  `lib/colorMode.ts` (+test), `components/settings/AppearanceSection.tsx`,
  `scripts/check-colours.sh` (+test), `scripts/paint-files.txt`,
  `e2e/support/dark.ts`, `e2e/dark/*.spec.ts`.
- **Files changed centrally (lead and P1a)**: `lib/theme.ts` (tokens split,
  vars, `colorSchemes`, overrides), `main.tsx`, `index.html`, `index.css`,
  `playwright.config.ts` (explicit light default), `package.json`.
- **Variable naming**: `--pm-<kebab path of the token>`; MUI keeps its own
  `--mui-*`. Nothing but `theme.ts` writes a variable.
- **Selector**: `colorSchemeSelector: '[data-theme="%s"]'`, so MUI and the
  token block share `html[data-theme]`; the light block is on `:root` so an
  absent attribute is light.
- **Storage**: one key, `paddlemate-color-mode`, value `system|light|dark`.
  Not sent to the server and not touched by sign-out (a display choice of the
  device, like the language, not account data).
- **Docs to update in the merge wave**: README feature row (Dark mode),
  `doc/design.md` (a "Dark" section: palette table, the `useTokens` rule, the
  depth rule, the print rule), `AGENTS.md` ("Theme and styling": the dark
  sentence replaced; gates gain `npm run check:colours`), `ui-overhaul.md`
  (WP13 done, the 38 corrected), the design system `tokens.json` (a `dark`
  theme with every row above).

## Confidence

About 70% that the plan runs as written. The infrastructure half is well
bounded and measured: 516 colour references mostly follow for free once
`tokens` becomes variables, and the 160 places that cannot (112 paint lines, 41
SVG attributes, the marker SVG string, 6 runtime reads) are enumerated and
fenced by a grep that fails the gate. What would lower it:

- MUI 9's custom `colorSchemeSelector` string and `noSsr` were read in the type
  definitions, not run; if the attribute or the system-mode resolution behave
  differently, P1a's first 30 minutes find out and the fallback is `'data'`
  with `[data-mui-color-scheme]` as the selector (a find-and-replace in the
  token block).
- The "light pixel-identical" bound depends on the alpha rounding; if
  `color-mix` serialises differently from hex alpha in some browser, the
  bound moves to a small ratio and the plan's statement 1 needs the lead's
  call.
- The dark map and the dark chart colours are derived, not designed: the design
  page has neither. Contrast is computed, taste is not; expect one round of
  adjustments after the first look (inside D1 and D2's budgets, not a new
  agent).
- D1 and D6 are sized at the 200k edge. If either hands back, the continuation
  is a fresh agent from the handoff note.
- Playwright is on request: statements 1 to 8 need the user to allow runs for
  the phase-0 baseline, merge 1 and the review.
