import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { sectionHeadingSx, theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** A labelled block of a filter sheet: the label, then its controls in a
 * wrapping row. */
export default function FilterGroup({
  label,
  columns,
  compact,
  children,
}: {
  label: string;
  /** Equal columns instead of a wrapping row. */
  columns?: number;
  /** The label as a section heading (13/600), for a pane rather than a sheet. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography
        variant="body2"
        component="span"
        sx={{
          display: "block",
          mb: compact ? 0 : 0.75,
          fontWeight: 600,
          ...(compact && {
            ...sectionHeadingSx,
            color: tokens.onSurfaceVariant,
          }),
        }}
        color="textSecondary"
      >
        {label}
      </Typography>
      <Box
        sx={
          columns
            ? {
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: 1,
              }
            : { display: "flex", flexWrap: "wrap", gap: compact ? 0 : 1 }
        }
      >
        {children}
      </Box>
    </Box>
  );
}
