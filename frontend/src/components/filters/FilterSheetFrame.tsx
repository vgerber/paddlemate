import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { CloseIcon } from "@/lib/icons";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The body of a filter sheet: title, Reset and Close on top, the groups, and
 * the button that shows the result count. The caller supplies the container
 * (bottom sheet or dialog). */
export default function FilterSheetFrame({
  canReset,
  onReset,
  onClose,
  resultLabel,
  dialogPad,
  children,
}: {
  canReset: boolean;
  onReset: () => void;
  onClose: () => void;
  /** The result button's text, e.g. "12 results". */
  resultLabel: string;
  /** Wider side padding from `md`, for a sheet shown as a dialog. */
  dialogPad?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        px: {
          xs: `${tokens.phone.line}px`,
          ...(dialogPad ? { md: 2 } : {}),
        },
        pb: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h4" component="h2" sx={{ lineHeight: "24px" }}>
          Filters
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Button onClick={onReset} disabled={!canReset}>
            Reset
          </Button>
          <IconButton
            aria-label="Close"
            onClick={onClose}
            sx={{
              width: tokens.touch.min,
              height: tokens.touch.min,
              mr: -1,
              color: tokens.onSurfaceVariant,
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>
      {children}
      <Button
        variant="contained"
        onClick={onClose}
        sx={{
          height: tokens.touch.action,
          borderRadius: `${tokens.radii.md}px`,
        }}
      >
        {resultLabel}
      </Button>
    </Box>
  );
}
