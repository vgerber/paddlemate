import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

interface ListPaneHeaderProps {
  /** How much is in the list. Omitted while there is no honest number. */
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
          // The line is as tall as a small IconButton whether or not this
          // pane has one, so every counter sits at the same height and every
          // list starts at the same place. Content-box, so padding adds to it.
          minHeight: 30,
          boxSizing: "content-box",
          px: 2,
          pt: 1.5,
          pb: 1,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {count != null && !loading && (
        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            display: hideCountOnMobile
              ? { xs: "none", md: "block" }
              : undefined,
          }}
        >
          {count} {count === 1 ? "result" : "results"}
        </Typography>
      )}
      {/* The spacer, not the count, holds the actions at the right edge: a
          count that is absent or hidden would otherwise push nothing. */}
      <Box sx={{ flex: 1 }} />
      {actions}
    </Box>
  );
}
