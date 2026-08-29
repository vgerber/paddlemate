import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { labelSx } from "@/lib/theme";

/** A labelled group inside the suggest forms: overline heading, an optional
 * hint saying what to do here, and the fields below it. Steps are built from
 * these instead of a flat pile of inputs, so each screen reads as a few
 * named blocks with one action each. */
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
          <Typography sx={{ ...labelSx, display: "block" }}>{label}</Typography>
          {hint && (
            <Typography
              variant="caption"
              color="text.secondary"
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
