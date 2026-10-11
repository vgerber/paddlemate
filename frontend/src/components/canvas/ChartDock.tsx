import Box from "@mui/material/Box";
import { type ReactNode, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { theme } from "@/lib/theme";
import { useDockMode } from "./CanvasContext";
import { layout, useLayout, useOverlay } from "./canvasStore";

const { tokens } = theme;
const { canvas } = tokens;

/** Where the chart goes. From 1280 wide it docks along the bottom of the free
 * map area, between the cards; narrower, it renders in place, so put it as
 * the first block of the detail card. */
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
        overflow: "hidden",
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.lg}px`,
        boxShadow: tokens.elevation.e2,
      }}
    >
      {children}
    </Box>,
    overlay,
  );
}
