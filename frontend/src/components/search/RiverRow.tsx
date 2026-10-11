import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** The card every list row is drawn as: a white surface on the grey ground
 * with the soft rest shadow, no border. A selected row takes the accent
 * wash. */
export const cardRowSx = {
  bgcolor: tokens.surface,
  borderRadius: `${tokens.radii.md}px`,
  boxShadow: tokens.elevation.e1,
  minHeight: 52,
  px: 1.75,
  py: 1,
  "&:hover": { bgcolor: tokens.surfaceHigh },
  "&.Mui-selected": {
    bgcolor: tokens.primaryContainer,
    "&:hover": { bgcolor: tokens.primaryContainer },
  },
} as const;

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
}: {
  name: string;
  /** Country and regions, least specific first. */
  place?: string[];
  secondary?: string;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  const where = place?.length ? place.join(" · ") : undefined;
  return (
    <ListItemButton onClick={onClick} sx={{ ...cardRowSx, mb: 0.75, gap: 1 }}>
      <ListItemText
        primary={name}
        secondary={
          where || secondary ? (
            <>
              {where && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {where}
                </Typography>
              )}
              {secondary && (
                <Typography
                  variant="caption"
                  color="text.disabled"
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
