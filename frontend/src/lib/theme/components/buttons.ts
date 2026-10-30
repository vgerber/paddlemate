import type { Components } from "@mui/material/styles";
import { withAlpha } from "../alpha";
import { overlay, scaleOnPress } from "../press";
import { tokens } from "../tokenVars";

const { radii, elevation } = tokens;

export const buttonComponents: Components = {
  MuiButtonBase: {
    defaultProps: { disableRipple: true },
    styleOverrides: {
      root: {
        position: "relative",
        outline: "2px solid transparent",
        outlineOffset: -2,
        "&.Mui-focusVisible, &:focus-visible": {
          outlineColor: tokens.primary,
        },
        ...overlay(0.04, 0.08),
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
        ...scaleOnPress,
      },
      text: { "&:hover": { backgroundColor: "transparent" } },
      contained: {
        "@media (hover: hover)": { "&:hover::before": { opacity: 0.1 } },
        "&:active::before": { opacity: 0.2 },
      },
      sizeSmall: { minHeight: tokens.touch.min, paddingInline: 12 },
      outlined: {
        borderWidth: 1,
        borderColor: tokens.outlineControl,
        color: tokens.onSurface,
        backgroundColor: tokens.surface,
        "&:hover": { borderWidth: 1, backgroundColor: tokens.surfaceHigh },
      },
    },
    variants: [
      {
        props: { variant: "contained", color: "primary" },
        style: {
          backgroundColor: tokens.primaryFill,
          boxShadow: elevation.e3,
          "&:hover": {
            backgroundColor: tokens.primaryFill,
            boxShadow: elevation.e3,
          },
        },
      },
      {
        props: { variant: "contained", color: "error" },
        style: {
          backgroundColor: tokens.errorFill,
          color: tokens.onErrorFill,
          "&:hover": { backgroundColor: tokens.errorFill },
        },
      },
    ],
  },

  MuiIconButton: {
    styleOverrides: {
      root: {
        ...scaleOnPress,
        "&:hover": { backgroundColor: "transparent" },
      },
      sizeMedium: { padding: 10 },
    },
  },

  MuiFab: {
    styleOverrides: {
      root: {
        borderRadius: radii.lg,
        boxShadow: elevation.e3,
        ...scaleOnPress,
        "&:hover": { boxShadow: elevation.e3 },
        "@media (hover: hover)": { "&:hover::before": { opacity: 0.1 } },
        "&:active::before": { opacity: 0.2 },
      },
    },
    variants: [
      {
        props: { color: "primary" },
        style: {
          backgroundColor: tokens.primaryFill,
          "&:hover": { backgroundColor: tokens.primaryFill },
        },
      },
    ],
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
        ...scaleOnPress,
        // A set filter: teal ring and a wash, not just teal text. MUI 9 has
        // no `outlinedPrimary` class.
        "&.MuiChip-outlined.MuiChip-colorPrimary": {
          backgroundColor: withAlpha(tokens.primary, "wash"),
          borderColor: tokens.primary,
          borderWidth: 1.5,
        },
        // Light keeps MUI's own rest edge; dark needs a visible one.
        '[data-theme="dark"] &.MuiChip-outlined:not(.MuiChip-colorPrimary)': {
          borderColor: tokens.outlineControl,
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
};
