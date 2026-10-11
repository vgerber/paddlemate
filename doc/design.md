# Design language

The rules that keep every screen looking like the same product. This is the
calm design: light, soft, readable outdoors. The theme (`frontend/src/lib/theme.ts`)
already carries its tokens; screens move to the rest of it one feature at a
time, as listed in [plans/ui-overhaul.md](plans/ui-overhaul.md).

## Character

Calm and warm, never playful and never mechanical. One typeface (Figtree),
sentence case everywhere, rounded corners, soft shadows in three steps, one
teal accent. No capitals for labels, no monospace, no heavy frames; no stamps,
slang, bounce or confetti. Color is used sparingly and always carries meaning.

## Layout

- **Desktop** has a fixed top AppBar with text navigation; **mobile** has no
  top bar and a fixed bottom navigation, the current section as a soft pill.
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
- Multi-step forms have no top header. Their chrome is a fixed bottom bar:
  cancel or back on the left, title with step progress as subtitle, one round
  primary-action button on the right.
- One screen, one primary action: a bottom-right FAB on a phone, a full-width
  **docked** button at the foot of the list pane on desktop. Bottom-right of the
  *content*, not the window.
- Empty states are an icon and one line; the primary action is the call to
  action. A finished flow ends the same way.
- Forms are built from labelled blocks (`FormSection`): a heading, one hint line
  saying what the block is for, and an optional action in the heading.
- **Rows** are cards with the soft shadow, not bordered boxes; a selected card
  gets a 2px teal ring. A row's actions are one overflow menu (`RowMenu`).
- **Filters** are chips under the search field: teal when set, one tap opens a
  sheet with the exact fields. The search screen has the header and tabs like
  every other screen (Name, Area, Region), results lead with Sections.
- **Sheets** have a peek and an open height; a picked region or a pick in
  progress opens as a peek so the map keeps its room.
- **Pinned** elements (the Plan's week calendar, a search field) stay under the
  tab bar while the list scrolls beneath them.
- Inline alerts are quiet notes: a tinted ground, severity carried by the icon.
  The filled variant is reserved for the global error snackbar.
- Do not repeat what a filter already says; secondary counts drop out when zero.
- A choice between two states is a small segmented control; a decision that
  commits something (approve, reject) is a labelled button in its own row.

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

Radii from `tokens.radii`: 6 (small tags), 10 (buttons), 14 (cards), 16 (sheets
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
drawn once, with no per-region colors; ranges that hold two or more others in
view are not drawn; valleys are soft bands. The country is named once, at the
border, and in the picker.

## Wording

Sentence case, plain words, no em dashes (a plain hyphen). Reuse the app's own
strings; a new word is agreed first.
