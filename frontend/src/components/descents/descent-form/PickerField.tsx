import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import type { ChangeEvent } from "react";
import { formatDate } from "@/lib/format";
import { CloseIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** The theme's outlined field height. */
const FIELD_HEIGHT = 56;

type Kind = "date" | "time" | "datetime-local";

/** What the field shows: the app's own date format, 24h time. The browser
 * would otherwise print its locale's "10/11/2026" and "03:06 PM". */
export function displayValue(kind: Kind, value: string): string {
  if (!value) return "";
  if (kind === "time") return value;
  if (kind === "date") return formatDate(value, { weekday: true });
  return `${formatDate(value.slice(0, 10))} ${value.slice(11, 16)}`;
}

interface Props {
  kind: Kind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  /** Shows a clear button while the field has a value. */
  onClear?: () => void;
}

/** A date or time field that reads in the app's format and opens the
 * browser's own picker. The native input sits invisibly over the whole field,
 * so a tap lands on it directly (no script needed to open the picker) and
 * the picker keeps its keyboard and screen reader behaviour. */
export default function PickerField({
  kind,
  label,
  value,
  onChange,
  helperText,
  onClear,
}: Props) {
  return (
    <Box
      sx={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        "&:focus-within .MuiOutlinedInput-notchedOutline": {
          borderColor: tokens.primary,
        },
      }}
    >
      <TextField
        label={label}
        value={displayValue(kind, value)}
        fullWidth
        helperText={helperText}
        slotProps={{
          inputLabel: { shrink: true },
          htmlInput: { readOnly: true, tabIndex: -1, "aria-hidden": true },
          input: {
            endAdornment:
              onClear && value ? (
                <InputAdornment position="end" sx={{ zIndex: 1 }}>
                  <IconButton
                    aria-label={`Clear ${label.toLowerCase()}`}
                    onClick={onClear}
                    edge="end"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
          },
        }}
      />
      <Box
        component="input"
        type={kind}
        aria-label={label}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          // Stops short of the clear button, which keeps its own taps, and at
          // the field itself so the helper text stays plain text.
          width: onClear && value ? "calc(100% - 48px)" : "100%",
          height: FIELD_HEIGHT,
          opacity: 0,
          cursor: "pointer",
          fontSize: "1rem",
          boxSizing: "border-box",
        }}
      />
    </Box>
  );
}
