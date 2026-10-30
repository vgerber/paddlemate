import type { Components } from "@mui/material/styles";
import { easeOut, PRESS_SCALE, slowTo } from "../press";
import { tokens } from "../tokenVars";

const { radii, elevation, motion } = tokens;

export const surfaceComponents: Components = {
  MuiCssBaseline: {
    styleOverrides: {
      ":root": {
        "--system-inset": "0px",
      },
      // iOS draws the page under the home indicator (index.html sets
      // viewport-fit=cover there only), so its bottom chrome keeps clear.
      ":root[data-ios]": {
        "--system-inset": "env(safe-area-inset-bottom, 0px)",
      },
      body: {
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
      // Motion off when html[data-motion] says reduced: the app's setting,
      // which already folds in the device setting (motionMode.ts). An
      // element that sets `data-reduced-fade` keeps its own short fade.
      'html[data-motion="reduced"]': {
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
        borderRadius: radii.row,
        boxShadow: elevation.e2,
        overflow: "hidden",
      },
      ".maplibregl-ctrl-group button": {
        width: tokens.touch.min,
        height: tokens.touch.min,
        borderRadius: 0,
        "&:hover": { backgroundColor: tokens.surfaceHigh },
        // A divider, not a control edge: an inset line keeps it out of the
        // button's border box.
        "& + button": { boxShadow: `inset 0 1px 0 ${tokens.outlineVariant}` },
        // MapLibre's own light grey rule between buttons is a bright line in dark.
        '[data-theme="dark"] & + button': { borderTop: "none" },
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
        transition: slowTo(["transform"]),
        "&:has(> .MuiCardActionArea-root:active)": {
          transform: `scale(${PRESS_SCALE})`,
          transition: `transform ${motion.instant}ms ${easeOut}`,
        },
        'html[data-motion="reduced"] &:has(> .MuiCardActionArea-root:active)': {
          transform: "none",
        },
      },
    },
  },

  // No ripple: press is a wash on the row, focus a visible teal ring.
};
