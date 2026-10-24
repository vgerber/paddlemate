import { useEffect, useRef, useState } from "react";
import { dragRange } from "./summary";
import type { CustomRange } from "./types";

/** Drags shorter than this many px are clicks, not a selection. */
const MIN_DRAG_PX = 8;
/** The narrowest span a selection may zoom to. */
const MIN_SPAN_MS = 60 * 60 * 1000;

interface DragSelectOpts {
  /** Pixel x of the plot's left edge inside the container. */
  plotLeft: number;
  plotWidth: number;
  /** The time window the plot shows now. */
  window: [number, number];
  /** Called with the selected span; absent turns the gesture off. */
  onSelect?: (range: CustomRange) => void;
}

/**
 * Drag over the plot with a mouse to pick a span (touch keeps swiping and
 * scrubbing). Returns the selection's pixel extent while dragging, for
 * drawing.
 */
export function useDragSelect(
  container: HTMLDivElement | null,
  opts: DragSelectOpts,
): { x0: number; x1: number } | null {
  const [selection, setSelection] = useState<{ x0: number; x1: number } | null>(
    null,
  );
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!container) return;

    const onDown = (down: PointerEvent) => {
      if (down.pointerType !== "mouse" || down.button !== 0) return;
      if (!optsRef.current.onSelect) return;
      const left = container.getBoundingClientRect().left;
      const clampX = (clientX: number) => {
        const { plotLeft, plotWidth } = optsRef.current;
        return Math.min(
          Math.max(clientX - left, plotLeft),
          plotLeft + plotWidth,
        );
      };
      const start = clampX(down.clientX);
      let end = start;

      const onMove = (e: PointerEvent) => {
        end = clampX(e.clientX);
        if (Math.abs(end - start) >= MIN_DRAG_PX) {
          setSelection({ x0: Math.min(start, end), x1: Math.max(start, end) });
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setSelection(null);
        if (Math.abs(end - start) < MIN_DRAG_PX) return;
        const { plotLeft, plotWidth, window: win, onSelect } = optsRef.current;
        const time = (px: number) =>
          win[0] + ((px - plotLeft) / plotWidth) * (win[1] - win[0]);
        const range = dragRange(time(start), time(end), MIN_SPAN_MS);
        if (range) onSelect?.(range);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };

    container.addEventListener("pointerdown", onDown);
    return () => container.removeEventListener("pointerdown", onDown);
  }, [container]);

  return selection;
}
