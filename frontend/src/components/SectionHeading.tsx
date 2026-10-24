import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** Typography of an in-screen section heading. Belongs in lib/theme.ts next to
 * labelSx once the bars change lands; kept here until then. */
export const sectionHeadingSx = {
  ...labelSx,
  fontSize: "0.8125rem",
  lineHeight: "18px",
  color: tokens.onSurfaceVariant,
} as const;

/** The name of the block below it: 13/600, sentence case, 24 above and 8
 * below, with an optional control on the right line. `first` drops the top
 * space when the heading opens a pane or the parent owns the spacing. */
export default function SectionHeading({
  children,
  action,
  id,
  component = "h2",
  first,
  testId,
  inset,
}: {
  children: ReactNode;
  action?: ReactNode;
  id?: string;
  component?: "h2" | "h3";
  first?: boolean;
  testId?: string;
  /** Sits on the rows' text line: the pane gives a row its edge, so a
   * heading above a list adds the card's inner padding. */
  inset?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        mt: first ? 0 : 3,
        mb: 1,
        minWidth: 0,
        ...(inset && { px: { xs: `${tokens.phone.inner}px`, md: 2 } }),
      }}
    >
      <Typography
        component={component}
        id={id}
        data-testid={testId}
        sx={{
          ...sectionHeadingSx,
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        {children}
      </Typography>
      {action && (
        // A 44 box hangs out so its icon ends on the phone's right line and
        // the row stays one line high.
        <Box
          sx={{
            my: `-${(tokens.touch.min - 18) / 2}px`,
            mr: { xs: `-${tokens.phone.trailInset}px`, md: 0 },
          }}
        >
          {action}
        </Box>
      )}
    </Box>
  );
}
