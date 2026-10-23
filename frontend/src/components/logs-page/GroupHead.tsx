import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { labelSx, theme } from "@/lib/theme";

const { phone } = theme.tokens;

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
        // The pane gives a phone row its edge; the heading adds the card's inner
        // padding, so its text sits on the 28 line with the rows' text.
        px: { xs: `${phone.inner}px`, md: 2 },
        pt: 0.75,
        pb: { md: 0.75 },
        color: "text.secondary",
      }}
    >
      {children}
    </Typography>
  );
}
