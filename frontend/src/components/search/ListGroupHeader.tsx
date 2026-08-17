import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

/** Overline heading for a group in the search panel's idle lists
 * ("Starred sections", "Recent rivers"). */
export default function ListGroupHeader({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        color: "text.secondary",
        lineHeight: 1,
        px: 1,
        pt: 1,
        pb: 0.5,
      }}
    >
      {icon} {label}
    </Typography>
  );
}
