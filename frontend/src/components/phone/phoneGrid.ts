import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The phone grid's numbers (`tokens.phone`): the one place components read
 * them, so a screen asks for "the text line" and not for a number. */
export const grid = tokens.phone;

/** Padding that puts text on the phone's text line (28) and `md` where the
 * desktop card wants it. A responsive value, so spread it into `px`, `pl`
 * or `pr`. */
export const lineInset = (md: number | string = 2) =>
  ({ xs: `${grid.line}px`, md }) as const;

/** The same for text inside a card, which sits `inner` (16) from the card
 * edge rather than on the line. */
export const innerInset = (md: number | string = 2) =>
  ({ xs: `${grid.inner}px`, md }) as const;

/** The margin that hangs a trailing control out past the row's padding, so
 * its icon ends on the right line. None from `md`. */
export const trailPull = { xs: `-${grid.trailInset}px`, md: 0 } as const;

/** A phone row's side padding: the card's inner 16, so text starts on the
 * 28 line. A separate media query rather than a responsive `px`, because a
 * `desktopFlatRow` spread replaces a responsive value's md entry. */
export const phoneRowPad = {
  [theme.breakpoints.down("md")]: { px: `${grid.inner}px` },
} as const;

/** A card on a phone: `grid.edge` from the screen edge, on the grey ground.
 * From md the pane's gutter does the margin. Content inside sits on the
 * 28 line with `grid.inner` padding. */
export const phoneCardSx = {
  mx: { xs: `${grid.edge}px`, md: 0 },
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
  mr: `-${grid.trailInset}px`,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;
