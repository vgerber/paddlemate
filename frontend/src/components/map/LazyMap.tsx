import Box from "@mui/material/Box";
import { type ComponentProps, lazy, Suspense } from "react";
import { theme } from "@/lib/theme";

const { tokens } = theme;

// MapLibre is the largest dependency; routes without a map never download it.
const WaterwayMap = lazy(() => import("./Map"));

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
