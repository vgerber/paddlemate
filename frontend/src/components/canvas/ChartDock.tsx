import Box from "@mui/material/Box";
import { type ReactNode, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { theme } from "@/lib/theme";
import { useDockMode } from "./CanvasContext";
import { layout, useLayout, useOverlay } from "./canvasStore";

const { tokens } = theme;
const { canvas } = tokens;

/** The reading rail. From 1280 wide it is the rest of the detail card's foot:
 * it starts at the card's edge, along the foot of the window, and holds the
 * plot. Narrower, it renders in place, so put it as the first block of the
 * detail card. */
export default function ChartDock({ children }: { children: ReactNode }) {
  const mode = useDockMode();
  const overlay = useOverlay();
  const docked = mode === "dock" && overlay != null;
  const dock = useLayout((s) => s.dock);

  useLayoutEffect(() => {
    if (!docked) return;
    layout.addDock(1);
    return () => layout.addDock(-1);
  }, [docked]);

  if (!docked) return <>{children}</>;
  if (!dock) return null;
  return createPortal(
    <Box
      data-testid="chart-dock"
      sx={{
        position: "absolute",
        left: dock.left,
        width: dock.width,
        height: dock.height,
        bottom: canvas.margin,
        pointerEvents: "auto",
      }}
    >
      <Box
        sx={{
          height: "100%",
          overflow: "hidden",
          bgcolor: tokens.surface,
          // Its own card, a gutter from the detail card, same foot line.
          borderRadius: `${tokens.radii.lg}px`,
          boxShadow: tokens.elevation.e2,
        }}
      >
        {children}
      </Box>
    </Box>,
    overlay,
  );
}
