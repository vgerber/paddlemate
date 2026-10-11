/** Fraction of the viewport the open sheet may fill. */
export const OPEN_RATIO = 0.85;
/** Release speed (px per ms) that moves to the next snap whatever the height. */
export const FLICK_SPEED = 0.5;

export type SheetState = "peek" | "open";

export interface Snaps {
  peek: number;
  open: number;
}

/** The two resting heights: the peek is fixed, the open height is a share of
 * the viewport and never lower than the peek. */
export function snapHeights(viewport: number, peek: number): Snaps {
  return { peek, open: Math.max(peek, Math.round(viewport * OPEN_RATIO)) };
}

/** The sheet height for a drag: the finger moves the top edge, so dragging up
 * (negative `dy`) grows it. Past either snap it gives way no further. */
export function dragHeight(start: number, dy: number, snaps: Snaps): number {
  return Math.min(snaps.open, Math.max(snaps.peek, start - dy));
}

/** The state to settle on after a release at `height`. A flick (`velocity` in
 * px per ms, negative is upward) goes the way it points; otherwise the sheet
 * goes to the nearer snap. */
export function settleState(
  height: number,
  velocity: number,
  snaps: Snaps,
): SheetState {
  if (Math.abs(velocity) > FLICK_SPEED) return velocity < 0 ? "open" : "peek";
  return height - snaps.peek > snaps.open - height ? "open" : "peek";
}

/** Distance the sheet is pushed down from its open frame for `height`. */
export function offsetFor(height: number, snaps: Snaps): number {
  return snaps.open - height;
}
