import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** "1 result", "3 results": every list names its count the same way. */
export function countLabel(count: number): string {
  return `${count} ${count === 1 ? "result" : "results"}`;
}

interface ListPaneHeaderProps {
  /** How much is in the list. Omitted while there is no honest number, and
   * at zero, where the empty state speaks. */
  count?: number;
  /** Suppresses the count rather than showing a stale one mid-fetch. */
  loading?: boolean;
  /** For a panel whose tabs already carry the counts on a phone. */
  hideCountOnMobile?: boolean;
  /** Filter toggles, a close button - whatever this list can do to itself. */
  actions?: ReactNode;
  sx?: SxProps<Theme>;
}

/** The one opening line of a list pane: how much is in it, and its own
 * controls at the right edge. No title - the nav already says which list
 * this is, and the pane beside it says which item is open. Every
 * list-plus-detail screen opens with this, so they all behave alike. */
export default function ListPaneHeader({
  count,
  loading,
  hideCountOnMobile,
  actions,
  sx,
}: ListPaneHeaderProps) {
  return (
    <Box
      sx={[
        {
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          // As tall as a touch target whether or not this pane has controls,
          // so every counter sits at the same height and every list starts
          // at the same place.
          minHeight: tokens.touch.min,
          boxSizing: "border-box",
          px: { xs: `${tokens.phone.line}px`, md: 2 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {count != null && count > 0 && !loading && (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            color: "text.secondary",
            display: hideCountOnMobile
              ? { xs: "none", md: "block" }
              : undefined,
          }}
        >
          {countLabel(count)}
        </Typography>
      )}
      {/* The spacer, not the count, holds the actions at the right edge: a
          count that is absent or hidden would otherwise push nothing. */}
      <Box sx={{ flex: 1 }} />
      {actions}
    </Box>
  );
}
