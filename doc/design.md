# Design language

The rules that keep every screen looking like the same product. This is the
calm design: light, soft, readable outdoors. The theme (`frontend/src/lib/theme.ts`)
carries the tokens and the component-wide rules.

The token and component reference for the app is the design system artifact
(private): https://claude.ai/artifact/E8VZQSwJmQhnfLGuPrK585. This page holds
the rules; the artifact shows the pieces.

## Character

Calm and warm, never playful and never mechanical. One typeface (Figtree),
sentence case everywhere, rounded corners, soft shadows in three steps, one
teal accent. No capitals for labels, no monospace, no heavy frames; no stamps,
slang, bounce or confetti. Color is used sparingly and always carries meaning.

## Layout

- **Desktop** has a fixed top AppBar (56px) with text navigation; **mobile** has
  no top bar and a fixed bottom navigation (64px, plus the safe area) with Map,
  Logs, Trips and Profile, the current one as a soft pill (`tokens.chrome`).
  Pages never add their own app-level chrome.
- Detail content lives in a panel: a card panel beside the list on desktop, a
  full-screen overlay on mobile. Panels open with one header pattern: back
  arrow, bold title, grey subtitle, action icons at the right, then **underlined
  tabs** when the panel has views. A detail pane rendered beside the list it was
  picked from keeps the title row and drops only the back arrow, because the
  list beside it carries the way back.
- **Tabs swipe.** The content under the tab bar follows the finger one to one
  and settles on the next tab; the underline stretches in step. The first and
  last tab resist and spring back. The screen edge (24px) stays free for the
  system back gesture. A chart that is zoomed, a chip row, a slider and the map
  keep their own horizontal gestures. Wizard steps do not swipe. Tabs keep their
  roles and arrow keys; swiping is never the only way.
- Two panes side by side separate by surface level (the list on the ground, the
  detail on cards), not by a hard border.
- Multi-step forms have no top header. Their chrome is a fixed bottom bar
  (`PanelBottomBar`): Cancel on the first step and Back after it on the left,
  the title with the step as subtitle and a bar of step segments, one round
  primary-action button on the right.
