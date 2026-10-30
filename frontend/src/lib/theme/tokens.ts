// Design tokens for the calm design (doc/design.md). The names follow the
// Material 3 roles the app already used, so a value change re-skins every
// consumer; only the new groups at the end (radii, elevation, motion, touch)
// are additions.
const teal = "#0e7490";
const error = "#b4373f";
const orange = "#D55E00";
const blue = "#0072B2";
const amber = "#C48800";
const appBarHeight = 56;

export const lightTokens = {
  // Surfaces: the ground is the grey every screen sits on, a surface is a
  // white card on it, surfaceHigh a quiet inset inside a card.
  surfaceLowest: "#ffffff",
  surfaceLow: "#eef2f3",
  surface: "#ffffff",
  surfaceHigh: "#f6f8f9",
  surfaceHighest: "#e7edef",
  surfaceBright: "#ffffff",

  // Text
  onSurface: "#1f2b31",
  onSurfaceVariant: "#58666d",

  // Primary - teal: the one accent. Interactive elements, the selected
  // state, the primary call to action of a flow.
  primary: teal,
  onPrimary: "#ffffff",
  primaryDark: "#0b5d74",
  primaryContainer: "#e0f2f6",
  onPrimaryContainer: "#0b5d74",
  // Solid accent fills (contained button, FAB, round action, numbered discs)
  // with their hover step and `onPrimary` text. Dark softens the fill so the
  // call to action does not outshine the content; `primary` stays the
  // bright accent for text, rings and lines.
  primaryFill: teal,
  primaryFillHover: "#0b5d74",

  // Success - the calm "low" green, also palette.success
  success: "#1d6b4f",
  successContainer: "#d9eee5",
  onSuccessContainer: "#154f3a",
  onSuccess: "#ffffff",

  // Error
  error,
  errorDark: "#8e2b32",
  errorContainer: "#f7dcde",
  // A solid error fill (contained button, high-water chip) and its hover,
  // always under white text. Dark is a deeper red than the `error` text hue.
  errorFill: error,
  errorFillHover: "#8e2b32",
  onErrorFill: "#ffffff",
  // Text and icons on a solid error or warning fill.
  onError: "#ffffff",

  // Borders
  outline: "#7c8a90",
  outlineVariant: "#dde4e7",
  // The edge of an outlined button or tile: a hairline in light, and in dark
  // the 3:1 outline, since a hairline vanishes on a dark surface.
  outlineControl: "#dde4e7",
  // The selected segment of a segmented control: raised above its track.
  segmentThumb: "#ffffff",
  // The thumb of a switch that is off.
  switchThumb: "#ffffff",
  // The wash behind a sheet or dialog: ink in light, black in dark.
  scrimBase: "#1f2b31",

  // Base
  background: "#eef2f3",
  white: "#ffffff",

  // Water levels: one entry per level. `marker` is the saturated hue for
  // map geometry; `text`/`bg` are the readable pair for chips and labels.
  // Low and medium are a coloured label on a wash of the same hue; high is
  // a solid fill with white text, so it stays the loudest thing on a row.
  levels: {
    empty: {
      label: "E",
      marker: "#89969d",
      text: "#5b676e",
      bg: "transparent",
      border: "rgba(91,103,110,0.45)",
    },
    low: {
      label: "L",
      marker: "#2f9e63",
      text: "#1d6b4f",
      bg: "rgba(29,107,79,0.13)",
    },
    medium: {
      label: "M",
      marker: "#d57f00",
      text: "#855400",
      bg: "rgba(133,84,0,0.15)",
    },
    high: {
      label: "H",
      marker: "#e5483f",
      text: "#ffffff",
      bg: error,
      // The same hue as ink on the plain ground (a chart line, a word).
      ink: error,
    },
  },

  // Feature markers on the map (Okabe-Ito palette - colorblind safe)
  featureColors: {
    whitewater: "#CC79A7",
    rapid: "#009E73",
    hole: orange,
    siphon: orange,
    strainer: orange,
    waterfall: "#1F9CE2",
    freestyle_spot: "#A0960D",
    put_in: blue,
    take_out: orange,
    portage: amber,
    weir: amber,
    dam: amber,
    obstacle: "#CC79A7",
    bridge: "#58666d",
  },

  // Put-in / take-out picking (same hues as featureColors.put_in/take_out)
  putIn: blue,
  takeOut: orange,

  // Map rendering. The base map is light: labels are ink on a white halo,
  // the selected line is the accent, sections are a clear blue.
  mapSectionLine: "#2b88c8",
  mapSectionLineCasing: "#ffffff",
  mapSelectedLine: teal,
  // A section drawn as the subject of a screen, and one drawn only as context.
  mapSectionHighlight: teal,
  mapSectionGhost: "#c4d3dc",
  mapAreaCircle: teal,
  mapLabelText: "#1f2b31",
  mapLabelHalo: "#ffffff",
  // Country borders on the region browse map. Drawn over everything with a
  // pale casing under a dark line, so the border reads on the light base map
  // and on satellite imagery alike.
  mapCountryBorder: "#3a454b",
  mapCountryBorderCasing: "#ffffff",
  // The calm base map: warm ground, soft greens, pale water. Rivers and
  // sections share the pale blue so the teal selection is the one accent.
  mapGround: "#f3f2ec",
  mapGreen: "#e3ebd6",
  mapWater: "#d3e5f0",
  mapRiver: "#b5d5ec",
  mapRoad: "#dcd8cb",
  // Gauge coverage: the tracked share is a deeper blue than the sections.
  gaugeTracked: "#236d98",
  gaugeUntracked: "#9aa5aa",

  // Region browse layer. Neighbouring regions take different entries so the
  // eye can tell where one ends, the way an atlas colours countries. Okabe
  // and Ito hues like featureColors. The region-map rework replaces this
  // with one neutral line; until then it stays.
  mapRegionPalette: [blue, orange, "#009E73", "#CC79A7", "#E69F00", "#56B4E9"],

  // Charts
  chartSeries: teal,
  chartGrid: "rgba(31,43,49,0.08)",

  // Corner radii in px: small chips and tags, a segment inside a segmented
  // control, buttons and inputs, range bands
  // and selected rows, cards, sheets and the FAB, dialogs, and the pill for
  // chips and pills.
  radii: {
    bar: 3,
    xs: 6,
    segment: 8,
    sm: 10,
    row: 12,
    md: 14,
    lg: 16,
    xl: 20,
    pill: 999,
  },

  // Elevation steps: a card at rest, a floating panel or popover, the accent
  // glow under the primary action, and the shadow under a map marker.
  elevation: {
    e1: "0 1px 2px rgba(31,43,49,0.08), 0 1px 1px rgba(31,43,49,0.04)",
    e2: "0 8px 24px rgba(31,43,49,0.12), 0 2px 6px rgba(31,43,49,0.08)",
    e3: "0 4px 14px rgba(14,116,144,0.251)",
    // The legibility halo under a map marker or label sitting on imagery.
    marker: "0 1px 4px rgba(0,0,0,0.5)",
    // The same halo with a ring, for the selected marker.
    markerRaised: "0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.6)",
  },

  // Motion: the scale from the motion notes. Arrivals ease out, travel
  // between resting places eases in and out, exits ease in. Anything the
  // user waits on stays under `slow`.
  motion: {
    instant: 90,
    fast: 160,
    base: 260,
    slow: 360,
    // How long a spinner waits before it shows, and the cross-fade that
    // replaces movement under reduced motion.
    spinnerDelay: 150,
    reducedFade: 140,
    // The beat an arriving element waits for the leaving one to clear.
    lead: 60,
    easeOut: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    easeIn: "cubic-bezier(0.4, 0, 1, 1)",
    // Sheets only: a small overshoot as they settle.
    easeSettle: "cubic-bezier(0.22, 0.9, 0.28, 1.02)",
  },

  // Touch: every target is at least `min` px, list rows and tabs `row`.
  touch: { min: 44, row: 48 },

  // Chrome: the desktop app bar and the phone bottom nav (before the safe
  // area), the one place these heights are said.
  chrome: { appBar: appBarHeight, bottomNav: 64 },

  // Canvas: from `md` up the map fills the window under the app bar and the
  // content floats in cards over it. Card widths are a share of the window
  // clamped to a range; a resizable card may be dragged within `resize`. All
  // expanded cards together cover at most `coverMax` of the width. The reading
  // rail is `dock.vh` of the window height clamped to the dock range, from
  // `dock.from` wide and `dock.minWindowHeight` tall; otherwise the chart is the
  // detail card's first block.
  canvas: {
    margin: 16,
    freeMargin: 32,
    // One detail card (the map page) may cover 55%; with a list card beside
    // the open item the cards may cover 70%.
    coverMax: 0.55,
    coverMaxList: 0.7,
    sideMaxFrac: 0.45,
    freeMin: { w: 240, h: 200 },
    headerHeight: appBarHeight,
    // The resize tab on a card's edge: 14 x 48 to look at, 44 x 64 to hit.
    gripHit: { w: 44, h: 64 },
    gripBar: { w: 14, h: 48 },
    // The section panel's spacing system: 8 between the card ground and a
    // card, 16 inside a card, text on a 24 line, hit boxes end 12 from the
    // edge, rows 56, a header of 56 + 48.
    panel: {
      gutter: 8,
      inner: 16,
      line: 24,
      hitEdge: 12,
      row: 56,
      headerRow: appBarHeight,
      tabRow: 48,
    },
    dock: { min: 184, max: 248, vh: 0.22, from: 1280, minWindowHeight: 600 },
    cards: {
      detail: {
        frac: 0.26,
        min: 340,
        max: 440,
        // Under `dock.from` the card is this wide (no rail beside it).
        narrow: 360,
        priority: 3,
        // The card never takes more than `maxPx`, nor leaves the rail's
        // plot less than `minPlot`.
        resize: { min: 340, maxFrac: 0.45, maxPx: 560, minPlot: 480 },
      },
      list: { frac: 0.2, min: 300, max: 380, priority: 1, resize: null },
      side: { frac: 0.25, min: 400, max: 600, priority: 2, resize: null },
    },
  },

  // The phone grid (below `md`), the counterpart of `canvas.panel`: a card
  // sits `edge` from the screen edge and 8 from the next card, text sits
  // `inner` inside it, so every text starts on `line` (edge + inner) and every
  // value ends `line` from the right edge. A screen without cards uses the
  // same line. A row's icon is `icon` wide with `iconGap` after it, so names
  // start at `nameLine`. A trailing control is a 44 box whose 24px icon ends on
  // the right line (`trailInset` hangs the box out past the text). A scrolling
  // list ends with `fabRoom` (FAB 56 + 16 above it + 16 below).
  phone: {
    edge: 12,
    gap: 8,
    inner: 16,
    line: 28,
    icon: 28,
    iconGap: 12,
    nameLine: 68,
    trailInset: 10,
    fabRoom: 88,
  },
} as const;

export type Scheme = "light" | "dark";

/** `as const` pins every literal; widen strings and numbers (recursively,
 * keeping readonly) so a second palette has the same shape. */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends object
      ? { [K in keyof T]: Widen<T[K]> }
      : T;

export type Tokens = Widen<typeof lightTokens>;
