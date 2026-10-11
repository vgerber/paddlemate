import {
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { prefersReducedMotion, transition } from "@/lib/motion";
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

/** Horizontal swipe between tab panes. Spread `paneProps` on the element that
 * holds the active pane; the pane follows the finger by transform only and
 * settles on the next tab or springs back. Pass `progress` and `dragging` to
 * `UnderlineTabs` so its underline follows. Touch and pen only: a mouse keeps
 * text selection, and the tab bar stays the other way in. */
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
  const enterFrom = useRef(0);
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

  // The new pane enters from the side the old one left toward.
  // biome-ignore lint/correctness/useExhaustiveDependencies: index is the trigger
  useLayoutEffect(() => {
    const width = paneRef.current?.offsetWidth ?? 0;
    const from = enterFrom.current;
    enterFrom.current = 0;
    if (!from || !width || prefersReducedMotion()) return;
    place(from * width);
    void paneRef.current?.offsetWidth;
    place(0, settleDuration(width, width));
    // `index` is the trigger; the rest is read from refs.
  }, [index, place]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const reset = useCallback(() => {
    drag.current = null;
    busy.current = false;
    place(0);
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
    setProgress(dragProgress(d.offset, e.currentTarget.offsetWidth));
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.lock !== "horizontal") return;
    const width = e.currentTarget.offsetWidth;
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
    const commit = () => {
      enterFrom.current = dir;
      busy.current = false;
      place(0);
      setProgress(0);
      onIndexChange(target);
    };
    if (prefersReducedMotion()) {
      enterFrom.current = 0;
      busy.current = false;
      place(0);
      setProgress(0);
      onIndexChange(target);
      return;
    }
    busy.current = true;
    const ms = settleDuration(width + (dir > 0 ? d.offset : -d.offset), width);
    setProgress(dir);
    place(-dir * width, ms);
    timer.current = window.setTimeout(commit, ms);
  };

  const onPointerCancel = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    window.clearTimeout(timer.current);
    reset();
  };

  return {
    progress,
    dragging,
    paneProps: {
      ref: (el: HTMLElement | null) => {
        paneRef.current = el;
      },
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: { touchAction: "pan-y" as const, willChange: "transform" },
    },
  };
}