- Fields are filled (the theme's default variant): the label sits inside the
  field at the top, the value beneath it, a 1px inset line that becomes a 2px
  accent ring on focus. Dates and times use `PickerField` (`components/descents/descent-form/`): the app's own format on top of the browser's native picker, not free text.
- One screen, one primary action: a bottom-right FAB on a phone, a full-width
  **docked** button at the foot of the list pane on desktop. Bottom-right of the
  *content*, not the window.
- Empty states are an icon and one line; the primary action is the call to
  action. A finished flow ends the same way.
- Forms are built from labelled blocks (`FormSection`): a heading, one hint line
  saying what the block is for, and an optional action in the heading.
- **Rows** are cards with the soft shadow, not bordered boxes. A selected trip,
  proposal, gauge or settings card gets a 2px teal ring; a selected river row
  (`cardRowSx`) takes a teal wash instead. A row's actions are one overflow menu (`RowMenu`).
- **Filters** are chips under the search field: teal when set, one tap opens a
  sheet with the exact fields. The search screen has the header and tabs like
  every other screen (Name, Area, Region), results lead with Sections.
- **Sheets** have a peek and an open height; a picked region or a pick in
  progress opens as a peek so the map keeps its room.
- **Pinned** elements (the Plan's week strip, a search field) stay under the
  tab bar while the list scrolls beneath them.
- **Desktop is a map with cards.** From 768px (the theme's `md`) the map fills
  the window and the screen floats over it as cards: a list card, the open item
  beside it, the open item in the URL. Logs, Trips, Proposals and the map page
  work this way; Settings is a centred page without a map. See "Map as the
  canvas" below.
- Inline alerts are quiet notes: a tinted ground, severity carried by the icon.
  The filled variant is reserved for the global error snackbar.
- Do not repeat what a filter already says; secondary counts drop out when zero.
- A choice between two states is a small segmented control; a decision that
  commits something (approve, reject) is a labelled button in its own row.

## Screens

| Screen | What defines it |
|---|---|
| Section detail | The chart: from 1280 the reading block at the card's foot and the plot in the rail beside it, below that a card at the top of the pane (reading, period, plot; on a phone the chart with an options button that opens reading and period); tabs Features, Logs, Notes, Sources; the feature strip (each feature as its icon, ranges as bands that fold and name what they hide); History opens over the pane |
| Search | Tabs Name, Area, Region; a Filters sheet (country, grade, Water now); the chosen levels live in the `water` URL param |
| Map region mode | The search panel (a peek sheet on a phone, the card on desktop) with the region field, level chips, and "Part of" naming the parents of a picked region; the regions stay visible on the map |
| Logs | Two panes on desktop; the date is a picker field |
| Trips | Plan, Bases, Members and Logs tabs; the Plan pins a week strip with a dot on days that have runs and opens to a month; bases and candidate bases; admins get Add member and the trip actions |
| Proposals | The diff shows the before struck through next to the after; reviewing opens a dialog |
| Settings | Two panes on desktop; Profile, Inbox and Tools on a phone; an access token is shown once, when made |

Components for each live in the matching folder under `frontend/src/components/`.

## Color

- **Teal** (`primary`, `#0e7490`) is the one accent: interactive elements, the
  selected state, the primary action, the picked region on the map.
- **Water levels** are reserved for meaning and never decorate: low green,
  medium amber, high red (a solid fill with white text, the loudest thing on a
  row), empty grey with a hollow dot. Levels are token *pairs*:
  `levels.<x>.marker` for map geometry, `levels.<x>.text`/`bg` for chips. Inside
  a chart card the level reading is neutral: the thresholds already show it.
- **Map feature markers** use the Okabe-Ito colorblind-safe palette.
- No hex values in components: all color comes from the tokens in `theme.ts`,
  component-wide rules from the theme's `styleOverrides`.
- Transparency uses the six named alpha steps from `alphas` (`tint 5%`,
  `wash 8%`, `hover 12%`, `hairline 33%`, `border 60%`, `scrim 80%`).
- Contrast floors, checked by [`contrast.test.ts`](../frontend/src/lib/contrast.test.ts)
  against the tokens in `theme.ts`: text and its ground reach 4.5:1 (body and
  secondary ink on every surface; teal, green and red text on the three light
  grounds; chip text on its wash); marks and controls reach 3:1 on white or
  the surface (level and feature markers, put-in and take-out, the teal focus
  ring, the `outline` edge of an input at rest - the hairline `outlineVariant`
  is decoration only). Chips and level pills use the paired text/background
  tokens rather than a tint of the marker color.
- The ground is `surfaceLow`, cards are `surface`, a quiet inset inside a card
  is `surfaceHigh`.

## Type scale

Figtree only; weight carries the hierarchy (400 body, 500 names, 600 labels and
tabs, 700 titles). Sizes: `0.6875rem` (calendar weekdays), `0.75rem` (labels,
captions: `labelSx`), `0.8125rem` (secondary text, `body2`), `0.875rem`
(buttons, tabs), `0.9375rem` (body, row names), `1rem` (inputs: 16px so iOS does
not zoom), `1.125rem` (sheet and dialog titles), `1.25rem` (panel titles). New
UI picks the nearest step. Numbers use tabular figures.

## Shape and elevation

Radii from `tokens.radii`: 6 (small tags), 10 (buttons), 12 (range bands), 14 (cards), 16 (sheets
and the FAB), 20 (dialogs), pill (chips and level pills). Elevation from
`tokens.elevation`: `e1` a card at rest, `e2` a floating panel, popover or map
control, `e3` the accent glow under the primary action. A circle is
`borderRadius: "50%"`.

## Touch

Every target is at least 44px in both directions (`tokens.touch.min`); list
rows and tabs 48px. A smaller visual gets a larger hit area (chips are 32px to
look at and 44px to hit). Text inputs are 16px. Layouts hold at 320px wide and
with text at 130%: names wrap, cards grow, nothing scrolls sideways.

## Motion

The scale is `tokens.motion`: instant 90 ms (press feedback), fast 160 ms
(fades, chips), base 260 ms (panels, folding), slow 360 ms (the ceiling).
Arrivals ease out, travel between resting places eases in and out, exits ease
in and take about 70% of the time. One anchor per move; the touched element
moves first and least; the list height goes to the chart on the same curve.
Transform and opacity by default. No bounce on content. Spinners wait 150 ms;
skeletons mirror the content so geometry holds still. Reduced motion drops
movement to nothing and keeps a short fade. Ambient motion (the flow along the
selected section on the map) is at most one thing, off when the tab is hidden,
after a quiet spell, offline or under reduced motion.

## Icons

One 24px grid, 2px stroke, round caps and joins, no fills, one color. Each
feature type has its own silhouette, readable at 16px: whitewater (waves),
rapid (a breaking wave), freestyle spot, hole, siphon, strainer (a tree), weir,
dam, obstacle, bridge, portage, put in, take out, waterfall. Icons always sit
beside the name.

## Map

The base map is light. Labels are ink on a white halo; region names are their
own quiet type; the selected line and the picked region are teal; sections are
a clear blue. Region boundaries are one thin grey line in one ink, each edge
drawn once, with no per-region colors; names sit at the visual centre of each
region; ranges that hold two or more others in
view are not drawn; valleys are soft bands. The country is named once, at the
border, and in the picker.

## Wording

Sentence case, plain words, no em dashes (a plain hyphen). Reuse the app's own
strings; a new word is agreed first.

## Map as the canvas

From 768px wide, on the map page, Logs, Trips and Proposals, one map fills the
window under the app bar and the content floats over it in cards. The map
always shows what you are looking at: the open log, the trip's bases, the
proposed change. Below 768px nothing changes; the phone keeps its own screens.
The reasons and the work plan are in [plans/wide-canvas.md](plans/wide-canvas.md).

| Card | Width | Used for |
|---|---|---|
| Detail | 26% of the window, 340 to 440 (360 under 1280); drag the grip to resize, 340 to 560 and never leaving the rail's plot under 480 (remembered per device) | the map page's search, river and section panel |
| List | 20%, 300 to 380 | the list of logs, trips or proposals |
| Side | 25%, 400 to 600 | the open log, trip, proposal, and a trip's members |

- **Budget.** Open cards cover at most 55% of the window, or 70% when a list
  card is among them (so a list and an open item both fit at 1280, and a
  trip's members card fits at 1600 and up). Past that the lowest priority card
  folds to its header; tapping the header opens it and folds another.
- **Header.** Each card has one header, supplied by its screen: a title, a
  grey subtitle, actions at the right and a close button. Where the panel in
  the card has its own header (the search panel, a log), that is the card's
  header and the card draws none.
- **Reading rail.** From 1280 wide and 600 tall, a section (or a picked gauge)
  with a gauge shows the rail. The detail card runs the full height (16px from
  the app bar and the foot), and its foot is the reading block, as tall as the
  rail. The chart continues to the right as the rest of the rail, starting at
  the card's edge: one surface, one hairline, a concave fillet where the rail's
  top meets the card. The rail is 22% of the window height, 184 to 248, and
  floats 16px from the right and the foot. The card's order from the top:
  header, tabs, scroll area (strip, count, rows; the river-state slot takes the
  spare room), the docked action, the reading block. The reading block holds
  the gauge name (a picker with several gauges), the options button, the level
  with its unit, a dot and the level word, the trend ("High, falling 24 cm in
  24 h": newest reading against the one 24 h earlier, within 3 h; a change of
  3% of the high threshold, 1 unit without one, counts) and the time, and the
  period (24h, 7d, 30d, 1y). A reading older than 3 h or three gauge
  intervals shows "No recent reading" with no level word or trend. The plot has
  threshold labels in an 84px right gutter, the latest point as a ringed dot
  and the credit line under it; pointing at it replaces the reading until
  "Latest". The options (which reading, the threshold lines, closing a picked
  gauge) are a 300px popover over the map. Without a gauge there is no rail and
  the card ends in a 64px row "No gauge for this section" with "Link a gauge"
  (signed in; it opens the New feature form, where the gauge is chosen). Below
  1280, or under 600 tall, there is no rail: the card is 360 wide, hugs its
  content and the chart (reading, period, a 128px plot, the credit) is its
  first block. The open tab and its scroll survive crossing 1280.
- **Free area.** The part of the map no card or rail covers. The map frames
  the subject inside it, and the zoom keys, compass and layer key form
  one stack 16px from the right and the top, and the attribution sits 8px above
  the rail (24px from the foot without one), never over a card. The layer key
  is one 44px button; its 272px popover opens to its left with Section, River,
  Features and Satellite.
- **Sections on the map.** The subject of a screen is teal (the open log's
  sections, a proposed line); context is a dim line you cannot click (other
  logged sections, the stored line a proposal replaces).
- **Forms with their own map** (logging a descent) leave the canvas and use the
  whole page, so only one map is ever drawn.
