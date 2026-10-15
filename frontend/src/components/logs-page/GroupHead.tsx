import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { labelSx } from "@/lib/theme";

/** The line that names a group of rows: sentence case, quiet, with the space
 * above it rather than below. */
export default function GroupHead({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Typography
      data-testid={testId}
      sx={{
        ...labelSx,
        fontSize: "0.8125rem",
        px: { xs: 0.5, md: 2 },
        pt: 0.75,
        pb: { md: 0.75 },
        color: "text.secondary",
      }}
    >
      {children}
    </Typography>
  );
}
