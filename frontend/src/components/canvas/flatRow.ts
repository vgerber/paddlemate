import { withAlpha } from "@/lib/alpha";
import { theme } from "@/lib/theme";

const { tokens } = theme;
const { phone } = tokens;

/** The open row of a list: a teal wash and a 3px bar at the left edge, on top
 * of the row card's own shadow unless the list owns the ground (`flat`). One
 * look for trip, proposal, settings, log and flat rows. */
export function openRowSx(selected = false, flat = false) {
  if (!selected) return {};
  return {
    bgcolor: withAlpha(tokens.primary, "wash"),
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
  borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
  "&:hover": { bgcolor: tokens.surfaceLow },
  "&.Mui-selected, &[aria-current='true']": {
    ...openRowSx(true, true),
    "&:hover": { bgcolor: withAlpha(tokens.primary, "wash") },
  },
} as const;

export const desktopFlatRow = {
  [theme.breakpoints.up("md")]: flatRowSx,
} as const;

/** A phone row's side padding: the card's inner 16, so text starts on the
 * 28 line. A separate media query rather than a responsive `px`, because a
 * `desktopFlatRow` spread replaces a responsive value's md entry. */
export const phoneRowPad = {
  [theme.breakpoints.down("md")]: { px: `${phone.inner}px` },
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
  ...phoneRowPad,
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

/** A card on a phone: `phone.edge` from the screen edge, on the grey ground.
 * From md the pane's gutter does the margin. Content inside sits on the
 * 28 line with `phone.inner` padding. */
export const phoneCardSx = {
  mx: { xs: `${phone.edge}px`, md: 0 },
  bgcolor: tokens.surface,
  borderRadius: `${tokens.radii.md}px`,
  boxShadow: tokens.elevation.e1,
} as const;

/** The trailing end of a row (menu, chevron, or an empty spacer): one 44 box
 * that hangs `trailInset` out past the row's padding, so the control's icon
 * ends on the right line. Rows that sit in one list all render it, a control
 * or a spacer, so their values end on one line. */
export const trailSlotSx = {
  width: tokens.touch.min,
  height: tokens.touch.min,
  mr: `-${phone.trailInset}px`,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;
