import Box from "@mui/material/Box";
import { type ComponentProps, lazy, Suspense } from "react";
import { theme } from "@/lib/theme";

const { tokens } = theme;

// MapLibre is the largest dependency; routes without a map never download it.
const loadMap = () => import("./Map");
const WaterwayMap = lazy(loadMap);

/** Starts the download early, for a route that is certain to draw a map, so
 * it runs beside the route's own code instead of after it. */
export function preloadMap() {
  void loadMap();
}

/** The map's stand-in while MapLibre loads: the ground colour at the map's
 * full size, so the layout holds still when the canvas arrives. */
function MapSkeleton() {
  return (
    <Box
      data-testid="map-skeleton"
      sx={{ width: "100%", height: "100%", bgcolor: tokens.mapGround }}
    />
  );
}

/** `WaterwayMap`, loaded on demand. Same props. */
export default function LazyMap(props: ComponentProps<typeof WaterwayMap>) {
  return (
    <Suspense fallback={<MapSkeleton />}>
      <WaterwayMap {...props} />
    </Suspense>
  );
}
