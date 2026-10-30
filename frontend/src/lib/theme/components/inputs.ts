import type { Components } from "@mui/material/styles";
import { tokens } from "../tokenVars";

const { radii, motion } = tokens;

export const inputComponents: Components = {
  MuiTextField: {
    defaultProps: { variant: "filled" },
  },

  MuiFormControl: {
    defaultProps: { variant: "filled" },
  },

  // Autocomplete re-pads the filled field (37px); restore the calm field's
  // 52px and give the open and clear arrows a full touch target. The right
  // padding leaves room for the icons showing: one, or Clear and Open.
  MuiAutocomplete: {
    styleOverrides: {
      root: ({ ownerState }) => {
        const field = "&& .MuiFilledInput-root";
        const room = (n: number) => ({
          "& .MuiFilledInput-root.MuiInputBase-adornedEnd": {
            paddingRight: tokens.touch.min * n,
          },
          "&.MuiAutocomplete-hasClearIcon.MuiAutocomplete-hasPopupIcon .MuiFilledInput-root.MuiInputBase-adornedEnd":
            { paddingRight: tokens.touch.min * 2 },
        });
        // Chips wrap inside the field under the label.
        if (ownerState.multiple)
          return {
            [field]: {
              paddingTop: 22,
              paddingBottom: 8,
              paddingLeft: 8,
              "& .MuiAutocomplete-endAdornment": { right: 0 },
              "& .MuiFilledInput-input": {
                padding: "6px 6px",
                minHeight: 19,
                boxSizing: "content-box",
              },
            },
            ...room(1),
          };
        return {
          [field]: {
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            paddingRight: 0,
            "& .MuiFilledInput-input": {
              padding: "25px 14px 8px",
              minHeight: 19,
              boxSizing: "content-box",
            },
            "& .MuiFilledInput-input.MuiInputBase-inputSizeSmall, &.MuiInputBase-sizeSmall .MuiFilledInput-input":
              { padding: "22px 14px 6px" },
          },
          ...room(1),
        };
      },
      endAdornment: { right: 0 },
      popupIndicator: {
        width: tokens.touch.min,
        height: tokens.touch.min,
        marginRight: 0,
      },
      clearIndicator: {
        width: tokens.touch.min,
        height: tokens.touch.min,
      },
    },
  },

  // The calm field: the label always sits inside at the top, the value
  // beneath it, a 1px inset outline that becomes a 2px accent ring on focus.
  MuiFilledInput: {
    defaultProps: { disableUnderline: true },
    styleOverrides: {
      root: {
        borderRadius: radii.row,
        backgroundColor: tokens.surface,
        // The rest edge is the only boundary of the control: outline
        // clears the 3:1 floor, outlineVariant (a hairline) does not.
        boxShadow: `inset 0 0 0 1px ${tokens.outline}`,
        overflow: "hidden",
        // 16px: anything smaller makes iOS zoom the page on focus.
        fontSize: "1rem",
        transition: `box-shadow ${motion.fast}ms ${motion.easeOut}`,
        "&:hover": {
          backgroundColor: tokens.surface,
          boxShadow: `inset 0 0 0 1px ${tokens.onSurfaceVariant}`,
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
      // The top padding is the label's row; a field without a label
      // (`hiddenLabel`) has none, or it opens with an empty band.
      input: ({ ownerState }) =>
        ownerState.multiline
          ? // A multiline field pads its root; the textarea adds none.
            { padding: 0 }
          : ownerState.hiddenLabel
            ? {
                padding: "12px 14px",
                height: "auto",
                "&.MuiInputBase-inputSizeSmall": {
                  paddingTop: 8.5,
                  paddingBottom: 8.5,
                },
              }
            : {
                padding: "25px 14px 8px",
                height: "auto",
                "&.MuiInputBase-inputSizeSmall": {
                  paddingTop: 22,
                  paddingBottom: 6,
                },
              },
      multiline: ({ ownerState }) => ({
        padding: ownerState.hiddenLabel ? "12px 14px" : "25px 14px 8px",
      }),
      adornedStart: { paddingLeft: 14 },
    },
  },

  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: radii.row,
        backgroundColor: tokens.surface,
        fontSize: "1rem",
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: tokens.outline,
        },
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: tokens.onSurfaceVariant,
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
};
