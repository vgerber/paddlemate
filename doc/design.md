# Design language

The rules that keep every screen looking like the same product.

## Character

Dark, sharp, technical - an instrument, not a brochure. No rounded corners,
no elevation shadows, no hover transitions. Labels and buttons are uppercase
Space Grotesk with wide letter spacing; body text is Inter. Color is used
sparingly and always carries meaning.

## Layout

- **Desktop** has a fixed top AppBar with text navigation; **mobile** has no
  top bar and a fixed bottom navigation instead. Pages never add their own
  app-level chrome.
- Detail content lives in a panel: a bordered side panel on desktop, a
  full-screen overlay on mobile. Panels open with one header pattern - back
  arrow, bold title, grey subtitle, action icons right - followed by a
  full-width tab bar when the panel has views.
- Multi-step forms have no top header. Their chrome is a fixed bottom bar:
  cancel/back on the left, title with step progress as subtitle, one round
  primary-action button on the right.
- One screen, one primary action, shown as a bottom-right FAB. If the screen
  has a single purpose, the FAB performs it directly; menus only where several
  actions genuinely share the spot.
- Empty states are an icon and one line of text - the FAB is the call to
  action, so they carry no buttons. A finished flow ends the same way: the
  terminal screen is an icon and one line, and the bottom bar carries the
  way out, never an inline filled button.
- Multi-step forms are built from labelled blocks (`FormSection`): overline
  heading, one hint line saying what the block is for, and an optional
  action in the heading. A block's own action lives in its heading so it
  never competes with the bottom bar's primary action.
- Inline alerts are inset notes, not banners: square, compact, dark ground
  with a tinted border and a colored icon carrying the severity. The filled
  variant is reserved for the global error snackbar.
- Long lists separate rows with a dimmed rule (the divider token at ~33%
  alpha), not a full-strength one - a rule between every row reads as a
  grid. Two panes side by side separate by surface level (the list on
  `surfaceLow`, the detail on `surface`) rather than a hard border.
- Do not repeat what a filter already says: a row in a list filtered to
  "pending" carries no pending badge. Secondary counts (votes, totals)
  drop out entirely when they are zero.
- Filters beyond the primary tabs collapse behind a filter icon with a
  badge dot, so the list is what a screen lands on.
- List group headings are overline typography in disabled color; type and
  status markers are small outlined uppercase chips.

## Color

- **Cyan** (`primary`) - interactive elements, key data values, selected
  states.
- **Lime** (`tertiary`) - the one primary call to action of a flow.
- **Signal colors** (green / orange / red) are reserved for water levels and
  never used decoratively.
- **Map feature markers** use the Okabe-Ito colorblind-safe palette.
- **Hover keeps the element's color** and raises brightness slightly; it never
  switches to a darker token.
- Exception: map markers and overlays may carry a subtle drop shadow - it is
  load-bearing for legibility over aerial tiles, not decoration.
- No hex values in components: all color comes from the tokens in
  `frontend/src/lib/theme.ts`, component-wide rules from the theme's
  `styleOverrides` in the same file.
