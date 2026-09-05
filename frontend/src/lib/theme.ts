import { createTheme } from "@mui/material/styles";

// Extend MUI Theme so components can access tokens via theme.tokens
declare module "@mui/material/styles" {
  interface Theme {
    tokens: typeof tokens;
  }
  interface ThemeOptions {
    tokens?: Partial<typeof tokens>;
  }
}

// Design tokens from stitch_whitewater
const tokens = {
  // Surfaces
  surfaceLowest: "#0c0e10",
  surfaceLow: "#1a1c1e",
  surface: "#1e2022",
  surfaceHigh: "#282a2c",
  surfaceHighest: "#333537",
  surfaceBright: "#37393b",

  // Text
  onSurface: "#e2e2e5",
  onSurfaceVariant: "#bfc8ca",

  // Primary - cyan, used for key data values and interactive elements
  primary: "#8bd1e8",
  onPrimary: "#003642",
  primaryContainer: "#004b5b",
  onPrimaryContainer: "#75bbd1",

  // Success - muted green (exposed as palette.success; palette.secondary
  // is the lime CTA, an entirely different color - see the palette block)
  success: "#b0ceb8",
  successContainer: "#354f3e",
  onSuccessContainer: "#a2bfaa",

  // Tertiary - lime/yellow-green, used for CTA buttons, active states, selection
  tertiary: "#c2cf47",
  tertiaryFixed: "#dfec60",
  tertiaryContainer: "#424800",
  onTertiaryContainer: "#adba33",

  // Error
  error: "#ffb4ab",
  errorContainer: "#93000a",

  // Borders
  outline: "#8a9295",
  outlineVariant: "#40484a",

  // Base
  background: "#121416",
  white: "#ffffff",
  // Text on tertiary (CTA) surfaces
  onTertiary: "#1a1d00",
  // Text on success surfaces - dark green, M3 onSecondary
  onSuccess: "#1c3524",

  // Water levels: one entry per level. `marker` is the saturated hue for
  // map geometry; `text`/`bg` are the readable pair for chips and labels -
  // the marker hues fail AA as small text on dark surfaces, so labels must
  // never borrow them.
  levels: {
    empty: {
      label: "E",
      marker: "#9eaab0",
      text: "rgba(255,255,255,0.35)",
      bg: "transparent",
      border: "rgba(255,255,255,0.18)",
    },
    low: {
      label: "L",
      marker: "#4caf50",
      text: "#81c784",
      bg: "rgba(129,199,132,0.15)",
    },
    medium: {
      label: "M",
      marker: "#ff9800",
      text: "#ffb74d",
      bg: "rgba(255,183,77,0.15)",
    },
    high: {
      label: "H",
      marker: "#f44336",
      text: "#e57373",
      bg: "rgba(229,115,115,0.15)",
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
    bridge: "#bfc8ca",
  },

  // Put-in / take-out picking (same hues as featureColors.put_in/take_out)
  putIn: "#0072B2",
  takeOut: "#D55E00",

  // Map rendering
  mapSectionLine: "#29b6f6",
  mapSectionLineCasing: "#0a1a2e",
  // Selection is lime everywhere (action.selected, list rows) - the old
  // orange collided with the medium water level. Value = tertiaryFixed.
  mapSelectedLine: "#dfec60",
  mapAreaCircle: "#1976d2",
  mapLabelHalo: "rgb(21, 37, 52)",
  // Country borders on the region browse map. Drawn over everything with a
  // pale casing under a dark line, so the border reads on the light base map
  // and on satellite imagery alike.
  mapCountryBorder: "#101418",
  mapCountryBorderCasing: "#f2f4f6",

  // Region browse layer. Neighbouring regions take different entries so the
  // eye can tell where one ends, the way an atlas colours countries. Okabe
  // and Ito hues like featureColors, minus the yellow (too close to the
  // selection lime) - six is what a busy alpine viewport needs.
  mapRegionPalette: [
    "#0072B2",
    "#D55E00",
    "#009E73",
    "#CC79A7",
    "#E69F00",
    "#56B4E9",
  ],

  // Charts
  chartSeries: "#1a8ca0",
  chartGrid: "rgba(255,255,255,0.06)",
} as const;

/** Font stacks used across the app. */
export const fonts = {
  label: '"Space Grotesk", sans-serif',
  body: '"Inter", sans-serif',
  mono: '"Space Mono", "Courier New", monospace',
} as const;

export const theme = createTheme({
  tokens,
  palette: {
    mode: "dark",
    primary: {
      main: tokens.primary,
      dark: tokens.primaryContainer,
      contrastText: tokens.onPrimary,
    },
    // Tertiary (lime) is the CTA / action color → map to secondary so
    // `variant="contained" color="secondary"` gives the lime button.
    secondary: {
      main: tokens.tertiary,
      light: tokens.tertiaryFixed,
      dark: tokens.onTertiaryContainer,
      contrastText: tokens.onTertiary,
    },
    error: {
      main: tokens.error,
      dark: tokens.errorContainer,
    },
    // Amber for pending/incomplete states, aligned with the medium water
    // level so the app has one orange, not MUI's stock one.
    warning: {
      main: tokens.levels.medium.marker,
    },
    success: {
      main: tokens.success,
      dark: tokens.successContainer,
      // Light-on-light was illegible on contained success buttons
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
      active: tokens.primary,
      hover: "rgba(139, 209, 232, 0.08)",
      selected: "rgba(194, 207, 71, 0.16)",
      selectedOpacity: 0.16,
      focus: "rgba(139, 209, 232, 0.12)",
    },
  },

  shape: {
    // Sharp, technical aesthetic - no border radius
    borderRadius: 0,
  },

  typography: {
    fontFamily: '"Inter", "Space Grotesk", system-ui, sans-serif',
    h1: {
      fontFamily: fonts.label,
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontFamily: fonts.label,
      fontWeight: 700,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontFamily: fonts.label,
      fontWeight: 700,
    },
    h4: {
      fontFamily: fonts.label,
      fontWeight: 700,
    },
    h5: {
      fontFamily: fonts.label,
      fontWeight: 600,
    },
    h6: {
      fontFamily: fonts.label,
      fontWeight: 600,
    },
    subtitle1: {
      fontFamily: fonts.label,
      fontWeight: 500,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      fontSize: "0.75rem",
    },
    subtitle2: {
      fontFamily: fonts.label,
      fontWeight: 500,
      letterSpacing: "0.04em",
      fontSize: "0.6875rem",
    },
    body1: {
      fontFamily: '"Inter", sans-serif',
    },
    body2: {
      fontFamily: '"Inter", sans-serif',
      fontSize: "0.8125rem",
    },
    overline: {
      fontFamily: fonts.label,
      letterSpacing: "0.12em",
      fontWeight: 500,
    },
    caption: {
      fontFamily: fonts.label,
      letterSpacing: "0.06em",
      color: tokens.outline,
    },
    button: {
      fontFamily: fonts.label,
      fontWeight: 700,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: tokens.background,
          scrollbarColor: `${tokens.outlineVariant} ${tokens.surfaceLowest}`,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-track": { background: tokens.surfaceLowest },
          "&::-webkit-scrollbar-thumb": { background: tokens.outlineVariant },
        },
        // MapLibre's zoom/compass controls, restyled to match the app's own
        // map controls (LabelModeToggle): dark, square, bordered.
        ".maplibregl-ctrl.maplibregl-ctrl-group": {
          backgroundColor: tokens.surface,
          border: `1px solid ${tokens.outlineVariant}`,
          borderRadius: 0,
          boxShadow: "none",
        },
        ".maplibregl-ctrl-group button": {
          borderRadius: 0,
          "&:hover": { backgroundColor: tokens.surfaceHighest },
          "& + button": { borderTop: `1px solid ${tokens.outlineVariant}` },
        },
        // Stock icons are dark-on-light; invert for the dark surface while
        // keeping the compass needle's hue.
        ".maplibregl-ctrl button .maplibregl-ctrl-icon": {
          filter: "invert(1) hue-rotate(180deg)",
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: tokens.surfaceLowest,
          borderBottom: `2px solid ${tokens.outlineVariant}`,
          backgroundImage: "none",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.surfaceLowest,
          borderRight: `2px solid ${tokens.outlineVariant}`,
          backgroundImage: "none",
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: `1px solid ${tokens.outlineVariant}`,
        },
        // elevation 0 = surface-container, no extra border noise
        elevation0: {
          border: "none",
        },
      },
    },

    MuiCard: {
      defaultProps: { elevation: 1 },
      styleOverrides: {
        root: {
          backgroundColor: tokens.surface,
          border: `1px solid ${tokens.outlineVariant}`,
          backgroundImage: "none",
        },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: false },
      styleOverrides: {
        root: {
          borderRadius: 0,
          letterSpacing: "0.1em",
          fontFamily: fonts.label,
          fontWeight: 700,
          textTransform: "uppercase",
          transition: "none",
        },
        contained: {
          "&:hover": { filter: "brightness(1.1)" },
        },
        outlined: {
          borderWidth: 1,
          "&:hover": { borderWidth: 1 },
        },
      },
    },

    MuiFab: {
      styleOverrides: {
        primary: {
          "&:hover": {
            backgroundColor: tokens.primary,
            filter: "brightness(1.1)",
          },
        },
      },
    },

    MuiSpeedDialAction: {
      styleOverrides: {
        fab: {
          backgroundColor: tokens.surfaceHighest,
          color: tokens.onSurface,
          border: `1px solid ${tokens.outline}`,
          "&:hover": {
            backgroundColor: tokens.surfaceHighest,
            filter: "brightness(1.2)",
          },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontFamily: fonts.label,
          fontWeight: 700,
          fontSize: "0.6875rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          height: 24,
        },
      },
    },

    MuiTextField: {
      defaultProps: { variant: "outlined" },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          backgroundColor: tokens.surfaceLow,
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
      styleOverrides: {
        root: {
          fontFamily: fonts.label,
          fontSize: "0.75rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
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
          "&.Mui-selected": {
            backgroundColor: tokens.surfaceHigh,
            color: tokens.tertiary,
            borderLeft: `4px solid ${tokens.tertiary}`,
            "&:hover": { backgroundColor: tokens.surfaceHigh },
          },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 0,
          backgroundColor: tokens.surfaceHighest,
          border: `1px solid ${tokens.outlineVariant}`,
          fontFamily: fonts.label,
          fontSize: "0.6875rem",
          letterSpacing: "0.05em",
        },
      },
    },

    // Inline alerts read as an inset note, not a pastel banner: square,
    // compact, dark ground, with the severity carried by the icon and a
    // tinted border. Layout lives on the root so the filled variant (the
    // global error snackbar) keeps its solid background.
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          padding: "6px 10px",
          fontSize: "0.75rem",
          lineHeight: 1.5,
          alignItems: "center",
        },
        icon: {
          padding: 0,
          marginRight: 8,
          fontSize: "1rem",
          opacity: 1,
        },
        message: { padding: 0, minWidth: 0 },
        action: { padding: 0, marginRight: 0, alignItems: "center" },
        standard: {
          backgroundColor: tokens.surfaceLow,
          color: tokens.onSurface,
          "&.MuiAlert-colorError": {
            border: `1px solid ${tokens.error}55`,
            "& .MuiAlert-icon": { color: tokens.error },
          },
          "&.MuiAlert-colorWarning": {
            border: `1px solid ${tokens.levels.medium.marker}55`,
            "& .MuiAlert-icon": { color: tokens.levels.medium.marker },
          },
          "&.MuiAlert-colorSuccess": {
            border: `1px solid ${tokens.success}55`,
            "& .MuiAlert-icon": { color: tokens.success },
          },
          "&.MuiAlert-colorInfo": {
            border: `1px solid ${tokens.primary}55`,
            "& .MuiAlert-icon": { color: tokens.primary },
          },
        },
        // In dark mode MUI fills with palette[color].dark but takes the text
        // colour from palette[color].main - for us a dark red ground under
        // near-black text. Each pairing is set here instead.
        filled: {
          "& .MuiAlert-action .MuiIconButton-root": { color: "inherit" },
          "&.MuiAlert-colorError": {
            backgroundColor: tokens.errorContainer,
            color: tokens.white,
          },
          "&.MuiAlert-colorWarning": {
            backgroundColor: tokens.levels.medium.marker,
            color: tokens.background,
          },
          "&.MuiAlert-colorSuccess": {
            backgroundColor: tokens.successContainer,
            color: tokens.onSurface,
          },
          "&.MuiAlert-colorInfo": {
            backgroundColor: tokens.primaryContainer,
            color: tokens.onSurface,
          },
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 0 },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        head: {
          fontFamily: fonts.label,
          fontWeight: 700,
          fontSize: "0.6875rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: tokens.onSurfaceVariant,
          borderBottom: `2px solid ${tokens.outlineVariant}`,
        },
        root: {
          borderBottom: `1px solid ${tokens.outlineVariant}`,
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: { borderRadius: 0 },
        // A dot is a dot - circles are part of the language, square ones
        // read as a stray block next to the icon.
        dot: { borderRadius: "50%" },
      },
    },
  },
});

/** The only alpha suffixes to append to a token (\`\${token}\${alphas.x}\`):
 * tint for row washes, wash for selected grounds, hover on top of them,
 * hairline for rules, border for control outlines, scrim over imagery. */
export const alphas = {
  tint: "0d",
  wash: "14",
  hover: "1f",
  hairline: "55",
  border: "99",
  scrim: "cc",
} as const;

/** The app's standard small uppercase label. Spread into sx and override
 * size or color where a variant is needed. */
export const labelSx = {
  fontFamily: fonts.label,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: "0.625rem",
  color: "text.secondary",
} as const;
