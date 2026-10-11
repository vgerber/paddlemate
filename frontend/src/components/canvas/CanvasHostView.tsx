import Box from "@mui/material/Box";
import { useEffect, useMemo } from "react";
import WaterwayMap from "@/components/map/Map";
import { controlInset } from "@/lib/canvasLayout";
import { theme } from "@/lib/theme";
import { useFreeArea } from "./CanvasContext";
import { layout, overlay } from "./canvasStore";
import type { MapScene } from "./scene";
import { useWindowSize } from "./useWindowSize";

const { tokens } = theme;

/** The map under the app bar, with the free map area as its fit padding, and
 * the overlay the cards float in. The overlay lets clicks through to the map
 * except where a card takes them. */
export default function CanvasHostView({ scene }: { scene: MapScene }) {
  const size = useWindowSize();
  useEffect(() => layout.setViewport(size), [size]);
  const { padding, rect } = useFreeArea();

  const { camera, subject, chrome, ...mapProps } = scene;
  const mapChrome = useMemo(
    () => ({ ...chrome, inset: controlInset(padding) }),
    [chrome, padding],
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
      <WaterwayMap {...mapProps} camera={mapCamera} chrome={mapChrome} />
      <Box
        ref={overlay.set}
        sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
    </Box>
  );
}
