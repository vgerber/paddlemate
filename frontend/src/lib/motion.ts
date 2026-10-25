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

/** The cross-fade that replaces movement under reduced motion, out and in. */
export const REDUCED_FADE_MS = motion.reducedFade;

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
