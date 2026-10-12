import Box from "@mui/material/Box";
import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { transition } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { tokens } = theme;
const { canvas } = tokens;

const STEP = 16;
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
  const grow = side === "left" ? 1 : -1;

  const push = (next: number) => {
    current.current = clamp(next, min, max);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => onLive(current.current));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width };
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
      sx={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        [side === "left" ? "right" : "left"]: 0,
        width: canvas.gripHit,
        height: tokens.touch.min,
        display: "grid",
        // The pill hugs the card's edge so it stays off the rows.
        placeItems: side === "left" ? "center end" : "center start",
        cursor: "col-resize",
        touchAction: "none",
        outline: "none",
        // A pill with two grip lines, so it reads as a handle and not as the
        // card's scrollbar.
        "& > span": {
          width: canvas.gripBar.w,
          height: canvas.gripBar.h,
          boxSizing: "border-box",
          borderRadius: `${tokens.radii.pill}px`,
          bgcolor: tokens.surfaceLowest,
          border: `1px solid ${tokens.outline}`,
          boxShadow: tokens.elevation.e1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "3px",
          color: tokens.outline,
          transition: transition(["border-color", "color"], {
            duration: "fast",
          }),
          "&::before, &::after": {
            content: '""',
            width: 2,
            height: 16,
            borderRadius: `${tokens.radii.pill}px`,
            bgcolor: "currentColor",
          },
        },
        "&:hover > span, &:focus-visible > span, &:active > span": {
          color: tokens.primary,
          borderColor: tokens.primary,
        },
      }}
    >
      <span />
    </Box>
  );
}
