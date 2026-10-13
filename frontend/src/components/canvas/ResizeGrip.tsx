import Box from "@mui/material/Box";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { transition } from "@/lib/motion";
import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;
const { canvas } = tokens;

/** Bar height while hovered, focused or dragged. */
const STEP = 16;

const dots = (color: string) =>
  `radial-gradient(circle, ${color} 1.5px, transparent 1.75px) content-box 0 0 / 6px 6px repeat, ${tokens.surfaceLowest}`;
const STEP_BIG = 64;

interface ResizeGripProps {
  /** The side of the window the card hugs; the grip sits on its inner edge. */
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  label: string;
  /** Called with each new width while dragging or pressing keys. */
  onLive: (width: number) => void;
  /** Called once the drag or key press is over, with the final width. */
  onCommit: (width: number) => void;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

/** The handle on a resizable card: a labelled separator you drag, or focus
 * and nudge with the arrow keys (Shift for bigger steps, Home and End for the
 * limits). */
export default function ResizeGrip({
  side,
  width,
  min,
  max,
  label,
  onLive,
  onCommit,
}: ResizeGripProps) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  // The latest width this gesture produced, so the commit does not wait for
  // a render.
  const current = useRef(width);
  const frame = useRef(0);
  const [dragging, setDragging] = useState(false);
  const grow = side === "left" ? 1 : -1;

  const push = (next: number) => {
    current.current = clamp(next, min, max);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => onLive(current.current));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width };
    setDragging(true);
    current.current = width;
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    push(start.width + grow * (e.clientX - start.x));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    cancelAnimationFrame(frame.current);
    onCommit(current.current);
  };

  const dirty = useRef(false);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = (e.shiftKey ? STEP_BIG : STEP) * grow;
    // A held key repeats before React renders the width it produced.
    const base = dirty.current ? current.current : width;
    const targets: Record<string, number> = {
      ArrowRight: base + step,
      ArrowLeft: base - step,
      Home: min,
      End: max,
    };
    const next = targets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    dirty.current = true;
    push(next);
  };
  const onKeyUp = () => {
    if (!dirty.current) return;
    dirty.current = false;
    cancelAnimationFrame(frame.current);
    onLive(current.current);
    onCommit(current.current);
  };

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-dragging={dragging || undefined}
      sx={{
        position: "absolute",
        top: "50%",
        // Centred on the card's edge, half over the map.
        [side === "left" ? "right" : "left"]: -canvas.gripHit.w / 2,
        width: canvas.gripHit.w,
        height: canvas.gripHit.h,
        transform: "translateY(-50%)",
        zIndex: 1,
        display: "grid",
        placeItems: "center",
        cursor: "col-resize",
        touchAction: "none",
        outline: "none",
        opacity: width <= min || width >= max ? 0.4 : 1,
        transition: transition(["opacity"], { duration: "fast" }),
        "& > span": {
          width: canvas.gripBar.w,
          height: canvas.gripBar.h,
          borderRadius: `${tokens.radii.pill}px`,
          // A soft edge; the shadow and the dots carry the tab.
          boxShadow: `${tokens.elevation.e2}, inset 0 0 0 1px ${tokens.outline}${alphas.hairline}`,
          // Two columns of three dots over the tab's fill; the dots layer is
          // held to the content box, the fill covers the whole tab.
          background: dots(tokens.onSurfaceVariant),
          padding: "15px 1px",
          boxSizing: "border-box",
          transition: transition(["box-shadow"], { duration: "fast" }),
        },
        "&:hover > span, &:focus-visible > span, &[data-dragging] > span": {
          background: dots(tokens.primary),
          boxShadow: `${tokens.elevation.e2}, inset 0 0 0 2px ${tokens.primary}`,
        },
        "&:focus-visible > span": {
          outline: `2px solid ${tokens.primary}`,
          outlineOffset: 2,
        },
      }}
    >
      <span />
    </Box>
  );
}
