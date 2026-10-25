import { css, durations } from "@/lib/motion";

/** Props for a MUI Collapse on the motion scale: open travels between resting
 * places (base, in-out), close is an exit (about 70% of the time, ease in). */
export const foldProps = {
  timeout: {
    enter: durations.base,
    exit: Math.round(durations.base * 0.7),
  },
  easing: { enter: css.easeInOut, exit: css.easeIn },
} as const;
