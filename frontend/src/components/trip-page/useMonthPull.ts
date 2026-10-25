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
  releaseMs,
} from "@/lib/motion";
import { pulledOpen } from "./planWeek";

/** Height of a week row and of the month title, in px. */
export const MONTH_ROW = 48;
export const MONTH_TITLE = 44;
/** Delay per week away from the anchor when the month fans out. */
export const FAN_MS = 22;

interface Layers {
  panel: HTMLElement;
  scrim: HTMLElement | null;
  handle: HTMLElement | null;
}

function ease(prop: string, ms: number, delay = 0): string {
  return `${prop} ${Math.round(ms)}ms ${css.easeInOut} ${delay}ms`;
}

/**
 * Paints the month at progress p (0 = the week alone, 1 = the month) straight
 * on the DOM, so a drag costs no render. The panel's lower edge is a clip-path
 * inset and the handle rides the edge; the weeks fold onto the anchor week
 * (the one holding the current day), the rest fading in as they leave it.
 * With `anim` the properties transition to p, the weeks fanning out per week
 * away from the anchor when `fan` is set.
 */
function paint(
  { panel, scrim, handle }: Layers,
  p: number,
  dist: number,
  anim: { ms: number; fan: boolean } | null,
) {
  const tr = (prop: string, delay = 0) =>
    anim ? ease(prop, anim.ms, delay) : "none";
  panel.style.clipPath = `inset(0 0 ${(1 - p) * dist}px 0)`;
  panel.style.transition = tr("clip-path");
  if (scrim) {
    scrim.style.opacity = String(p);
    scrim.style.transition = tr("opacity");
  }
  if (handle) {
    handle.style.transform = `translateY(${p * dist}px)`;
    handle.style.transition = tr("transform");
  }
  const title = panel.querySelector<HTMLElement>("[data-pr=title]");
  if (title) {
    title.style.opacity = String(p);
    title.style.transition = tr("opacity");
  }
  const body = panel.querySelector<HTMLElement>("[data-pr=body]");
  if (body) {
    body.style.transform = `translateY(${-(1 - p) * MONTH_TITLE}px)`;
    body.style.transition = tr("transform");
  }
  const weeks = Array.from(
    panel.querySelectorAll<HTMLElement>("[data-pr=week]"),
  );
  const anchor = Math.max(
    0,
    weeks.findIndex((w) => w.dataset.hasCurrent === "true"),
  );
  weeks.forEach((w, j) => {
    const delay = anim?.fan ? FAN_MS * Math.abs(j - anchor) : 0;
    w.style.transform = `translateY(${(1 - p) * (anchor - j) * MONTH_ROW}px)`;
    w.style.opacity = String(j === anchor ? 1 : p);
    w.style.transition = anim
      ? `${ease("transform", anim.ms, delay)}, ${ease("opacity", anim.ms, delay)}`
      : "none";
  });
}

/**
 * The month pulled open from the week strip. Dragging the handle moves the
 * panel 1:1; a release settles on the scale (260 ms, or the time the rest of
 * the pull needs), a tap or `open` changing runs the full 260 ms. Closing
 * folds with no stagger. Reduced motion jumps the geometry and cross-fades
 * the panel and the scrim instead.
 */
export function useMonthPull({
  open,
  onOpenChange,
  onPullStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called before the month shows, to point it at the current month. */
  onPullStart: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const dist = useRef(0);
  const progress = useRef(open ? 1 : 0);
  const drag = useRef<{ y: number; p: number } | null>(null);
  const pulled = useRef(false);
  const unmount = useRef<ReturnType<typeof setTimeout> | null>(null);

  const layers = useCallback((): Layers | null => {
    const panel = panelRef.current;
    if (!panel) return null;
    return { panel, scrim: scrimRef.current, handle: handleRef.current };
  }, []);

  const measure = useCallback(() => {
    const panel = panelRef.current;
    const root = rootRef.current;
    if (panel && root) dist.current = panel.offsetHeight - root.offsetHeight;
  }, []);

  const settle = useCallback(
    (target: 0 | 1) => {
      const l = layers();
      if (!l) return;
      if (unmount.current) clearTimeout(unmount.current);
      for (const a of l.panel.getAnimations()) a.cancel();
      measure();
      const from = progress.current;
      progress.current = target;
      const finish = (ms: number) => {
        if (target === 0)
          unmount.current = setTimeout(() => setMounted(false), ms + 30);
      };
      if (prefersReducedMotion()) {
        paint(l, target, dist.current, null);
        if (l.scrim) {
          l.scrim.style.transition = `opacity ${REDUCED_FADE_MS}ms ${css.easeInOut}`;
        }
        if (from !== target) {
          l.panel.animate(
            { opacity: target ? [0, 1] : [1, 0] },
            { duration: REDUCED_FADE_MS, fill: "forwards" },
          );
        }
        finish(REDUCED_FADE_MS);
        return;
      }
      const px = Math.abs(target - from) * dist.current;
      const ms = pulled.current ? releaseMs(px) : durations.base;
      pulled.current = false;
      paint(l, target, dist.current, { ms, fan: target === 1 });
      finish(ms + FAN_MS * 6);
    },
    [layers, measure],
  );

  useLayoutEffect(() => {
    if (open && !mounted) {
      setMounted(true);
      return;
    }
    const l = layers();
    if (!l) return;
    measure();
    if (!l.panel.dataset.painted) {
      // A fresh panel starts on the week.
      l.panel.dataset.painted = "1";
      progress.current = 0;
      paint(l, 0, dist.current, null);
      void l.panel.offsetHeight;
    }
    // A pull in progress is painted by the pointer.
    if (!drag.current) settle(open ? 1 : 0);
  }, [open, mounted, layers, measure, settle]);

  // Another month has another number of weeks: the handle follows the edge.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !mounted) return;
    let first = true;
    const watch = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      const l = layers();
      if (!l || progress.current !== 1 || drag.current) return;
      measure();
      paint(l, 1, dist.current, null);
    });
    watch.observe(panel);
    return () => watch.disconnect();
  }, [mounted, layers, measure]);

  useEffect(
    () => () => {
      if (unmount.current) clearTimeout(unmount.current);
    },
    [],
  );

  const onDown = (e: PointerEvent<HTMLElement>) => {
    drag.current = { y: e.clientY, p: open ? 1 : 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!open) {
      onPullStart();
      setMounted(true);
    }
  };

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    const l = layers();
    if (!d || !l || dist.current <= 0) return;
    if (unmount.current) clearTimeout(unmount.current);
    const p = Math.min(1, Math.max(0, d.p + (e.clientY - d.y) / dist.current));
    progress.current = p;
    paint(l, p, dist.current, null);
  };

  const onUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dy = e.clientY - d.y;
    // A tap is a toggle; a pull goes the way it was pulled.
    const next = Math.abs(dy) < 6 ? !open : pulledOpen(dy, open);
    if (next && !open) onPullStart();
    pulled.current = Math.abs(dy) >= 6;
    onOpenChange(next);
    if (next === open) settle(next ? 1 : 0);
  };

  const onCancel = () => {
    drag.current = null;
    settle(open ? 1 : 0);
  };

  return {
    mounted,
    rootRef,
    panelRef,
    scrimRef,
    handleRef,
    handlers: {
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerCancel: onCancel,
    },
  };
}
