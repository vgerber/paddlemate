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
} as const;

/** How long a spinner waits before it shows, so a fast answer never flashes one. */
export const SPINNER_DELAY_MS = motion.spinnerDelay;

/** The cross-fade that replaces movement under reduced motion, out and in. */
export const REDUCED_FADE_MS = motion.reducedFade;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
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
