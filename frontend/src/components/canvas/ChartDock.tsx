import Box from "@mui/material/Box";
import { type ReactNode, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { theme } from "@/lib/theme";
import { useDockMode } from "./CanvasContext";
import { layout, useLayout, useOverlay } from "./canvasStore";

const { tokens } = theme;
const { canvas } = tokens;

const FILLET = tokens.radii.md;

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
        // The shadow stops at the card's edge: card and rail read as one
        // surface.
        clipPath: "inset(-24px -24px -24px 0)",
      }}
    >
      <Box
        sx={{
          height: "100%",
          overflow: "hidden",
          bgcolor: tokens.surface,
          borderRadius: `0 ${tokens.radii.md}px ${tokens.radii.md}px 0`,
          boxShadow: tokens.elevation.e2,
          borderLeft: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        {children}
      </Box>
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          left: 0,
          top: -FILLET,
          width: FILLET,
          height: FILLET,
          // A concave corner where the rail's top meets the card's edge.
          background: `radial-gradient(circle at 100% 0, transparent ${FILLET - 0.5}px, ${tokens.surface} ${FILLET}px)`,
        }}
      />
    </Box>,
    overlay,
  );
}
