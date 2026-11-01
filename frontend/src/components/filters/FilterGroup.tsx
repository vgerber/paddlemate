import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

/** A labelled block of a filter sheet: the label, then its controls in a
 * wrapping row. */
export default function FilterGroup({
  label,
  columns,
  children,
}: {
  label: string;
  /** Equal columns instead of a wrapping row. */
  columns?: number;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography
        variant="body2"
        component="span"
        sx={{ display: "block", mb: 0.75, fontWeight: 600 }}
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
            : { display: "flex", flexWrap: "wrap", gap: 1 }
        }
      >
        {children}
      </Box>
    </Box>
  );
}
