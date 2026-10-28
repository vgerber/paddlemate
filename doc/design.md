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
- **One bar, one set of numbers** (phone and desktop alike). The title row is
  56 high, 104 with the 48 tab row; there is no extra padding above or gap
  under it. Title 20/700/26, subtitle 13/400/18, every action icon 24 in a 44
  box (back and close are 22). A screen with no back arrow (Settings, Tools,
  the map search) puts its title on the 28 line; with a back arrow the arrow is
  on the 28 line and the title on the 68 line. The search header is the same
  bar, so going from a search to a river does not move the tabs. Other titles:
  card and state titles 15/600/20 (`cardTitleSx`), sheet and dialog titles
  18/700/24 (`h4`; a sheet's on the 28 line), the form bottom bar 16/700 with a
  13/400 subtitle, the count line (`ListPaneHeader`) 13/500 in a 44 row, and an
  in-screen section heading 13/600/18 (`sectionHeadingSx`). A heading never
  sets its own size.
- **Tabs swipe.** The content under the tab bar follows the finger one to one
  and settles on the next tab; the underline stretches in step. The first and
  last tab resist and spring back. The screen edge (24px) stays free for the
  system back gesture. A chart that is zoomed, a chip row, a slider and the map
  keep their own horizontal gestures. Wizard steps do not swipe. Tabs keep their
  roles and arrow keys; swiping is never the only way.
- **Spacing in the section panel** (`tokens.canvas.panel`, from `md`): the
  well under the header has 8 on all sides and 8 between cards, on every tab;
  inside a card text sits 16 from the edge (24 from the panel's edge), a hit
  box ends 12 from the edge, a row is 56 high and the header 104 (a 56 title
  row with the back box at +12 and the title text at +64, then a 48 tab row
  whose first label starts on the 24 line). Cards carry no outer margin of
  their own; the well supplies it. A docked action sits on the card edges
  (`DockedAction` with `inset`), 8 below the last card. Other panes keep
  their own inset until they move to this system.
- **The phone grid** (`tokens.phone`, below `md`; the counterpart of the panel
  spacing above, one token set per layout). A card sits 12 from the screen
  edge and 8 from the next card; text sits 16 inside it, so every text starts
  on **one 28 line** and every value ends on the mirrored line, 28 from the
  right edge. A screen without cards (headers, tabs, a list's count line, a
  form) uses the same 28 line. In the header the back arrow's icon is on the
  28 line and the title on the 68 line; the last action icon ends on the right
  line, and the first tab label starts on the 28 line. A row's icon is 28 wide
  with 12 after it, so names start on the **68 line**. A trailing control (a
  `RowMenu`, a chevron) is a 44 box that hangs 10 past the row's padding
  (`trailSlotSx`), so its icon ends on the right line; rows of one list all
  render it, a control or an empty spacer, so their values end on one line.
  **One surface rule:** a phone list is cards on the grey ground (rows are
  `cardRowSx` cards, groups `phoneCardSx` cards), as the section panel is; a
  screen is an exception only when a card would hide its structure, and says
  so here. A scrolling list ends with `fabRoom` (88: the FAB's 56 and 16 around
  it) as bottom padding instead of narrowing single rows or strips, so the
  chart, the feature strip and the rows all use the full card width. **Forms and
  sheets:** a form's fields, headings and hints start on the 28 line and end on
  the right line (the screen's own padding is `phone.line`, not 16), and
  `PanelBottomBar` puts its Cancel text on the 28 line and its round action's
  edge on the right line; a text button or icon in a `FormSection` heading hangs
  out so its label or icon ends on the right line. `BottomSheet` is full-bleed
  with no padding of its own, because what it holds brings its own grid (a
  `PanelHeader` for the tabs, cards at the 12 edge, controls on the 28 line);
  a gutter in the sheet would double theirs. Checked by
  `e2e/layout/phone-grid.spec.ts`.
- **One header menu, grouped.** The section's actions sit in one overflow menu
  in the header, in groups with a hairline between (`groupStart` on a
  `RowAction`): the section (favorite, start and log descent), then its grade
  (edit, delete), then the view (show proposed features, Features tab only).
  An action the tab already offers as its docked button (Log descent on Logs)
  is left out of the menu. A card inside the panel has no menu of its own.
- Two panes side by side separate by surface level (the list on the ground, the
  detail on cards), not by a hard border.
- Multi-step forms have no top header. Their chrome is a fixed bottom bar
  (`PanelBottomBar`): Cancel on the first step and Back after it on the left,
  the title with the step as subtitle and a bar of step segments, one round
  primary-action button on the right.
- Fields are filled (the theme's default variant): the label sits inside the
  field at the top, the value beneath it, a 1px inset line that becomes a 2px
  accent ring on focus. Dates and times use `PickerField` (`components/descents/descent-form/`): the app's own format on top of the browser's native picker, not free text.
- **Guide, do not bombard.** A screen shows what the user is looking at and the
  one next step; everything else waits until it is asked for. Per panel: one
  primary action, one overflow menu for the rest, no settings icon beside it.
  A control appears only when it can do something here (a level/flow choice
  only for a gauge that measures both, a compass only once the map is
  rotated). Before adding a visible control, remove one or put it in the menu.
- One screen, one primary action: a bottom-right FAB on a phone, a full-width
  **docked** button at the foot of the list pane on desktop. Bottom-right of the
  *content*, not the window.
- Empty states are an icon and one line; the primary action is the call to
  action. A finished flow ends the same way.
- Forms are built from labelled blocks (`FormSection`): a heading, one hint line
  saying what the block is for, and an optional action in the heading.
- **Rows** are cards with the soft shadow, not bordered boxes. The open row in
  every list (trip, proposal, gauge, settings, river) gets the teal wash and
  the 3px inset bar of `canvas/flatRow.ts`. A row's actions are one overflow menu (`RowMenu`).
  Inside a panel card a row is a plain 56px row, a dimmed rule between rows,
  and the whole row is the target: no chevron at the right (the river state
  rows). A card hugs its rows; the ground below it stays plain.
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
| Section detail | The chart: from 1280 the reading block at the card's foot and the plot in the rail beside it, below that a card at the top of the pane (reading, plot, the credit and the period; on a phone the chart with an options button that opens reading and period); tabs Features, Logs, Notes, Sources; the feature strip (each feature as its icon, ranges as bands that fold and name what they hide; hidden for no rows, a single row, or put-in and take-out only); a graded range over 80% or more of the run is the section's grade, so it leaves the rows, strip and count (`sectionGrade` in `section-details/grade.ts`, shown in the card subtitle), with the hardest harder stretch in brackets; the count line reads "n features · m proposed"; a section with nothing but a grade reads "No rapids, hazards or access points yet."; the river state block (hazard, last paddled, latest note, open proposals) fills the card's spare room as a card that hugs its rows; the section's history opens from the Sources tab, a feature's from its open row |
| Search | Tabs Name, Area, Region; the empty Name view lists starred sections and recent rivers, each river ending in `LevelDots` for its sections; a Filters sheet (country, grade, Water now); the chosen levels live in the `water` URL param |
| Map region mode | The search panel (a peek sheet on a phone, the card on desktop) with the region field, a segmented control for the kind drawn, and "Part of" naming the parents of a picked region; the regions stay visible on the map |
| Logs | Two panes on desktop; the date is a picker field |
| Trips | Plan, Bases, Members and Logs tabs; the Plan pins a week strip with a dot on days that have runs and opens to a month; its days read in three states - past quiet (sunk ground, no shadow, grey heading), today ringed in teal, upcoming white with a hairline outline; bases and candidate bases (a closed base ends in a `LevelDots` row, one dot per run on its watch list); admins get Add member and the trip actions |
| Proposals | The diff shows the before struck through next to the after; reviewing opens a dialog |
| Settings | Two panes on desktop; Profile, Inbox and Tools on a phone; an access token is shown once, when made |

Components for each live in the matching folder under `frontend/src/components/`.

## Color

- **Teal** (`primary`, `#0e7490`) is the one accent: interactive elements, the
  selected state, the primary action, the picked region on the map.
- **Water levels** are reserved for meaning and never decorate: low green,
  medium amber, high red (a solid fill with white text, the loudest thing on a
  row), empty grey with a hollow dot. `LevelDots` is one 8px dot per section in
  those colours: grey filled is unknown (no gauge, no thresholds, or a reading
  older than 3 h or three gauge intervals, the same rule as the reading block), a grey ring is too low; the row carries one label such as
  "2 of 4 sections running". Levels are token *pairs*:
  `levels.<x>.marker` for map geometry, `levels.<x>.text`/`bg` for chips. Inside
  a chart card the level reading is neutral: the thresholds already show it.
- **Map feature markers** use the Okabe-Ito colorblind-safe palette.
- No hex values in components: all color comes from the tokens in `theme.ts`,
  component-wide rules from the theme's `styleOverrides` (see Dark mode).
- Transparency uses `withAlpha(token, step)` with the named steps from `alphas` (`tint 5%`,
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

## Dark mode

Settings > Appearance offers System, Light and Dark. The choice is kept per
device; System, the default, follows the device live. Dark is calm, not
inverted: a deep blue-grey ground, cards one step lighter, the teal accent
brightened. Print is always light. The installed app keeps a dark frame on a
dark device even when the app is set to Light, so the system buttons stay
legible.

Palette (values live in [`lib/theme.ts`](../frontend/src/lib/theme.ts), the
contrast floors in `contrast.test.ts` hold for both schemes):

| Role | Light | Dark |
|---|---|---|
| Ground (`surfaceLow`, `background`) | `#eef2f3` | `#141b1f` |
| Card (`surface`) | `#ffffff` | `#1b2429` |
| Inset (`surfaceHigh`) | `#f6f8f9` | `#212c32` |
| Line (`outlineVariant`), highest surface | `#dde4e7` / `#e7edef` | `#2a353c` |
| Text / secondary | `#1f2b31` / `#58666d` | `#e8eef0` / `#9aa8ae` |
| Primary | `#0e7490` | `#67c7e0` |
| Success / error | `#1d6b4f` / `#b4373f` | `#86d2b2` / `#f08c8a` |
| Level chips | text on a wash; high is a solid fill | low `#86d2b2`, medium `#f0c06c` on a 16% wash, high `#f08c8a` with dark text |
| Map ground / water / river | see `mapGround`, `mapWater`, `mapRiver` | `#1c2429` / `#12303f` / `#2f6384` |

Known limits: satellite imagery is not darkened, the favicon follows the
device scheme rather than the app setting, and there is no sunset schedule or
synced preference (System is the only automatic mode).

Elevation in dark is a lighter surface, not a shadow: a card sits one step
above the ground, a floating card one above that (`surfaceBright`). Paper
overlays are off.

Rules for new work:

- **A colour is a token** with a light and a dark value in `lib/theme.ts`;
  never a hex or `rgb()` literal elsewhere. Add it to both `lightTokens` and
  `darkTokens` and check it in both schemes.
- **Transparency** is `withAlpha(token, step)` (`lib/alpha.ts`), which works on
  a `var()`. The hex-alpha suffix no longer works on a token.
- **Resolved colours** for MapLibre paint, SVG strings turned into images,
  canvas and colour maths come from `useTokens()`, which returns hex values
  for the active scheme and changes identity only on a switch.
- **The colour guard**, `npm run check:colours`, fails on literals outside
  `theme.ts` and on tokens in the map paint files. A line that must stay a
  literal (a mask-image alpha) carries `/* mask */`.
- **Print is light**: `theme.ts` resets the variables under `@media print`,
  and the inline style in `index.html` does the same for the page ground.
- **Frame colours**: the `theme-color` meta is `#ffffff` in light and `#141b1f`
  in dark; the dark-media meta is always `#141b1f`; the manifest theme and
  background are `#141b1f` (a manifest holds one colour).

### Internals

- `tokens` is `toVars(lightTokens)`: every colour is `var(--pm-*)`; MUI runs in
  CSS-variables mode with both schemes and `data-theme` on `html`.
- A small script in `index.html` reads the stored mode
  (`paddlemate-color-mode`) and the device preference before first paint, sets
  `data-theme` and the light-media meta; it mirrors `resolveScheme` in
  [`lib/colorMode.ts`](../frontend/src/lib/colorMode.ts), and
  `colorMode.test.ts` holds both together.
- The map restyles on a switch (`useMutedBaseMap` re-mutes after the style
  loads); marker images are re-registered per scheme.
- Specs: `frontend/e2e/dark/` (no light surface, contrast, map paint, switch,
  print, no flash).

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

The sweep is a Playwright spec, `frontend/e2e/sweep/sweep.spec.ts`, that
loops over every screen in `e2e/support/dark.ts` `SCREENS` (add a new screen
there). On each it checks, light and dark: no sideways scroll or clipped text
at 320px, and at 390px with the root font at 130%; every visible control at
least 44px or with a hit area that size; `@axe-core/playwright` (WCAG 2.1 AA)
with no serious or critical violation; Tab reaches every control in reading
order with focus always visible; Escape closes what opened. Every check is
soft, so one run lists all failures, also written to `sweep-results/`. Run it
with `npm run e2e:sweep`, or one screen with `-g "sweep: <name>"`. An allowlist
entry needs a reason beside it.

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

Settings > Appearance > Motion holds Full (default), Reduced and System, kept
per device. The resolved value is `html[data-motion]` (set before first paint
and kept live by `lib/motionMode.ts`); the global reduced rule and
`prefersReducedMotion()` / `useReducedMotion()` in `lib/motion.ts` read it.
`tokens.motion.easeSettle` is for sheets only.

Rules behind the choices:

- Scale helpers in `lib/motion.ts`: `releaseMs` (a released sheet, 220 ms plus
  0.25 per px, at most 360), `stepMs` (a stepped control, 160 ms plus 20 per
  step, at most 300) and `cameraMs` (the camera: 260 ms up to half a screen
  away, 360 up to 1.5 screens, beyond that a jump). All return 0 under reduced
  motion; JS-timed transitions (Collapse, Slide, Fade, MapLibre durations) read
  `useReducedMotion()`.
- Disclosure animates `grid-template-rows` (or MUI `Collapse` on the token
  timing); sheets move by `transform` only; the trip calendar's day disc
  follows the scroll by IntersectionObserver plus a transform transition. No
  view transitions over the map canvas.
- Map: paint expressions and `easeTo`, never `setData` per frame and never CSS
  left/top on markers. The flow along the selected section is one dasharray
  layer, 12 frames at 12 Hz; the draw-in is a `line-gradient` step in its own
  source with `lineMetrics` (360 ms; `setData` per frame costs two to three
  times more); a level change fills the dot from its centre as a DOM marker
  transition (a paint transition does not run on data-driven expressions); the
  first load fades in once (260 ms). Ambient motion pauses on a hidden tab,
  after 20 s without input, under reduced motion, under a full-screen overlay,
  at 20% battery when not charging, and on software-rendered WebGL.
  [`useMapMotion.ts`](../frontend/src/components/map/useMapMotion.ts) owns the policy.
- Dropped on purpose: flow on every river, a ripple on a line, region outlines
  drawing in, marking an unchanged reading. The feedback pages' berry error
  colour was not adopted; errors stay red.

## Known limits

- Headless Chrome draws the map in software, in tasks of 70-180 ms (the same
  under Reduced motion), so the 50 ms long-task budget cannot hold there;
  `e2e/motion/frames.spec.ts` keeps a 300 ms bound and the real budget is
  judged on a phone. The flow pauses on software-rendered WebGL for the same
  reason; its cost on a real phone is still to be judged.
- Stored section lines are often two points, so the flow and the draw-in follow
  a straight stroke beside the river until the OSM centreline is used.
- The chart's period choice is a menu, so options open as a menu, not a panel
  inside the card.
- A chart redraw remounts the chart, so the old line does not fade out before
  the new one is revealed.
- Trip calendar: a second week change mid-swap drops the first slide, and a
  drag started while the month settles starts from where it is heading.
- Feature markers are GL layers, so they do not fade in as the draw-in head
  passes. The flow does not stop for a stale gauge on the selected section;
  only the gauge dots turn hollow.
- Gauge catalog: clusters are not Tab stops (dozens sit offscreen); a keyboard
  zooms with the map keys until single gauges, which are, appear.
- The log descent and suggest feature flows close straight away; only the
  suggest section and river flows show the success mark.
- Open: whether the camera wants a longer time for moves of three zoom levels
  or more.

## Features list

The strip above a section's feature list shows the run to scale with each
feature's icon in a small white disc on the line; it never folds. Put in and
take out always stand alone. Two features that would overlap step apart, the
second below the line on a short stem (ranges are drawn above it). Three or
more that would overlap merge into one group disc; a group holding a hazard
shows that hazard's icon with the count as a badge, by danger: siphon,
strainer, waterfall, dam, weir, hole; otherwise the count. Groups form from the
space available, so a wider screen splits them. In the list a point carries its
icon on the rail; a range is a soft band whose icon tile carries a chevron
badge, and the whole range row folds or opens it; a folded range lists what it
hides by name. A portage band keeps a dashed rail.

## Icons

One 24px grid, 2px stroke, round caps and joins, no fills, one color. Each
feature type has its own silhouette, readable at 16px: whitewater (waves),
rapid (a breaking wave), freestyle spot, hole, siphon, strainer (a tree), weir,
dam, obstacle, bridge, portage, put in, take out, waterfall. Icons always sit
beside the name.

Every other icon comes from [`lib/icons.ts`](../frontend/src/lib/icons.ts), one
export per idea, so the same idea shows the same glyph on every screen. No file
imports `@mui/icons-material` directly (a Biome rule enforces it). The
outlined Material glyph is the default; a filled one is allowed only where the
fill carries meaning.

| Idea | Export | Glyph | Where | Filled because |
|---|---|---|---|---|
| A map | `MapIcon` | MapOutlined | bottom nav, tools, map toggle, wizard done | |
| A paddling log | `LogIcon` | DirectionsBoatOutlined | nav, log lists, trip logs, river state, inbox | |
| A place | `PlaceIcon` | PlaceOutlined | comment pins, feature geometry, a stay of kind other | |
| Add a place | `AddPlaceIcon` | AddLocationAltOutlined | comment map pin | |
| A note | `NoteIcon` | ChatBubbleOutlined | river state | |
| A note on the map | `NoteMarkerIcon` | ChatBubble | map note markers | solid shape stays legible over the map |
| Expand / collapse | `ExpandIcon` / `CollapseIcon` | ExpandMore / ExpandLess | menus, rail, proposals, map pane | |
| Confirm, done, copied | `ConfirmIcon` | Check | dialogs, forms, copy feedback | |
| Success | `SuccessIcon` | CheckCircleOutlineOutlined | submitted steps | |
| Search | `SearchIcon` | SearchOutlined | search fields, panels | |
| A link / link revoked | `LinkIcon` / `LinkOffIcon` | LinkOutlined / LinkOffOutlined | markdown, invites | |
| Locked / unlocked | `LockIcon` / `UnlockIcon` | LockOutlined / LockOpenOutlined | area lock | |
| A starred section | `StarIcon` / `StarOutlineIcon` | Star / StarBorder | section rows, browse panel | the filled star means "starred" |
| A trip | `TripIcon` | LuggageOutlined | nav, inbox, invite | |
| A base (any) | `BaseIcon` | BedOutlined | trip bases empty state, inbox | |
| A base by kind | `stayKinds.ts` | camp (tent), hotel, bivouac, holiday home, other (place) | trip bases, timeline | |
| Back, close, more | `BackIcon`, `CloseIcon`, `MoreIcon` | ArrowBack, Close, MoreVert | panel headers, row menus | |
| Add, edit, delete | `AddIcon`, `EditIcon`, `DeleteIcon` | Add, EditOutlined, DeleteOutlined | forms, rows | |
| Copy, share | `CopyIcon`, `ShareIcon` | ContentCopyOutlined, IosShareOutlined | invites, tokens, coordinates | |
| History | `HistoryIcon` | History | edits timeline, coordinates | |
| Members, admin, leave | `MembersIcon`, `AdminIcon`, `LeaveIcon` | GroupOutlined, ShieldOutlined, LogoutOutlined | trip members, inbox | |
| Pending proposal | `PendingIcon` | PendingActionsOutlined | browse panel, river state | |
| Features of a river | `FeaturesIcon` | Waves | empty feature list | |

The rest (arrows, chevrons, formatting, charts, thumbs, photos and so on) are
one export each in the file; look there before adding one.

## Map

The base map is light. Labels are ink on a white halo; region names are their
own quiet type; the selected line and the picked region are teal; sections are
a clear blue. Region boundaries are one thin grey line in one ink, each edge
drawn once, with no per-region colors; names sit at the visual centre of each
region; ranges that hold two or more others in
view are not drawn; valleys are outlined like every other region. The country is named once, at the
border, and in the picker.

## Wording

Sentence case, plain words, no em dashes (a plain hyphen). Reuse the app's own
strings; a new word is agreed first.

## Map as the canvas

From 768px wide, on the map page, Logs, Trips and Proposals, one map fills the
window under the app bar and the content floats over it in cards. The map
always shows what you are looking at: the open log, the trip's bases, the
proposed change. Below 768px nothing changes; the phone keeps its own screens.

Why: on a wide window a phone layout wastes the screen, and a map beside a
list leaves the place you are reading about small and far from its words. One
map under floating cards keeps place and text together and costs nothing to
reach, and cards let a list and an open item sit side by side without a fixed
grid.

| Card | Width | Used for |
|---|---|---|
| Detail | 26% of the window, 340 to 440 (360 under 1280); drag the grip to resize, 340 to 560 and never leaving the rail's plot under 480 (remembered per device) | the map page's search, river and section panel |
| List | 20%, 300 to 380 | the list of logs, trips or proposals |
| Side | 25%, 400 to 600 | the open log, trip, proposal, and a trip's members |

- **Budget.** Open cards cover at most 55% of the window, or 70% when a list
  card is among them (so a list and an open item both fit at 1280, and a
  trip's members card fits at 1600 and up). Past that the lowest priority card
  folds to its header; tapping the header opens it and folds another.
- **Order.** Cards line up from the left: the list, then what you opened from
  it right beside it (a log, a trip, a proposal, a form), so the map stays one
  free area on the right. Only a third card that adds to the open item (a
  trip's members) sits at the right edge. Where a form and the list would not
  both fit, the form takes the list's place.
- **Header.** Each card has one header, supplied by its screen: a title, a
  grey subtitle, actions at the right and a close button. Where the panel in
  the card has its own header (the search panel, a log), that is the card's
  header and the card draws none.
- **Reading rail.** From 1280 wide and 600 tall, a section (or a picked gauge)
  with a gauge shows the rail. The detail card runs the full height (16px from
  the app bar and the foot), and its foot is the reading block, as tall as the
  rail. The chart is its own card beside it, 8px from the card's edge, on the
  same foot line and with the same corners. The rail is 22% of the window
  height, 184 to 248, and floats 16px from the right and the foot. The card's
  order from the top: header, tabs, scroll area (strip, count, rows; the
  river-state card hugs its rows below them), the docked action, the reading
  block. The reading block is a stat tile: top left the gauge name (a picker
  with several gauges) with the time and age of the newest reading ("19:55 ·
  10m ago"), top right the period as one quiet text button ("Last 7 days")
  that opens a four-item menu, and a close mark only for a gauge picked from
  the map; at the foot the latest value, large (56 to 80px with the rail
  height, weight 600), its unit, and the level dot and word on its baseline,
  with the Level | Flow choice at the right only for a gauge that measures
  both.
  The period menu lists 24h to 1Y and "Custom range", which opens a dialog
  with From and To day pickers (To not after today, at most five years); the
  low-high band is the line's own hue at low opacity and appears only where
  readings are averaged; a mouse drag over the plot selects a span to zoom to,
  and touch keeps its own pinch gesture. The space between holds a future outlook line, so the number never
  moves; there is no trend until there are predictions. A reading older than
  3 h or three gauge intervals shows "No recent reading" with no level word,
  and its dot is grey. The plot runs edge to edge with no grid and a 2px line:
  threshold marks (the word and the value the level starts at, "Medium
  80 cm") stand on the lines at the plot's left, no gutter, thresholds are
  always drawn; the
  latest point is a ringed dot 8px short of the right edge; the credit line is
  under it. Pointing at or tapping the plot shows a hairline, a ring dot and a
  readout ("High, 78.8 cm" with the time) in the plot only; the values pane
  keeps the latest reading, and the point stays marked until the period or
  the gauge changes. The axis steps 6 h (24h), 2 days (7d), 5 days (30d) or 2
  months (year, with the year at January). The card's resize handle is a
  14x48 tab with grip dots on its edge, half over the map (44x64 to hit),
  teal on hover. Without
  a gauge there is no rail and
  the card ends in a 64px row "No gauge for this section" with "Link a gauge"
  (signed in; it opens the New feature form, where the gauge is chosen). Below
  1280, or under 600 tall, there is no rail: the card is 360 wide, hugs its
  content and the chart (reading, period, a 128px plot, the credit) is its
  first block (the plot full card width, the period beside the credit). The
  open tab and its scroll survive crossing 1280.
- **Free area.** The part of the map no card or rail covers. The map frames
  the subject inside it, and the zoom keys, compass and layer key form
  one stack 16px from the right and the top, and the attribution sits 8px above
  the rail (24px from the foot without one), never over a card. The layer key
  is one 44px button; its 272px popover opens to its left with Section, River,
  Features and Satellite.
- **Sections on the map.** The subject of a screen is teal (the open log's
  sections, a proposed line); context is a dim line you cannot click (other
  logged sections, the stored line a proposal replaces).
- **Forms that pick on the map** (logging a descent, suggesting a section) are a
  side card over the canvas; sections and put-in/take-out are picked on the host map, and the
  form's bar stays at the card's foot. On a phone the form keeps its own map.

### Internals

- **One host.** `CanvasHost` in `__root.tsx` draws the only map, at md and up
  and only on the geography routes; elsewhere it renders nothing and the map is
  released, so there is never more than one `.maplibregl-map` at md and up
  (`window.__paddlemateMap` stays valid). Crossing 768 mounts or unmounts it.
  It sits fixed under the app bar; the card layer is `pointer-events: none`
  and each card turns it back on, so the map pans in the gaps.
- **Scene contract.** A route describes its map with `useCanvasScene(scene)`
  (`components/canvas/CanvasContext.tsx`, an external store read through
  `useSyncExternalStore`, so a scene change re-renders only the host). The
  scene is set in a layout effect and cleared on unmount with an owner token,
  so an old cleanup never clears a newer scene. It carries the `WaterwayMap`
  props, the camera without padding and a `subject` (`key`, `bounds`,
  `maxZoom`) to frame. `buildMapScene` (`map-page/mapScene.ts`) is the pure
  builder the map page and its phone `MapPane` share.
- **Camera.** `useMapCameraEffects` pads every fit by the free area (60 when
  none), fits the subject when its key changes, refits when padding changes
  (instantly while a card is dragged, 400 ms after) and skips a refit when the
  subject is already inside.
- **Cards.** `useCoverBudget` folds the lowest priority card past the budget.
  `ResizeGrip` is a focusable `role="separator"` (arrow keys 16px, Shift 64,
  Home and End); width fractions persist through `lib/cardWidth.ts`
  (localStorage in try/catch, clamped on read). `useFreeArea` is the card edges
  plus 32px, each side at most 45%, falling back to the whole host when under
  240x200 is free.
- **Risks handled.** Refits are event driven (subject key, drag end), never a
  loop, and an idle map makes no render events. Deep links build their scene
  from route params and cached queries; the first fit waits for the map load
  and the measured card rects. Cards follow the map in DOM order.
