import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;

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
    bgcolor: `${tokens.primary}${alphas.wash}`,
    boxShadow: `inset 3px 0 0 ${tokens.primary}`,
    "&:hover": { bgcolor: `${tokens.primary}${alphas.wash}` },
  },
} as const;

export const desktopFlatRow = {
  [theme.breakpoints.up("md")]: flatRowSx,
} as const;
