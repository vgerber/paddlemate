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
import { transition } from "@/lib/motion";
import {
  dragHeight,
  offsetFor,
  type SheetState,
  settleState,
  snapHeights,
} from "@/lib/sheetSnap";
import { releaseVelocity, type Sample } from "@/lib/swipe";
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
  const drag = useRef<{ y0: number; h0: number; samples: Sample[] } | null>(
    null,
  );
  // A drag ends in a click on the handle; it must not also toggle.
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

  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el || state === "closed") return;
    el.style.transition = transition("transform", { easing: "easeInOut" });
    el.style.transform = `translate3d(0,${gap}px,0)`;
  }, [state, gap]);

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
    e.currentTarget.setPointerCapture(e.pointerId);
    dragged.current = false;
    drag.current = {
      y0: e.clientY,
      h0: resting,
      samples: [{ x: e.clientY, t: e.timeStamp }],
    };
    if (sheet.current) sheet.current.style.transition = "none";
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || !sheet.current) return;
    d.samples.push({ x: e.clientY, t: e.timeStamp });
    if (Math.abs(e.clientY - d.y0) > 4) dragged.current = true;
    const h = dragHeight(d.h0, e.clientY - d.y0, snaps);
    sheet.current.style.transform = `translate3d(0,${offsetFor(h, snaps)}px,0)`;
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
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
      el.style.transition = transition("transform", { easing: "easeInOut" });
      el.style.transform = `translate3d(0,${offsetFor(resting, snaps)}px,0)`;
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
            bgcolor: withAlpha(tokens.onSurface, "border"),
          }}
        />
      )}
      <FocusTrap open={state === "open"} disableAutoFocus disableRestoreFocus>
        <Box
          ref={sheet}
          onKeyDown={(e) => {
            if (state === "open" && e.key === "Escape") onStateChange("closed");
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
              if (dragged.current) return;
              onStateChange(state === "open" ? "peek" : "open");
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
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
                bgcolor: tokens.outlineVariant,
              }}
            />
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {children}
          </Box>
        </Box>
      </FocusTrap>
    </>,
    document.body,
  );
}
