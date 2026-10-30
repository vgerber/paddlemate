import type { Components } from "@mui/material/styles";
import { tokens } from "../tokenVars";

const { radii } = tokens;

export const feedbackComponents: Components = {
  MuiAlert: {
    styleOverrides: {
      root: {
        borderRadius: radii.row,
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
          backgroundColor: tokens.errorFill,
          color: tokens.onErrorFill,
          // Dark: the tonal pair of the inline alert, not a glaring bar.
          '[data-theme="dark"] &': {
            backgroundColor: tokens.errorContainer,
            color: tokens.errorDark,
            "& .MuiAlert-icon": { color: tokens.error },
          },
        },
        "&.MuiAlert-colorWarning": {
          backgroundColor: tokens.levels.medium.text,
          color: tokens.onError,
        },
        "&.MuiAlert-colorSuccess": {
          backgroundColor: tokens.success,
          color: tokens.onSuccess,
        },
        "&.MuiAlert-colorInfo": {
          backgroundColor: tokens.primary,
          color: tokens.onPrimary,
        },
      },
    },
  },

  MuiLinearProgress: {
    styleOverrides: {
      root: { borderRadius: radii.bar },
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
};
