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

  // Secondary - muted green
  secondary: "#b0ceb8",
  secondaryContainer: "#354f3e",
  onSecondaryContainer: "#a2bfaa",

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

  // Water levels
  waterEmpty:  { label: "E", color: "rgba(255,255,255,0.35)", bgcolor: "transparent",             border: "rgba(255,255,255,0.18)" },
  waterLow:    { label: "L", color: "#81c784",                bgcolor: "rgba(129,199,132,0.15)" },
  waterMedium: { label: "M", color: "#ffb74d",                bgcolor: "rgba(255,183,77,0.15)"  },
  waterHigh:   { label: "H", color: "#e57373",                bgcolor: "rgba(229,115,115,0.15)" },
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
      contrastText: "#1a1d00",
    },
    error: {
      main: tokens.error,
      dark: tokens.errorContainer,
    },
    success: {
      main: tokens.secondary,
      dark: tokens.secondaryContainer,
      contrastText: tokens.onSecondaryContainer,
    },
    background: {
      default: "#121416",
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
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
    },
    h4: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
    },
    h5: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 600,
    },
    h6: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 600,
    },
    subtitle1: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 500,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      fontSize: "0.75rem",
    },
    subtitle2: {
      fontFamily: '"Space Grotesk", sans-serif',
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
      fontFamily: '"Space Grotesk", sans-serif',
      letterSpacing: "0.12em",
      fontWeight: 500,
    },
    caption: {
      fontFamily: '"Space Grotesk", sans-serif',
      letterSpacing: "0.06em",
      color: tokens.outline,
    },
    button: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#121416",
          scrollbarColor: `${tokens.outlineVariant} ${tokens.surfaceLowest}`,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-track": { background: tokens.surfaceLowest },
          "&::-webkit-scrollbar-thumb": { background: tokens.outlineVariant },
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
          fontFamily: '"Space Grotesk", sans-serif',
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

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontFamily: '"Space Grotesk", sans-serif',
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
          fontFamily: '"Space Grotesk", sans-serif',
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
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: "0.6875rem",
          letterSpacing: "0.05em",
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 0 },
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
          fontFamily: '"Space Grotesk", sans-serif',
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
      },
    },
  },
});

/** Font stacks used across the app. */
export const fonts = {
  label: '"Space Grotesk", sans-serif',
  body: '"Inter", sans-serif',
  mono: '"Space Mono", "Courier New", monospace',
} as const;
