import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

/** Overline heading for a group in the search panel's lists ("Starred
 * sections", "Recent rivers", "Similar names"). The rule after the label
 * runs to the panel edge, so a group reads as a band across the list
 * rather than a stray line of text. */
export default function ListGroupHeader({
  icon,
  label,
}: {
  icon?: ReactNode;
  label: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        pt: 1,
        pb: 0.5,
      }}
    >
      <Typography
        variant="overline"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          color: "text.secondary",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {icon}
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
    </Box>
  );
}
