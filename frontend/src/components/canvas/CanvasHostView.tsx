import Box from "@mui/material/Box";
import { useEffect, useMemo } from "react";
import WaterwayMap from "@/components/map/Map";
import { controlInset } from "@/lib/canvasLayout";
import { theme } from "@/lib/theme";
import { useFreeArea } from "./CanvasContext";
import { layout, overlay, useLayout } from "./canvasStore";
import { installFocusReturn } from "./focusReturn";
import type { MapScene } from "./scene";
import { useWindowSize } from "./useWindowSize";

const { tokens } = theme;

/** The map under the app bar, with the free map area as its fit padding, and
 * the overlay the cards float in. The overlay lets clicks through to the map
 * except where a card takes them. */
export default function CanvasHostView({ scene }: { scene: MapScene }) {
  const size = useWindowSize();
  useEffect(() => layout.setViewport(size), [size]);
  useEffect(() => installFocusReturn(), []);
  const { padding, clear, rect } = useFreeArea();
  const rail = useLayout((s) => s.dock?.height ?? null);

  const { camera, subject, chrome, ...mapProps } = scene;
  const mapChrome = useMemo(
    () => ({ ...chrome, inset: controlInset(clear, rail) }),
    [chrome, clear, rail],
  );
  const mapCamera = useMemo(
    () => ({ ...camera, padding, subject }),
    [camera, padding, subject],
  );

  return (
    <Box
      data-testid="canvas-host"
      data-free={`${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}`}
      data-padding={`${padding.top},${padding.right},${padding.bottom},${padding.left}`}
      sx={{
        position: "fixed",
        top: tokens.chrome.appBar,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
      }}
    >
      {/* The overlay comes first in the DOM so Tab reaches the cards before
          the map's controls; zIndex keeps it painted over the map. */}
      <Box
        ref={overlay.set}
        sx={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      <WaterwayMap {...mapProps} camera={mapCamera} chrome={mapChrome} />
    </Box>
  );
}
