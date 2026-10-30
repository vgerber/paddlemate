import type { Components } from "@mui/material/styles";
import { tokens } from "../tokenVars";

const { radii, elevation } = tokens;

export const overlayComponents: Components = {
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        borderRadius: radii.xs,
        backgroundColor: tokens.onSurface,
        color: tokens.surface,
        fontSize: "0.75rem",
        // A near-white tooltip is a flash on dark: lift a dark one instead.
        '[data-theme="dark"] &': {
          backgroundColor: tokens.surfaceHighest,
          color: tokens.onSurface,
          boxShadow: elevation.e2,
        },
      },
    },
  },

  // Floating surfaces take the bright step: in dark a shadow alone does
  // not lift them off the ground.
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: radii.xl,
        boxShadow: elevation.e2,
        backgroundColor: tokens.surfaceBright,
      },
    },
  },

  MuiPopover: {
    styleOverrides: {
      paper: {
        boxShadow: elevation.e2,
        backgroundColor: tokens.surfaceBright,
      },
    },
  },

  MuiDialogTitle: {
    styleOverrides: {
      root: { fontSize: "1.125rem", fontWeight: 700 },
    },
  },

  MuiMenu: {
    styleOverrides: {
      paper: {
        borderRadius: radii.md,
        boxShadow: elevation.e2,
        backgroundColor: tokens.surfaceBright,
      },
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
};
