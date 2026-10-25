import { type RefObject, useEffect, useRef } from "react";
import {
  css,
  durations,
  prefersReducedMotion,
  REDUCED_FADE_MS,
} from "@/lib/motion";

interface PanelEnter {
  /** Start offset in px and the opacity the newcomer starts from. */
  from: { x?: number; y?: number; opacity?: number };
  /** Delay before the newcomer starts, ms. */
  delay?: number;
  /** Duration in ms; the base step when omitted. */
  duration?: number;
  /** Also play when first mounted. */
  onMount?: boolean;
}

/** Plays the enter motion on `ref` each time `key` changes (not on mount).
 * The content stays mounted, so no state is lost. Under reduced motion there
 * is no travel, only a cross-fade. */
export function usePanelEnter(
  ref: RefObject<HTMLElement | null>,
  key: string,
  { from, delay = 0, duration = durations.base, onMount = false }: PanelEnter,
) {
  const prev = useRef<string | null>(onMount ? null : key);
  const { x = 0, y = 0, opacity = 0 } = from;
  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const reduced = prefersReducedMotion();
    el.animate(
      [
        {
          transform: reduced ? "none" : `translate(${x}px, ${y}px)`,
          opacity: reduced ? 0 : opacity,
        },
        { transform: "none", opacity: 1 },
      ],
      {
        duration: reduced ? REDUCED_FADE_MS : duration,
        delay: reduced ? 0 : delay,
        easing: css.easeOut,
        fill: "backwards",
      },
    );
  }, [key, ref, x, y, opacity, delay, duration]);
}
