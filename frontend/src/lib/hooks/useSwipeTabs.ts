import {
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  css,
  durations,
  prefersReducedMotion,
  REDUCED_FADE_MS,
  transition,
} from "@/lib/motion";
import {
  dragOffset,
  dragProgress,
  inEdgeZone,
  type Lock,
  lockDirection,
  releaseVelocity,
  type Sample,
  settleDuration,
  targetIndex,
} from "@/lib/swipe";

interface Options {
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
  enabled?: boolean;
}

/** Elements that keep their own horizontal gesture (a chip row, a slider, a
 * zoomed chart) opt out with this attribute. */
export const NO_SWIPE_ATTR = "data-no-swipe";

/** Time for the old pane to leave the rest of its way: `instant` for a short
 * hop to `fast` for a full width. The new pane's `instant` fade starts only
 * after React has rendered it (measured 10-60 ms on a loaded desktop), so
 * leave + render + fade stays under `slow`; a `fast` fade did not. */
function leaveDuration(distance: number, width: number): number {
  const share = width > 0 ? Math.min(1, Math.abs(distance) / width) : 0;
  return durations.instant + (durations.fast - durations.instant) * share;
}

/** Horizontal swipe between tab panes. A scrolling child of the pane must set
 * `touch-action: pan-y`, or the browser claims the horizontal pan and the
 * swipe never starts. Spread `paneProps` on the element that
 * holds the active pane; the pane follows the finger by transform only. A
 * committed swipe sends it off the rest of its way and fades the next pane in,
 * all inside `slow`; a short one springs back. Under reduced motion the pane
 * cross-fades instead. Spread `gestureProps` on the tab bar so a swipe can
 * start there too, and pass `progress` and `dragging` to `UnderlineTabs` so
 * its underline follows. Touch and pen only: a mouse keeps text selection,
 * and the tab bar stays the other way in. */
export function useSwipeTabs({
  index,
  count,
  onIndexChange,
  enabled = true,
}: Options) {
  const paneRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    lock: Lock;
    offset: number;
    samples: Sample[];
  } | null>(null);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const entering = useRef(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const place = useCallback((x: number, ms?: number) => {
    const el = paneRef.current;
    if (!el) return;
    el.style.transition =
      ms === undefined
        ? "none"
        : transition("transform", { ms, easing: "easeInOut" });
    el.style.transform = x === 0 ? "" : `translate3d(${x}px,0,0)`;
  }, []);

  // The new pane fades in once the index has changed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: index is the trigger
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!entering.current || !el) return;
    entering.current = false;
    const ms = prefersReducedMotion() ? REDUCED_FADE_MS / 2 : durations.instant;
    el.style.opacity = "0";
    void el.offsetWidth;
    el.style.transition = `opacity ${ms}ms ${css.easeOut}`;
    el.style.opacity = "";
    // `index` is the trigger; the rest is read from refs.
  }, [index]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const reset = useCallback(() => {
    drag.current = null;
    busy.current = false;
    entering.current = false;
    place(0);
    if (paneRef.current) paneRef.current.style.opacity = "";
    setProgress(0);
    setDragging(false);
  }, [place]);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!enabled || busy.current || e.pointerType === "mouse") return;
    if (!e.isPrimary || inEdgeZone(e.clientX, window.innerWidth)) return;
    if ((e.target as Element).closest(`[${NO_SWIPE_ATTR}]`)) return;
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      lock: "pending",
      offset: 0,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || d.lock === "vertical") return;
    const dx = e.clientX - d.x0;
    if (d.lock === "pending") {
      d.lock = lockDirection(dx, e.clientY - d.y0);
      if (d.lock === "horizontal") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (d.lock !== "horizontal") return;
    d.offset = dragOffset(dx, index > 0, index < count - 1);
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    place(d.offset);
    setProgress(dragProgress(d.offset, paneRef.current?.offsetWidth ?? 0));
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.lock !== "horizontal") return;
    const width = paneRef.current?.offsetWidth ?? 0;
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    const target = targetIndex(
      index,
      count,
      e.clientX - d.x0,
      releaseVelocity(d.samples),
      width,
    );
    setDragging(false);

    if (target === index) {
      busy.current = true;
      setProgress(0);
      place(0, settleDuration(d.offset, width));
      timer.current = window.setTimeout(reset, settleDuration(d.offset, width));
      return;
    }

    const dir = target > index ? 1 : -1;
    const el = paneRef.current;
    const reduced = prefersReducedMotion();
    const commit = () => {
      entering.current = true;
      busy.current = false;
      place(0);
      // Hold the pane empty until the new index paints, then it fades in.
      if (el) el.style.opacity = "0";
      setProgress(0);
      onIndexChange(target);
      // If the index never changes, do not leave the pane blank.
      timer.current = window.setTimeout(() => {
        if (entering.current) reset();
      }, durations.slow);
    };
    busy.current = true;
    setProgress(dir);
    if (reduced) {
      const half = REDUCED_FADE_MS / 2;
      if (el) {
        el.style.transition = `opacity ${half}ms ${css.easeIn}`;
        el.style.opacity = "0";
      }
      timer.current = window.setTimeout(commit, half);
      return;
    }
    const remaining = width + (dir > 0 ? d.offset : -d.offset);
    const ms = leaveDuration(remaining, width);
    place(-dir * width, ms);
    timer.current = window.setTimeout(commit, ms);
  };

  const onPointerCancel = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    window.clearTimeout(timer.current);
    reset();
  };

  const gestureProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };

  return {
    progress,
    dragging,
    gestureProps,
    paneProps: {
      ref: (el: HTMLElement | null) => {
        paneRef.current = el;
      },
      ...gestureProps,
      "data-reduced-fade": "",
      style: { touchAction: "pan-y" as const, willChange: "transform" },
    },
  };
}
