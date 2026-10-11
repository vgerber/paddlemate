import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { labelSx } from "@/lib/theme";

/** Heading for a group in the search panel's lists ("Starred sections",
 * "Recent rivers", "Similar names"): a small sentence-case label above its
 * cards. */
export default function ListGroupHeader({
  icon,
  label,
}: {
  icon?: ReactNode;
  label: string;
}) {
  return (
    <Typography
      sx={{
        ...labelSx,
        fontSize: "0.8125rem",
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: { xs: 0.5, md: 2 },
        pt: 1,
        pb: 0.75,
        lineHeight: 1.3,
      }}
    >
      {icon}
      {label}
    </Typography>
  );
}
