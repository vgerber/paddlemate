import {
  css,
  durations,
  prefersReducedMotion,
  REDUCED_FADE_MS,
} from "@/lib/theme/motion";

/** A redraw: the new line is revealed left to right (clip-path, paint only),
 * the area fades in after it. Reduced, the line is not drawn in: everything
 * cross-fades. */
export function redrawSx() {
  const reduced = prefersReducedMotion();
  const fade = { from: { opacity: 0 } };
  return {
    "@keyframes pm-line-reveal": {
      from: { clipPath: "inset(0 100% 0 0)" },
      to: { clipPath: "inset(0 0 0 0)" },
    },
    "@keyframes pm-area-in": fade,
    // Only while a redraw is on: hovering rebuilds the path for its dot,
    // and a new element would replay the reveal.
    "&[data-redraw] .recharts-area-curve": {
      animation: reduced
        ? `pm-area-in ${REDUCED_FADE_MS}ms ${css.easeOut} backwards`
        : `pm-line-reveal ${css.slow} ${css.easeOut} backwards`,
    },
    "&[data-redraw] .recharts-area-area": {
      animation: `pm-area-in ${reduced ? `${REDUCED_FADE_MS}ms` : css.fast} ${css.easeOut} ${reduced ? 0 : durations.base}ms backwards`,
    },
  };
}
