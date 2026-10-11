import { createTheme, type Shadows } from "@mui/material/styles";

// Extend MUI Theme so components can access tokens via theme.tokens
declare module "@mui/material/styles" {
  interface Theme {
    tokens: typeof tokens;
  }
  interface ThemeOptions {
    tokens?: Partial<typeof tokens>;
  }
}

// Design tokens for the calm design (doc/design.md). The names follow the
// Material 3 roles the app already used, so a value change re-skins every
// consumer; only the new groups at the end (radii, elevation, motion, touch)
// are additions.
const tokens = {
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
  primary: "#0e7490",
  onPrimary: "#ffffff",
  primaryDark: "#0b5d74",
  primaryContainer: "#d9edf2",
  onPrimaryContainer: "#0b5d74",

  // Success - the calm "low" green, also palette.success
  success: "#1d6b4f",
  successContainer: "#d9eee5",
  onSuccessContainer: "#154f3a",
  onSuccess: "#ffffff",

  // Tertiary: the lime call to action is gone, the accent does that job now.
  // The keys stay so existing consumers keep resolving.
  tertiary: "#0e7490",
  tertiaryFixed: "#0e7490",
  tertiaryContainer: "#d9edf2",
  onTertiaryContainer: "#0b5d74",
  onTertiary: "#ffffff",

  // Error
  error: "#b4373f",
  errorContainer: "#f7dcde",

  // Borders
  outline: "#7c8a90",
  outlineVariant: "#dde4e7",

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
      marker: "#9aa5ab",
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
      marker: "#ff9800",
      text: "#8f5b00",
      bg: "rgba(143,91,0,0.15)",
    },
    high: {
      label: "H",
      marker: "#e5483f",
      text: "#ffffff",
      bg: "#b4373f",
    },
  },

  // Feature markers on the map (Okabe-Ito palette - colorblind safe)
  featureColors: {
    whitewater: "#CC79A7",
    rapid: "#009E73",
    hole: "#D55E00",
    siphon: "#D55E00",
    strainer: "#D55E00",
    waterfall: "#56B4E9",
    freestyle_spot: "#F0E442",
    put_in: "#0072B2",
    take_out: "#D55E00",
    portage: "#E69F00",
    weir: "#E69F00",
    dam: "#E69F00",
    obstacle: "#CC79A7",
    bridge: "#58666d",
  },

  // Put-in / take-out picking (same hues as featureColors.put_in/take_out)
  putIn: "#0072B2",
  takeOut: "#D55E00",

  // Map rendering. The base map is light: labels are ink on a white halo,
  // the selected line is the accent, sections are a clear blue.
  mapSectionLine: "#2b88c8",
  mapSectionLineCasing: "#ffffff",
  mapSelectedLine: "#0e7490",
  mapAreaCircle: "#0e7490",
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
  // Gauge coverage: the tracked share is a deeper blue than the sections.
  gaugeTracked: "#236d98",
  gaugeUntracked: "#9aa5aa",

  // Region browse layer. Neighbouring regions take different entries so the
  // eye can tell where one ends, the way an atlas colours countries. Okabe
  // and Ito hues like featureColors. The region-map rework replaces this
  // with one neutral line; until then it stays.
  mapRegionPalette: [
    "#0072B2",
    "#D55E00",
    "#009E73",
    "#CC79A7",
    "#E69F00",
    "#56B4E9",
  ],

  // Charts
  chartSeries: "#0e7490",
  chartGrid: "rgba(31,43,49,0.08)",

  // Corner radii in px: small chips and tags, buttons and inputs, cards,
  // sheets and the FAB, dialogs, and the pill for chips and pills.
  radii: { xs: 6, sm: 10, md: 14, lg: 16, xl: 20, pill: 999 },

  // Three elevation steps: a card at rest, a floating panel or popover, and
  // the accent glow under the primary action.
  elevation: {
    e1: "0 1px 2px rgba(31,43,49,0.08), 0 1px 1px rgba(31,43,49,0.04)",
    e2: "0 8px 24px rgba(31,43,49,0.12), 0 2px 6px rgba(31,43,49,0.08)",
    e3: "0 4px 14px rgba(14,116,144,0.25)",
  },

  // Motion: the scale from the motion notes. Arrivals ease out, travel
  // between resting places eases in and out, exits ease in. Anything the
  // user waits on stays under `slow`.
  motion: {
    instant: 90,
    fast: 160,
    base: 260,
    slow: 360,
    easeOut: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    easeIn: "cubic-bezier(0.4, 0, 1, 1)",
  },

  // Touch: every target is at least `min` px, list rows and tabs `row`.
  touch: { min: 44, row: 48 },

  // Chrome: the desktop app bar and the phone bottom nav (before the safe
  // area), the one place these heights are said.
  chrome: { appBar: 56, bottomNav: 64 },
} as const;

