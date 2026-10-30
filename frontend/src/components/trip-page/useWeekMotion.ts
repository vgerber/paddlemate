import { useEffect, useRef } from "react";
import {
  css,
  durations,
  prefersReducedMotion,
  REDUCED_FADE_MS,
} from "@/lib/theme/motion";

/** Slides (or fades, under reduced motion) a week pane in or out on mount. */
export function useWeekPaneMotion(
  mode: "rest" | "in" | "out",
  dir: 1 | -1,
  onDone?: () => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  // The mode and direction only matter at mount, when the pane arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => {
    const el = ref.current;
    if (!el || mode === "rest") return;
    const reduced = prefersReducedMotion();
    const enter = mode === "in";
    const slide = `${enter ? dir * 100 : 0}%`;
    const away = `${enter ? 0 : -dir * 100}%`;
    const anim = reduced
      ? el.animate(
          { opacity: enter ? [0, 1] : [1, 0] },
          {
            duration: REDUCED_FADE_MS,
            fill: enter ? "backwards" : "forwards",
          },
        )
      : el.animate(
          {
            transform: enter
              ? [`translateX(${slide})`, "translateX(0)"]
              : ["translateX(0)", `translateX(${away})`],
          },
          {
            duration: durations.base,
            easing: css.easeInOut,
            fill: enter ? "backwards" : "forwards",
          },
        );
    anim.onfinish = () => onDone?.();
    return () => anim.cancel();
  }, []);
  return ref;
}

/** Fades the current-day disc in or out on mount. */
export function useDiscFade(fade: "rest" | "in" | "out", onDone?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // The fade only matters when the disc arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => {
    const el = ref.current;
    if (!el || fade === "rest") return;
    const reduced = prefersReducedMotion();
    const anim = el.animate(
      { opacity: fade === "in" ? [0, 1] : [1, 0] },
      {
        duration: reduced ? REDUCED_FADE_MS : durations.fast,
        easing: fade === "in" ? css.easeOut : css.easeIn,
        fill: fade === "in" ? "backwards" : "forwards",
      },
    );
    anim.onfinish = () => onDone?.();
    return () => anim.cancel();
  }, []);
  return ref;
}
