import Box from "@mui/material/Box";
import type { Theme } from "@mui/material/styles";
import type { SystemStyleObject } from "@mui/system";
import type { ReactNode } from "react";
import type { useSwipeTabs } from "@/lib/hooks/useSwipeTabs";

interface Props {
  swipe: Pick<ReturnType<typeof useSwipeTabs>, "side" | "ghostRef">;
  index: number;
  count: number;
  /** Styles of the live pane, so the neighbour lays out the same way. */
  sx?: (i: number) => SystemStyleObject<Theme>;
  /** Renders the content of tab `i`, which must start its own queries. */
  children: (i: number) => ReactNode;
}

/** The neighbouring tab, mounted beside the live pane while a swipe is in
 * progress and moved with it, so the finger drags real content in rather than
 * blank space. Place it as a sibling of the pane inside a clipping, positioned
 * parent. Only the one neighbour in the drag direction is mounted. */
export function SwipeGhost({ swipe, index, count, sx, children }: Props) {
  const i = index + swipe.side;
  if (swipe.side === 0 || i < 0 || i >= count) return null;
  return (
    <Box
      ref={swipe.ghostRef}
      aria-hidden
      inert
      data-testid="swipe-ghost"
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
}
