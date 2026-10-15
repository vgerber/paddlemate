import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

/** A labelled block of a form: a heading, one hint line saying what the block
 * is for, an optional action in the heading, and the fields below. Steps are
 * built from these instead of a flat pile of inputs, so each screen reads as
 * a few named blocks with one action each. */
export default function FormSection({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  /** One line telling the user what this block is for. */
  hint?: ReactNode;
  /** Optional control for this block, shown right of the heading. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            data-testid="form-section-label"
            sx={{
              display: "block",
              fontSize: "0.9375rem",
              fontWeight: 600,
              lineHeight: 1.33,
            }}
          >
            {label}
          </Typography>
          {hint && (
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ display: "block" }}
            >
              {hint}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {children}
      </Box>
    </Box>
  );
}
