import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { listRowSx } from "@/components/canvas/flatRow";

/** One river row - shared by search results and the recent-rivers list so
 * both render identically by construction.
 *
 * Under the name go two different kinds of caption, in this order: where the
 * river is, and why it turned up in the results. A name on its own does not
 * say which of the world's rivers it is, so the place comes first and is the
 * one that shows even when nothing was searched for. */
export default function RiverRow({
  name,
  place,
  secondary,
  onClick,
  trailing,
  testId,
}: {
  name: string;
  /** Country and regions, least specific first. */
  place?: string[];
  secondary?: string;
  onClick: () => void;
  trailing?: ReactNode;
  testId?: string;
}) {
  const where = place?.length ? place.join(" · ") : undefined;
  return (
    <ListItemButton
      data-testid={testId}
      onClick={onClick}
      sx={{ ...listRowSx, gap: 1 }}
    >
      <ListItemText
        primary={name}
        secondary={
          where || secondary ? (
            <>
              {where && (
                <Typography variant="caption" color="textSecondary" noWrap>
                  {where}
                </Typography>
              )}
              {secondary && (
                <Typography
                  variant="caption"
                  color="textDisabled"
                  noWrap
                  sx={{ display: "block" }}
                >
                  {secondary}
                </Typography>
              )}
            </>
          ) : undefined
        }
        sx={{ my: 0, minWidth: 0 }}
        slotProps={{
          primary: { variant: "body2", sx: { fontWeight: 600 } },
          secondary: { component: "span", sx: { display: "block" } },
        }}
      />
      {trailing}
    </ListItemButton>
  );
}
