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

/** A row of a list inside the desktop card, which is already a white
 * surface: no card of its own, a dimmed rule under it, and the selected row
 * wears the 2px teal ring. On a phone the list sits on the grey ground and
 * keeps `cardRowSx`. */
export const flatRowSx = {
  bgcolor: "transparent",
  borderRadius: 0,
  boxShadow: "none",
  mb: 0,
  px: 2,
  borderBottom: `1px solid ${tokens.outlineVariant}55`,
  "&:hover": { bgcolor: tokens.surfaceLow },
  "&.Mui-selected": {
    bgcolor: "transparent",
    boxShadow: `inset 0 0 0 2px ${tokens.primary}`,
    "&:hover": { bgcolor: tokens.surfaceLow },
  },
} as const;

export const listRowSx = {
  ...cardRowSx,
  mb: 0.75,
  [theme.breakpoints.up("md")]: flatRowSx,
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
    <ListItemButton onClick={onClick} sx={{ ...listRowSx, gap: 1 }}>
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
