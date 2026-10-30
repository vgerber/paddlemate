import { FLICK_SPEED } from "@/lib/swipe";

export type FeatureSnap = "peek" | "half";

/** Where a release leaves the sheet: a resting height, closed, or pulled to
 * the top, which hands the screen back to the list. */
export type SheetOutcome = FeatureSnap | "close" | "list";

export interface SheetHeights {
  peek: number;
  half: number;
}

/** The sheet's half height as a share of the map above the bottom nav. */
export const HALF_RATIO = 0.55;
/** How far past half a drag must go to count as pulling to the list. */
export const LIST_PULL = 56;
/** A sideways drag this long (px) steps to the next or previous feature. */
export const STEP_DISTANCE = 48;

/** The sheet's height under the finger: dragging up (negative `dy`) grows it,
 * past half it keeps following a little so a pull to the list can be felt. */
export function dragHeight(
  start: number,
  dy: number,
  heights: SheetHeights,
): number {
  return Math.min(heights.half + 2 * LIST_PULL, Math.max(0, start - dy));
}

/** What a release at `height` does. A flick (`velocity` in px per ms, negative
 * is upward) moves one step the way it points; otherwise the nearer rest wins,
 * with a low drag closing and a high one pulling to the list. */
export function settleSheet(
  height: number,
  velocity: number,
  from: FeatureSnap,
  heights: SheetHeights,
): SheetOutcome {
  if (Math.abs(velocity) > FLICK_SPEED) {
    if (velocity < 0) return from === "peek" ? "half" : "list";
    return from === "half" ? "peek" : "close";
  }
  if (height < heights.peek * 0.6) return "close";
  if (height > heights.half + LIST_PULL) return "list";
  return height - heights.peek > heights.half - height ? "half" : "peek";
}

/** The feature a sideways drag of `dx` (flick `velocity`, negative leftward)
 * steps to: leftward is the next one. 0 when it did not travel far enough. */
export function stepOf(dx: number, velocity: number): -1 | 0 | 1 {
  const far = Math.abs(dx) >= STEP_DISTANCE;
  const flick = Math.abs(velocity) > FLICK_SPEED;
  if (!far && !flick) return 0;
  return dx < 0 ? 1 : -1;
}

/** The camera padding that keeps a feature in the map above the sheet. */
export function sheetPadding(visible: number) {
  return { top: 64, left: 24, right: 24, bottom: visible + 16 };
}