/** Font stacks used across the app: one family, weights carry the hierarchy. */
export const fonts = {
  label: '"Figtree Variable", "Figtree", system-ui, sans-serif',
  body: '"Figtree Variable", "Figtree", system-ui, sans-serif',
  // No monospace in the calm language; numbers use tabular figures instead.
  mono: '"Figtree Variable", "Figtree", system-ui, sans-serif',
} as const;

const { radii, elevation, motion } = tokens;

/** MUI draws elevation 1 as the card step and everything above as the
 * floating step, so a Paper never invents a shadow of its own. */
const shadows = [
  "none",
  elevation.e1,
  ...Array.from({ length: 23 }, () => elevation.e2),
] as unknown as Shadows;

/** The only alpha suffixes to append to a token (\`\${token}\${alphas.x}\`):
 * tint for row washes, wash for selected grounds, hover on top of them,
 * strong for an avatar tile,
 * hairline for rules, border for control outlines, scrim over imagery. */
export const alphas = {
  tint: "0d",
  wash: "14",
  hover: "1f",
  strong: "2e",
  hairline: "55",
  border: "99",
  scrim: "cc",
} as const;

export const theme = createTheme({
  tokens,
  // `md` is the one switch between the phone layout and the two-pane desktop
  // one, so it sits where the split first fits rather than at MUI's 900:
  // a 320px list plus a readable detail beside it. Tablet portrait and a
  // half-screen laptop window both land above it. The rest are MUI's.
  breakpoints: {
    values: { xs: 0, sm: 600, md: 768, lg: 1200, xl: 1536 },
  },
  palette: {
    mode: "light",
    primary: {
      main: tokens.primary,
      dark: tokens.primaryDark,
      contrastText: tokens.onPrimary,
    },
    // The accent is also the call to action now, so `color="secondary"`
    // still resolves; it is the same teal.
    secondary: {
      main: tokens.tertiary,
      dark: tokens.primaryDark,
      contrastText: tokens.onTertiary,
    },
    error: {
      main: tokens.error,
      dark: "#8e2b32",
      contrastText: tokens.white,
    },
    // Amber for pending/incomplete states, aligned with the medium water
    // level so the app has one orange, not MUI's stock one.
    warning: {
      main: tokens.levels.medium.text,
      contrastText: tokens.white,
    },
    success: {
      main: tokens.success,
      dark: tokens.onSuccessContainer,
      contrastText: tokens.onSuccess,
    },
    background: {
      default: tokens.background,
      paper: tokens.surface,
    },
    text: {
      primary: tokens.onSurface,
      secondary: tokens.onSurfaceVariant,
      disabled: tokens.outline,
    },
    divider: tokens.outlineVariant,
    action: {
      active: tokens.onSurfaceVariant,
      hover: "rgba(14, 116, 144, 0.08)",
      selected: "rgba(14, 116, 144, 0.12)",
      selectedOpacity: 0.12,
      focus: "rgba(14, 116, 144, 0.12)",
    },
  },

  shape: { borderRadius: radii.md },
  shadows,

  transitions: {
    duration: {
      shortest: motion.instant,
      shorter: motion.fast,
      short: motion.fast,
      standard: motion.base,
      complex: motion.slow,
      enteringScreen: motion.base,
      leavingScreen: 180,
    },
    easing: {
      easeInOut: motion.easeInOut,
      easeOut: motion.easeOut,
      easeIn: motion.easeIn,
      sharp: "cubic-bezier(0.4, 0, 0.6, 1)",
    },
  },

  typography: {
    fontFamily: fonts.body,
    h1: {
      fontWeight: 700,
      fontSize: "1.625rem",
      lineHeight: 1.2,
      letterSpacing: "-0.015em",
    },
    h2: {
      fontWeight: 700,
      fontSize: "1.375rem",
      lineHeight: 1.25,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontWeight: 700,
      fontSize: "1.25rem",
      lineHeight: 1.3,
      letterSpacing: "-0.01em",
    },
    h4: { fontWeight: 700, fontSize: "1.125rem", lineHeight: 1.33 },
    h5: { fontWeight: 600, fontSize: "1.0625rem", lineHeight: 1.3 },
    h6: { fontWeight: 600, fontSize: "1rem", lineHeight: 1.25 },
    subtitle1: { fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.33 },
    subtitle2: { fontWeight: 600, fontSize: "0.8125rem", lineHeight: 1.38 },
    body1: { fontSize: "0.9375rem", lineHeight: 1.33 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.38 },
    overline: {
      fontWeight: 600,
      fontSize: "0.75rem",
      lineHeight: 1.33,
      letterSpacing: "0.02em",
      textTransform: "none",
    },
    caption: { fontSize: "0.75rem", lineHeight: 1.33, letterSpacing: 0 },
    button: {
      fontWeight: 600,
      fontSize: "0.875rem",
      letterSpacing: 0,
      textTransform: "none",
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: tokens.background,
          fontVariantNumeric: "tabular-nums",
          scrollbarColor: `${tokens.outline} transparent`,
          "&::-webkit-scrollbar": { width: 8 },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            background: tokens.outlineVariant,
            borderRadius: radii.pill,
          },
        },
        "*:focus-visible": {
          outline: `2px solid ${tokens.primary}`,
          outlineOffset: 2,
        },
        // Motion off for people who ask for it. A per-app switch that wins
        // over this comes with the motion work. An element that sets
        // `data-reduced-fade` keeps its own short fade.
        "@media (prefers-reduced-motion: reduce)": {
          "*:not([data-reduced-fade]), *::before, *::after": {
            animationDuration: "1ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "1ms !important",
            scrollBehavior: "auto !important",
          },
        },
        // MapLibre's zoom/compass controls, restyled to match the app's own
        // map controls: a white floating group with the floating shadow.
        ".maplibregl-ctrl.maplibregl-ctrl-group": {
          backgroundColor: tokens.surface,
          border: "none",
          borderRadius: radii.sm + 2,
          boxShadow: elevation.e2,
          overflow: "hidden",
        },
        ".maplibregl-ctrl-group button": {
          width: tokens.touch.min,
          height: tokens.touch.min,
          borderRadius: 0,
          "&:hover": { backgroundColor: tokens.surfaceHigh },
          "& + button": { borderTop: `1px solid ${tokens.outlineVariant}` },
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: tokens.surfaceLowest,
          color: tokens.onSurface,
          boxShadow: elevation.e1,
          backgroundImage: "none",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.surfaceLowest,
          borderRight: `1px solid ${tokens.outlineVariant}`,
          backgroundImage: "none",
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: "none" },
        rounded: { borderRadius: radii.md },
      },
    },

    MuiCard: {
      defaultProps: { elevation: 1 },
      styleOverrides: {
        root: {
          backgroundColor: tokens.surface,
          backgroundImage: "none",
          borderRadius: radii.md,
        },
      },
    },

    // No ripple: press is a wash on the row, focus a visible teal ring.
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          "&.Mui-focusVisible, &:focus-visible": {
            outline: `2px solid ${tokens.primary}`,
            outlineOffset: -2,
          },
        },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: radii.sm,
          minHeight: tokens.touch.min,
          paddingInline: 16,
          fontWeight: 600,
          textTransform: "none",
        },
        sizeSmall: { minHeight: 36, paddingInline: 12 },
        outlined: {
          borderWidth: 1,
          borderColor: tokens.outlineVariant,
          color: tokens.onSurface,
          backgroundColor: tokens.surface,
          "&:hover": { borderWidth: 1, backgroundColor: tokens.surfaceHigh },
        },
      },
      variants: [
        {
          props: { variant: "contained", color: "primary" },
          style: {
            boxShadow: elevation.e3,
            "&:hover": { boxShadow: elevation.e3 },
          },
        },
        {
          props: { variant: "contained", color: "secondary" },
          style: {
            boxShadow: elevation.e3,
            "&:hover": { boxShadow: elevation.e3 },
          },
        },
      ],
    },

    MuiIconButton: {
      styleOverrides: {
        sizeMedium: { padding: 10 },
      },
    },

    MuiFab: {
      styleOverrides: {
        root: {
          borderRadius: radii.lg,
          boxShadow: elevation.e3,
          "&:hover": { boxShadow: elevation.e3 },
        },
      },
    },

    MuiSpeedDialAction: {
      styleOverrides: {
        fab: {
          backgroundColor: tokens.surface,
          color: tokens.onSurface,
          boxShadow: elevation.e2,
          "&:hover": { backgroundColor: tokens.surfaceHigh },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          position: "relative",
          borderRadius: radii.pill,
          fontWeight: 600,
          fontSize: "0.8125rem",
          height: 32,
          // A set filter: teal ring and a wash, not just teal text.
          "&.MuiChip-outlinedPrimary": {
            backgroundColor: `${tokens.primary}${alphas.wash}`,
            borderColor: tokens.primary,
            borderWidth: 1.5,
          },
          // 32px to look at, 44px to hit.
          "&.MuiChip-clickable::after": {
            content: '""',
            position: "absolute",
            inset: "-6px -2px",
          },
        },
        sizeSmall: { height: 24, fontSize: "0.75rem" },
      },
    },

    MuiTextField: {
      defaultProps: { variant: "filled" },
    },

    MuiFormControl: {
      defaultProps: { variant: "filled" },
    },

    // The calm field: the label always sits inside at the top, the value
    // beneath it, a 1px inset line that becomes a 2px accent ring on focus.
    MuiFilledInput: {
      defaultProps: { disableUnderline: true },
      styleOverrides: {
        root: {
          borderRadius: radii.sm + 2,
          backgroundColor: tokens.surface,
          boxShadow: `inset 0 0 0 1px ${tokens.outlineVariant}`,
          overflow: "hidden",
          // 16px: anything smaller makes iOS zoom the page on focus.
          fontSize: "1rem",
          transition: `box-shadow ${motion.fast}ms ${motion.easeOut}`,
          "&:hover": {
            backgroundColor: tokens.surface,
            boxShadow: `inset 0 0 0 1px ${tokens.outline}`,
          },
          "&.Mui-focused": {
            backgroundColor: tokens.surface,
            boxShadow: `inset 0 0 0 2px ${tokens.primary}`,
          },
          "&.Mui-error": {
            boxShadow: `inset 0 0 0 1px ${tokens.error}`,
          },
          "&.Mui-error.Mui-focused": {
            boxShadow: `inset 0 0 0 2px ${tokens.error}`,
          },
          "&.Mui-disabled": { backgroundColor: tokens.surfaceHigh },
        },
        input: {
          padding: "25px 14px 8px",
          height: "auto",
          "&.MuiInputBase-inputSizeSmall": {
            paddingTop: 22,
            paddingBottom: 6,
          },
        },
        multiline: { padding: "25px 14px 8px" },
        adornedStart: { paddingLeft: 14 },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radii.sm + 2,
          backgroundColor: tokens.surface,
          fontSize: "1rem",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: tokens.outlineVariant,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: tokens.outline,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: tokens.primary,
            borderWidth: 2,
          },
        },
      },
    },

    MuiInputLabel: {
      defaultProps: { shrink: true },
      styleOverrides: {
        root: { letterSpacing: 0, textTransform: "none" },
        filled: {
          fontSize: "1rem",
          fontWeight: 500,
          color: tokens.onSurfaceVariant,
          // Pinned inside the field at 12px, never a placeholder.
          transform: "translate(14px, 7px) scale(0.75)",
          "&.Mui-focused": { color: tokens.primary },
          "&.Mui-error": { color: tokens.error },
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: tokens.outlineVariant },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          minHeight: tokens.touch.row,
          transition: `background-color ${motion.instant}ms ${motion.easeOut}`,
          "&:active": { backgroundColor: `${tokens.primary}${alphas.wash}` },
          "&.Mui-selected": {
            backgroundColor: `${tokens.primary}1f`,
            "&:hover": { backgroundColor: `${tokens.primary}29` },
          },
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: { minHeight: tokens.touch.row },
        indicator: { height: 3, borderRadius: "3px 3px 0 0" },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: tokens.touch.row,
          minWidth: 56,
          paddingInline: 4,
          fontWeight: 600,
          fontSize: "0.875rem",
          textTransform: "none",
          color: tokens.onSurfaceVariant,
          "&.Mui-selected": { color: tokens.primary },
        },
      },
    },

    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          padding: 3,
          borderRadius: radii.sm + 2,
          backgroundColor: tokens.surfaceHigh,
          boxShadow: `inset 0 0 0 1px ${tokens.outlineVariant}`,
        },
        grouped: {
          border: 0,
          margin: 0,
          borderRadius: `${radii.sm - 1}px !important`,
        },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: tokens.touch.min - 6,
          fontWeight: 600,
          textTransform: "none",
          color: tokens.onSurfaceVariant,
          "&.Mui-selected": {
            backgroundColor: tokens.surface,
            color: tokens.onSurface,
            boxShadow: elevation.e1,
            "&:hover": { backgroundColor: tokens.surface },
          },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: radii.xs + 2,
          backgroundColor: tokens.onSurface,
          color: tokens.white,
          fontSize: "0.75rem",
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: radii.xl, boxShadow: elevation.e2 },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { fontSize: "1.125rem", fontWeight: 700 },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: radii.md, boxShadow: elevation.e2 },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: { minHeight: tokens.touch.row },
      },
    },

    // Inline alerts read as a quiet note: a tinted ground with the severity
    // carried by the icon. The filled variant (the global error snackbar)
    // keeps a solid ground.
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: radii.sm + 2,
          padding: "8px 12px",
          fontSize: "0.8125rem",
          lineHeight: 1.5,
          alignItems: "center",
        },
        icon: {
          padding: 0,
          marginRight: 10,
          fontSize: "1.125rem",
          opacity: 1,
        },
        message: { padding: 0, minWidth: 0 },
        action: { padding: 0, marginRight: 0, alignItems: "center" },
        standard: {
          backgroundColor: tokens.surfaceHigh,
          color: tokens.onSurface,
          "&.MuiAlert-colorError": {
            backgroundColor: tokens.errorContainer,
            "& .MuiAlert-icon": { color: tokens.error },
          },
          "&.MuiAlert-colorWarning": {
            backgroundColor: tokens.levels.medium.bg,
            "& .MuiAlert-icon": { color: tokens.levels.medium.text },
          },
          "&.MuiAlert-colorSuccess": {
            backgroundColor: tokens.successContainer,
            "& .MuiAlert-icon": { color: tokens.success },
          },
          "&.MuiAlert-colorInfo": {
            backgroundColor: tokens.primaryContainer,
            "& .MuiAlert-icon": { color: tokens.primary },
          },
        },
        filled: {
          "& .MuiAlert-action .MuiIconButton-root": { color: "inherit" },
          "&.MuiAlert-colorError": {
            backgroundColor: tokens.error,
            color: tokens.white,
          },
          "&.MuiAlert-colorWarning": {
            backgroundColor: tokens.levels.medium.text,
            color: tokens.white,
          },
          "&.MuiAlert-colorSuccess": {
            backgroundColor: tokens.success,
            color: tokens.white,
          },
          "&.MuiAlert-colorInfo": {
            backgroundColor: tokens.primary,
            color: tokens.white,
          },
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 3 },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          fontSize: "0.75rem",
          color: tokens.onSurfaceVariant,
          borderBottom: `1px solid ${tokens.outlineVariant}`,
        },
        root: {
          borderBottom: `1px solid ${tokens.outlineVariant}`,
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        // A dot is a dot - circles are part of the language.
        dot: { borderRadius: "50%" },
      },
    },
  },
});

/** Height of a full-screen panel: the window less the desktop app bar, or
 * less the mobile bottom nav and its safe area. A panel that pins a bottom
 * bar needs a bounded height to size its scroller against. */
export const PANEL_HEIGHT = {
  xs: `calc(100dvh - ${tokens.chrome.bottomNav}px - env(safe-area-inset-bottom))`,
  md: `calc(100vh - ${tokens.chrome.appBar}px)`,
} as const;

/** Space the fixed bottom nav takes at the foot of the page. */
export const BOTTOM_NAV_SPACE = `calc(${tokens.chrome.bottomNav}px + env(safe-area-inset-bottom))`;

/** The app's standard small label: 12px, semibold, sentence case. Spread into
 * sx and override size or color where a variant is needed. */
export const labelSx = {
  fontFamily: fonts.label,
  fontWeight: 600,
  letterSpacing: 0,
  fontSize: "0.75rem",
  color: "text.secondary",
} as const;
