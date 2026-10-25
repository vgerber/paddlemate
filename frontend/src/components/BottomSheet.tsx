import Box from "@mui/material/Box";
import FocusTrap from "@mui/material/Unstable_TrapFocus";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { withAlpha } from "@/lib/alpha";
import { css, prefersReducedMotion, releaseMs } from "@/lib/motion";
import {
  dragHeight,
  offsetFor,
  type SheetState,
  type Snaps,
  settleState,
  snapHeights,
} from "@/lib/sheetSnap";
import { lockDirection, releaseVelocity, type Sample } from "@/lib/swipe";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface BottomSheetProps {
  /** `closed` renders nothing. */
  state: SheetState | "closed";
  onStateChange: (state: SheetState | "closed") => void;
  /** Accessible name of the sheet. */
  label: string;
  /** Visible height at rest when peeking, in px. */
  peekHeight?: number;
  children: ReactNode;
}

/** The nearest ancestor of `from`, inside `root`, that scrolls vertically. */
function scrollerAt(from: HTMLElement, root: HTMLElement | null) {
  for (let el: HTMLElement | null = from; el && el !== root; ) {
    const overflow = getComputedStyle(el).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/** Whether a vertical drag moves the sheet or scrolls the content: the sheet
 * takes it from anywhere that does not scroll, from content at its top when
 * the drag goes down, and from content when the sheet can still rise. */
function takesDrag(
  scroller: HTMLElement | null,
  dy: number,
  height: number,
  snaps: Snaps,
) {
  if (!scroller) return true;
  if (dy > 0) return scroller.scrollTop <= 0;
  return height < snaps.open;
}

/** Moves the sheet to `to` px of offset from `from`: a curve whose time grows
 * with the distance left, settling going up and easing out going down. Under
 * reduced motion it snaps. */
function settleTo(el: HTMLElement, from: number, to: number) {
  const px = Math.abs(to - from);
  el.style.transition =
    prefersReducedMotion() || px === 0
      ? "none"
      : `transform ${releaseMs(px)}ms ${to < from ? css.settle : css.easeOut}`;
  el.style.transform = `translate3d(0,${to}px,0)`;
}

/** A sheet from the bottom edge with a peek and an open height. Drag the
 * handle between them; open shows a scrim, traps focus, and Escape closes it.
 * Moves by transform only. */
export default function BottomSheet({
  state,
  onStateChange,
  label,
  peekHeight = 120,
  children,
}: BottomSheetProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    h0: number;
    locked: boolean;
    /** The scrolling content under the finger, if any. */
    scroller: HTMLElement | null;
    samples: Sample[];
  } | null>(null);
  // A drag ends in a click on whatever was under the finger; it must not
  // also toggle the handle or open a row.
  const dragged = useRef(false);
  const [viewport, setViewport] = useState(() => window.innerHeight);
  const snaps = snapHeights(viewport, peekHeight);
  const resting = state === "open" ? snaps.open : snaps.peek;
  const gap = offsetFor(resting, snaps);

  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Where the sheet is now, so a release knows how far it has left to go.
  const offset = useRef(gap);
  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el || state === "closed") return;
    settleTo(el, offset.current, gap);
    offset.current = gap;
  }, [state, gap]);

  // While the sheet follows a drag the browser must not also scroll or pan.
  // React's touch props are passive, so this is a native listener.
  const closed = state === "closed";
  useEffect(() => {
    const el = sheet.current;
    if (!el || closed) return;
    const hold = (e: TouchEvent) => {
      if (drag.current?.locked && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => el.removeEventListener("touchmove", hold);
  }, [closed]);

  // An open sheet and its scrim cover the whole app: what is behind them is
  // neither reachable by Tab nor read out. The sheet is portaled outside the
  // app root, so it is not inerted with it.
  const modal = state === "open";
  useEffect(() => {
    const root = document.getElementById("root");
    if (!modal || !root || root.inert) return;
    root.inert = true;
    return () => {
      root.inert = false;
    };
  }, [modal]);

  useEffect(() => {
    // Not when focus is already inside: typing in a field that opens the
    // sheet must keep the field focused (and the phone keyboard up).
    const el = sheet.current;
    if (state === "open" && el && !el.contains(document.activeElement)) {
      el.focus();
    }
  }, [state]);

  // Whatever had focus when the sheet appeared gets it back when it closes.
  const opener = useRef<HTMLElement | null>(null);
  const wasClosed = useRef(true);
  useLayoutEffect(() => {
    const closed = state === "closed";
    if (wasClosed.current && !closed) {
      opener.current = document.activeElement as HTMLElement | null;
    } else if (!wasClosed.current && closed) {
      if (opener.current?.isConnected) opener.current.focus();
      opener.current = null;
    }
    wasClosed.current = closed;
  }, [state]);

  if (state === "closed") return null;

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    dragged.current = false;
    const onHandle = !!handle.current?.contains(e.target as Node);
    // A mouse drags by the handle only; touch and pen drag from anywhere.
    if (e.pointerType === "mouse") {
      if (!onHandle) return;
      // A touch is captured by the browser; a mouse leaves the sheet. The
      // handle keeps the capture so its click still lands on it.
      handle.current?.setPointerCapture(e.pointerId);
    }
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      h0: resting,
      locked: false,
      scroller: onHandle
        ? null
        : scrollerAt(e.target as HTMLElement, sheet.current),
      samples: [{ x: e.clientY, t: e.timeStamp }],
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !sheet.current) return;
    d.samples.push({ x: e.clientY, t: e.timeStamp });
    const dy = e.clientY - d.y0;
    if (!d.locked) {
      const lock = lockDirection(e.clientX - d.x0, dy);
      if (lock === "pending") return;
      // Horizontal belongs to the tab swipe; a scroll belongs to the content.
      if (lock === "horizontal" || !takesDrag(d.scroller, dy, resting, snaps)) {
        drag.current = null;
        return;
      }
      d.locked = true;
      dragged.current = true;
      if (e.pointerType !== "mouse") {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      sheet.current.style.transition = "none";
    }
    const h = dragHeight(d.h0, dy, snaps);
    offset.current = offsetFor(h, snaps);
    sheet.current.style.transform = `translate3d(0,${offset.current}px,0)`;
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.locked) return;
    d.samples.push({ x: e.clientY, t: e.timeStamp });
    const next = settleState(
      dragHeight(d.h0, e.clientY - d.y0, snaps),
      releaseVelocity(d.samples),
      snaps,
    );
    if (next === state) {
      // Same state, so the layout effect will not run: settle by hand.
      const el = sheet.current;
      if (!el) return;
      settleTo(el, offset.current, offsetFor(resting, snaps));
      offset.current = offsetFor(resting, snaps);
      return;
    }
    onStateChange(next);
  };

  // In a portal on the body, after the app root: the bottom nav shares this
  // z-index, and a later sibling wins the tie, so an open sheet and its scrim
  // cover the nav. Dialogs and menus opened from the sheet are later still.
  // Not MUI's Portal: it mounts its children a pass late, after the focus
  // effect above has looked for the sheet.
  return createPortal(
    <>
      {state === "open" && (
        <Box
          data-testid="sheet-scrim"
          onClick={() => onStateChange("peek")}
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: theme.zIndex.modal,
            bgcolor: withAlpha(tokens.scrimBase, "border"),
          }}
        />
      )}
      <FocusTrap open={state === "open"} disableAutoFocus disableRestoreFocus>
        <Box
          ref={sheet}
          onKeyDown={(e) => {
            if (state === "open" && e.key === "Escape") onStateChange("closed");
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={(e) => {
            if (!dragged.current) return;
            dragged.current = false;
            e.stopPropagation();
            e.preventDefault();
          }}
          role={state === "open" ? "dialog" : "region"}
          aria-modal={state === "open" ? true : undefined}
          aria-label={label}
          tabIndex={-1}
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            height: snaps.open,
            zIndex: theme.zIndex.modal,
            display: "flex",
            flexDirection: "column",
            bgcolor: tokens.surface,
            borderRadius: `${tokens.radii.xl}px ${tokens.radii.xl}px 0 0`,
            boxShadow: tokens.elevation.e2,
            outline: "none",
            // Starts at the peek so the first paint does not jump.
            transform: `translate3d(0,${offsetFor(resting, snaps)}px,0)`,
          }}
        >
          <Box
            component="button"
            type="button"
            aria-expanded={state === "open"}
            aria-label={state === "open" ? "Shrink panel" : "Expand panel"}
            onClick={() => {
              onStateChange(state === "open" ? "peek" : "open");
            }}
            ref={handle}
            sx={{
              // Above content that is pulled up under the handle's foot.
              position: "relative",
              zIndex: 1,
              touchAction: "none",
              cursor: "grab",
              border: 0,
              p: 0,
              bgcolor: "transparent",
              width: "100%",
              "&:focus-visible": {
                outline: `2px solid ${tokens.primary}`,
                outlineOffset: -2,
              },
              flexShrink: 0,
              height: tokens.touch.min,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 4,
                borderRadius: `${tokens.radii.pill}px`,
                bgcolor: tokens.outlineControl,
              }}
            />
          </Box>
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              // Vertical is the sheet's or the list's; sideways is the
              // tab swipe's own.
              touchAction: "pan-y",
              overscrollBehavior: "contain",
            }}
          >
            {children}
          </Box>
        </Box>
      </FocusTrap>
    </>,
    document.body,
  );
}
