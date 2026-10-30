import type { Components } from "@mui/material/styles";
import { COLOUR_PROPS, easeOut, slowTo } from "../press";
import { tokens } from "../tokenVars";

const { radii, elevation, motion } = tokens;

export const navigationComponents: Components = {
  MuiDivider: {
    styleOverrides: {
      root: { borderColor: tokens.outlineVariant },
    },
  },

  MuiListItemButton: {
    styleOverrides: {
      root: {
        minHeight: tokens.touch.row,
        transition: `background-color ${motion.instant}ms ${easeOut}, outline-color ${motion.fast}ms ${easeOut}`,
        "&.Mui-disabled": { transition: "none" },
        // The open row's wash and bar are one look, `openRowSx` in
        // canvas/flatRow.ts; the background change above lands it at the
        // instant step.
      },
    },
  },

  MuiTabs: {
    styleOverrides: {
      root: { minHeight: tokens.touch.row },
      indicator: {
        height: 3,
        borderRadius: `${radii.bar}px ${radii.bar}px 0 0`,
      },
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
        borderRadius: radii.row,
        backgroundColor: tokens.surfaceHigh,
        boxShadow: `inset 0 0 0 1px ${tokens.outlineVariant}`,
      },
      grouped: {
        border: 0,
        margin: 0,
        borderRadius: `${radii.sm}px !important`,
      },
    },
  },

  MuiToggleButton: {
    styleOverrides: {
      root: {
        minHeight: tokens.touch.min,
        fontWeight: 600,
        textTransform: "none",
        color: tokens.onSurfaceVariant,
        // Thumb: the segmented control swaps fills per button, so the time
        // is the fast step, not a travel time.
        transition: slowTo(COLOUR_PROPS),
        "&.Mui-selected": {
          backgroundColor: tokens.segmentThumb,
          color: tokens.onSurface,
          boxShadow: elevation.e1,
          "&:hover": { backgroundColor: tokens.segmentThumb },
        },
      },
    },
  },
};
