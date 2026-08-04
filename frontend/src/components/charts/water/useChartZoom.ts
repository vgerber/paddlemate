import { useCallback, useEffect, useRef, useState } from "react";

interface ChartZoomOpts {
  /** Full data time extent [min, max]; null disables zooming. */
  extent: [number, number] | null;
  /** Pixel x of the plot area's left edge inside the container. */
  plotLeft: number;
  /** Pixel width of the plot area. */
  plotWidth: number;
}

/** Never zoom in closer than this time window. */
const MIN_SPAN_MS = 10 * 60 * 1000;

/**
 * Zoom (pinch, wheel) and pan (drag while zoomed, horizontal scroll,
 * two-finger drag) for a chart's time axis.
 *
 * Native listeners go on the container (touch-action must allow it, see the
 * chart's pan-y style) so the browser doesn't hijack the pinch; in the full
 * view single-pointer gestures are left alone for the recharts tooltip.
 * Returns the zoomed domain, or null when fully zoomed out.
 */
export function useChartZoom(
  container: HTMLDivElement | null,
  { extent, plotLeft, plotWidth }: ChartZoomOpts,
): { domain: [number, number] | null; reset: () => void } {
  const [domain, setDomain] = useState<[number, number] | null>(null);

  // Refs so the stable listeners always read current values.
  const domainRef = useRef(domain);
  domainRef.current = domain;
  const extentRef = useRef(extent);
  extentRef.current = extent;
  const geomRef = useRef({ plotLeft, plotWidth });
  geomRef.current = { plotLeft, plotWidth };

  const reset = useCallback(() => setDomain(null), []);

  useEffect(() => {
    if (!container) return;

    // Active pointers: current pixel x and the time anchored under the finger
    // when the gesture started. Keeping those times pinned under the fingers
    // makes one formula handle pinch-zoom and two-finger pan alike.
    const pointers = new Map<number, { px: number; t: number }>();
    // Cached on gesture start; a getBoundingClientRect per move would force
    // layout right after the previous frame's chart update.
    let rectLeft = 0;
    // Events fire faster than frames; coalesce to one render per frame.
    let raf = 0;
    let pendingDomain: [number, number] | null = null;

    const currentDomain = () =>
      (raf ? pendingDomain : domainRef.current) ?? extentRef.current;

    const scheduleDomain = (d: [number, number] | null) => {
      pendingDomain = d;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          setDomain(pendingDomain);
        });
    };

    const pxToTime = (px: number, [a, b]: [number, number]) => {
      const g = geomRef.current;
      return a + ((px - g.plotLeft) / g.plotWidth) * (b - a);
    };

    /** Clamp to the data extent; null when this equals the full view. */
    const clampDomain = (a: number, b: number): [number, number] | null => {
      const ext = extentRef.current;
      if (!ext) return null;
      const fullSpan = ext[1] - ext[0];
      const span = Math.min(Math.max(b - a, MIN_SPAN_MS), fullSpan);
      const start = Math.min(Math.max(a, ext[0]), ext[1] - span);
      if (span >= fullSpan * 0.999) return null;
      // Reuse the previous array when pinned against a limit so React can
      // skip the re-render entirely.
      const prev = currentDomain();
      if (prev && prev[0] === start && prev[1] === start + span) return prev;
      return [start, start + span];
    };

    const onPointerDown = (e: PointerEvent) => {
      rectLeft = container.getBoundingClientRect().left;
      pointers.set(e.pointerId, { px: e.clientX - rectLeft, t: 0 });
      // (Re)pin the time currently under each finger.
      const d = currentDomain();
      if (d) for (const p of pointers.values()) p.t = pxToTime(p.px, d);
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.px = e.clientX - rectLeft;

      if (pointers.size === 1) {
        // A drag pans when zoomed; in the full view it stays with the
        // recharts tooltip scrub (and there is nothing to pan anyway).
        const d = raf ? pendingDomain : domainRef.current;
        if (!d) return;
        const g = geomRef.current;
        const span = d[1] - d[0];
        const a = p.t - ((p.px - g.plotLeft) / g.plotWidth) * span;
        scheduleDomain(clampDomain(a, a + span));
        return;
      }
      if (pointers.size !== 2) return;

      const [p1, p2] = [...pointers.values()];
      const dxPx = p2.px - p1.px;
      // Fingers (nearly) stacked would blow up the scale.
      if (Math.abs(dxPx) < 24) return;
      // Solve [a, a+span] so each anchored time stays under its finger.
      const g = geomRef.current;
      const span = ((p2.t - p1.t) * g.plotWidth) / dxPx;
      const a = p1.t - ((p1.px - g.plotLeft) / g.plotWidth) * span;
      scheduleDomain(clampDomain(a, a + span));
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      // Re-anchor what's left so a pinch hands off into a pan without a jump.
      const d = currentDomain();
      if (d) for (const p of pointers.values()) p.t = pxToTime(p.px, d);
    };

    const onWheel = (e: WheelEvent) => {
      const d = currentDomain();
      if (!d) return;
      e.preventDefault();
      rectLeft = container.getBoundingClientRect().left;

      // Horizontal scroll (trackpad) pans, vertical zooms.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const zoomed = raf ? pendingDomain : domainRef.current;
        if (!zoomed) return;
        const shift =
          (e.deltaX / geomRef.current.plotWidth) * (zoomed[1] - zoomed[0]);
        scheduleDomain(clampDomain(zoomed[0] + shift, zoomed[1] + shift));
        return;
      }

      const tCursor = pxToTime(e.clientX - rectLeft, d);
      const factor = Math.exp(e.deltaY * 0.0015);
      scheduleDomain(
        clampDomain(
          tCursor - (tCursor - d[0]) * factor,
          tCursor + (d[1] - tCursor) * factor,
        ),
      );
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    // Window-level so fingers released outside the chart still end the
    // gesture instead of leaving a stale pointer behind.
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    // React would register wheel as passive; preventDefault needs active.
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("dblclick", reset);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("dblclick", reset);
      cancelAnimationFrame(raf);
    };
  }, [container, reset]);

  return { domain, reset };
}
