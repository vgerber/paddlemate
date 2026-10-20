import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;

/** The open row of a list: a teal wash and a 3px bar at the left edge, on top
 * of the row card's own shadow unless the list owns the ground (`flat`). One
 * look for trip, proposal, settings, log and flat rows. */
export function openRowSx(selected = false, flat = false) {
  if (!selected) return {};
  return {
    bgcolor: `${tokens.primary}${alphas.wash}`,
    boxShadow: flat
      ? `inset 3px 0 0 ${tokens.primary}`
      : `inset 3px 0 0 ${tokens.primary}, ${tokens.elevation.e1}`,
  };
}

/** A list row inside a floating card, which is already a white surface:
 * no card of its own, a dimmed rule under it, and the open row a teal wash
 * with a 3px bar at its left edge. Phones keep their shadowed row cards, so
 * rows spread `desktopFlatRow`, which applies this from `md` up. */
export const flatRowSx = {
  bgcolor: "transparent",
  borderRadius: 0,
  boxShadow: "none",
  mb: 0,
  borderBottom: `1px solid ${tokens.outlineVariant}${alphas.hairline}`,
  "&:hover": { bgcolor: tokens.surfaceLow },
  "&.Mui-selected, &[aria-current='true']": {
    ...openRowSx(true, true),
    "&:hover": { bgcolor: `${tokens.primary}${alphas.wash}` },
  },
} as const;

export const desktopFlatRow = {
  [theme.breakpoints.up("md")]: flatRowSx,
} as const;

/** The card every list row is drawn as on a phone: a white surface on the
 * grey ground with the soft rest shadow. A selected row takes the accent
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

/** A list row that is a card on a phone and flat inside the desktop card. */
export const listRowSx = {
  ...cardRowSx,
  mb: 0.75,
  [theme.breakpoints.up("md")]: { ...flatRowSx, px: 2 },
} as const;
