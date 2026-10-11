import { durations } from "@/lib/motion";

/** Pixels of travel before the gesture picks a direction. */
export const LOCK_DISTANCE = 8;
/** A drag steeper than this many degrees scrolls instead of swiping. */
export const MAX_ANGLE_DEG = 30;
/** Share of the width a drag must pass to commit. */
export const COMMIT_RATIO = 0.4;
/** Release speed (px per ms) that commits whatever the distance. */
export const FLICK_SPEED = 0.5;
/** The most the first and last tab give way to a drag, in px. */
export const EDGE_RESISTANCE = 22;
/** The strip at the screen edge left to the system back gesture, in px. */
export const EDGE_ZONE = 24;

export type Lock = "pending" | "horizontal" | "vertical";

/** Decides, from the movement since touch-down, whether this is a swipe. */
export function lockDirection(dx: number, dy: number): Lock {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < LOCK_DISTANCE) return "pending";
  const steep = ay > ax * Math.tan((MAX_ANGLE_DEG * Math.PI) / 180);
  return steep ? "vertical" : "horizontal";
}

/** True when a touch starts in the strip the system back gesture owns. */
export function inEdgeZone(x: number, screenWidth: number): boolean {
  return x < EDGE_ZONE || x > screenWidth - EDGE_ZONE;
}

/** Rubber band: grows with the drag but never passes `EDGE_RESISTANCE`. */
export function resist(distance: number): number {
  return (
    EDGE_RESISTANCE *
    (1 - Math.exp(-Math.abs(distance) / (EDGE_RESISTANCE * 2)))
  );
}

/** The pane offset for a drag of `dx`: one to one where a neighbour exists,
 * resisted where it does not. A negative `dx` goes to the next tab. */
export function dragOffset(
  dx: number,
  hasPrev: boolean,
  hasNext: boolean,
): number {
  if (dx > 0 && !hasPrev) return resist(dx);
  if (dx < 0 && !hasNext) return -resist(dx);
  return dx;
}

/** The tab to land on: one step in the drag direction when the drag passed
 * the commit share or was a flick, otherwise the current one. */
export function targetIndex(
  index: number,
  count: number,
  dx: number,
  velocity: number,
  width: number,
): number {
  const dir = dx < 0 ? 1 : -1;
  const next = index + dir;
  if (next < 0 || next >= count) return index;
  const far = Math.abs(dx) > width * COMMIT_RATIO;
  const flick =
    Math.abs(velocity) > FLICK_SPEED && Math.sign(velocity) === Math.sign(dx);
  return far || flick ? next : index;
}

/** Settle time for the remaining `distance`: from `base` for a short hop to
 * `slow` for a full width, so a long travel is not rushed. */
export function settleDuration(distance: number, width: number): number {
  const share = width > 0 ? Math.min(1, Math.abs(distance) / width) : 0;
  return durations.base + (durations.slow - durations.base) * share;
}

/** Drag progress toward the neighbour, -1 to 1; positive means the next tab. */
export function dragProgress(offset: number, width: number): number {
  if (width <= 0) return 0;
  return Math.max(-1, Math.min(1, -offset / width));
}

export interface Sample {
  x: number;
  t: number;
}

/** Release speed in px per ms over the last `windowMs` of samples. */
export function releaseVelocity(samples: Sample[], windowMs = 100): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  const first = samples.find((s) => last.t - s.t <= windowMs) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}
