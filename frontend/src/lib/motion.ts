import { useSyncExternalStore } from "react";
import { theme } from "@/lib/theme";

const { motion } = theme.tokens;

export type Duration = "instant" | "fast" | "base" | "slow";
export type Easing = "easeOut" | "easeInOut" | "easeIn";

/** The motion scale in milliseconds, from the theme. */
export const durations: Record<Duration, number> = {
  instant: motion.instant,
  fast: motion.fast,
  base: motion.base,
  slow: motion.slow,
};

/** The motion tokens as CSS strings, for inline styles and keyframes. */
export const css = {
  instant: `${motion.instant}ms`,
  fast: `${motion.fast}ms`,
  base: `${motion.base}ms`,
  slow: `${motion.slow}ms`,
  easeOut: motion.easeOut,
  easeInOut: motion.easeInOut,
  easeIn: motion.easeIn,
  settle: motion.easeSettle,
} as const;

/** How long a spinner waits before it shows, so a fast answer never flashes one. */
export const SPINNER_DELAY_MS = motion.spinnerDelay;

/** The beat an arriving element waits for the leaving one to clear. */
export const LEAD_MS = motion.lead;

/** The cross-fade that replaces movement under reduced motion, out and in. */
export const REDUCED_FADE_MS = motion.reducedFade;

/** Solve a CSS cubic-bezier(x1, y1, x2, y2) string into an easing function
 * for MapLibre and frame loops, which take a function rather than a CSS curve. */
export function cubicBezier(css: string): (t: number) => number {
  const m = css.match(/cubic-bezier\(([^)]+)\)/);
  const p = m?.[1].split(",").map(Number);
  if (!p || p.length !== 4 || p.some(Number.isNaN)) return (t) => t;
  const [x1, y1, x2, y2] = p;
  const at = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  const slope = (a: number, b: number, s: number) =>
    3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s ** 2;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = at(x1, x2, s) - x;
      if (Math.abs(err) < 1e-6) return at(y1, y2, s);
      const d = slope(x1, x2, s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 24; i++) {
      const v = at(x1, x2, s);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return at(y1, y2, s);
  };
}

/** True when the app runs reduced: html[data-motion] holds the setting folded
 * with the device setting. The media query is only the fallback before the
 * attribute exists. */
export function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  const attr = document.documentElement.getAttribute("data-motion");
  if (attr) return attr === "reduced";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeMotion(fn: () => void) {
  const observer = new MutationObserver(fn);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-motion"],
  });
  return () => observer.disconnect();
}

/** Live form of prefersReducedMotion: re-renders when the setting changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    prefersReducedMotion,
    () => false,
  );
}

/** A duration in ms, 0 under reduced motion. */
export function ms(d: Duration): number {
  return prefersReducedMotion() ? 0 : durations[d];
}

/** Time to settle after a release with `px` left to travel. */
export function releaseMs(px: number): number {
  return Math.min(360, Math.round(220 + 0.25 * Math.abs(px)));
}

/** Time for a move of `steps` positions. */
export function stepMs(steps: number): number {
  return Math.min(300, 160 + 20 * Math.abs(steps));
}

/** Camera time for a move of `screens` screen widths: 260 up to half a
 * screen, 360 up to one and a half, else a jump. 0 under reduced motion. */
export function cameraMs(screens: number): number {
  if (prefersReducedMotion()) return 0;
  const d = Math.abs(screens);
  if (d <= 0.5) return durations.base;
  if (d <= 1.5) return durations.slow;
  return 0;
}

/** A CSS `transition` value for the given properties; `none` when the user
 * asked for reduced motion. `ms` overrides the token for a computed time. */
export function transition(
  properties: string | string[],
  opts: { duration?: Duration; easing?: Easing; ms?: number } = {},
): string {
  if (prefersReducedMotion()) return "none";
  const { duration = "base", easing = "easeOut", ms } = opts;
  const time = ms === undefined ? css[duration] : `${Math.round(ms)}ms`;
  return [properties]
    .flat()
    .map((p) => `${p} ${time} ${css[easing]}`)
    .join(", ");
}
