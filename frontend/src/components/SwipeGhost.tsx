import Box from "@mui/material/Box";
import type { Theme } from "@mui/material/styles";
import type { SystemStyleObject } from "@mui/system";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import type { SwipeTrack, useSwipeTabs } from "@/lib/hooks/useSwipeTabs";

interface Props {
  swipe: Pick<ReturnType<typeof useSwipeTabs>, "track" | "ghostRef">;
  index: number;
  count: number;
  /** Styles of the live pane, so the neighbour lays out the same way. */
  sx?: (i: number) => SystemStyleObject<Theme>;
  /** Renders the content of tab `i`, which must start its own queries. */
  children: (i: number) => ReactNode;
}

const GhostContext = createContext(false);

/** True inside a neighbour pane that is only a preview. Heavy parts (a chart,
 * a map) render a static stand-in there until the swipe commits and the real
 * pane mounts. */
export function useIsSwipeGhost(): boolean {
  return useContext(GhostContext);
}

/** Longest the pre-mount waits for an idle moment, in ms. */
const IDLE_TIMEOUT = 1500;

/** Calls `fn` when the browser is idle; returns the cancel. */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 200);
  return () => window.clearTimeout(id);
}

/** True once `track` should have the neighbours mounted for tab `index`: the
 * page has been idle on it, or a finger has landed. Resets with the tab, so
 * a switch never mounts new neighbours inside its own commit. */
function useArmed(track: SwipeTrack, index: number): boolean {
  const [armedFor, setArmedFor] = useState<number | null>(null);
  useEffect(() => {
    const arm = () => setArmedFor(index);
    const cancel = whenIdle(arm);
    const off = track.subscribe((e) => {
      if (e.phase === "down") arm();
    });
    return () => {
      cancel();
      off();
    };
  }, [track, index]);
  return armedFor === index;
}

/** The neighbouring tabs, mounted beside the live pane ahead of any drag (when
 * the page is idle, or at touch-down at the latest) and kept parked offscreen.
 * A swipe then only moves them by transform, so the finger drags real
 * content in with nothing left to mount. Place it as a sibling of the pane
 * inside a clipping, positioned parent. */
export function SwipeGhost({ swipe, index, count, sx, children }: Props) {
  const armed = useArmed(swipe.track, index);
  if (!armed) return null;
  return (
    <GhostContext.Provider value>
      {([-1, 1] as const).map((side) => {
        const i = index + side;
        if (i < 0 || i >= count) return null;
        return (
          <Box
            key={i}
            ref={swipe.ghostRef[side === -1 ? "-1" : "1"]}
            aria-hidden
            inert
            data-testid="swipe-ghost"
            data-side={side}
            sx={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              pointerEvents: "none",
              willChange: "transform",
              ...sx?.(i),
            }}
          >
            {children(i)}
          </Box>
        );
      })}
    </GhostContext.Provider>
  );
}
