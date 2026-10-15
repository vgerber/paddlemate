import Box from "@mui/material/Box";
import { createFileRoute } from "@tanstack/react-router";
import { useCanvasScene } from "@/components/canvas/CanvasContext";
import CanvasLayout from "@/components/canvas/CanvasLayout";
import MapDetailCard from "@/components/map-page/MapDetailCard";
import MapPane from "@/components/map-page/MapPane";
import MobileOverlay from "@/components/map-page/MobileOverlay";
import { useMapPageState } from "@/components/map-page/useMapPageState";
import { useMapScene } from "@/components/map-page/useMapScene";
import {
  formatWaterLevels,
  parseWaterLevels,
} from "@/components/search/waterParam";
import { PANEL_HEIGHT } from "@/lib/theme";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    waterway: search.waterway ? Number(search.waterway) : undefined,
    section: search.section ? Number(search.section) : undefined,
    q: typeof search.q === "string" ? search.q || undefined : undefined,
    country:
      typeof search.country === "string"
        ? search.country || undefined
        : undefined,
    min_diff: search.min_diff != null ? Number(search.min_diff) : undefined,
    max_diff: search.max_diff != null ? Number(search.max_diff) : undefined,
    mode:
      search.mode === "area" || search.mode === "region"
        ? (search.mode as "area" | "region")
        : undefined,
    // Search params are JSON-serialized, so a string would come back
    // quoted ("1") and a hand-written ?panel=1 would parse as a number.
    // A boolean round-trips as ?panel=true either way.
    panel:
      search.panel === true || search.panel === "1" || search.panel === 1
        ? (true as const)
        : undefined,
    lat: search.lat != null ? Number(search.lat) : undefined,
    lon: search.lon != null ? Number(search.lon) : undefined,
    radius: search.radius != null ? Number(search.radius) : undefined,
    region: search.region != null ? Number(search.region) : undefined,
    // Kept as the comma string the app writes; the search hook parses it.
    water: formatWaterLevels(parseWaterLevels(search.water) ?? []),
  }),
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  const state = useMapPageState(search);
  const scene = useMapScene(state);
  // From md the canvas host draws the scene behind the cards; on a phone the
  // map pane below draws the same scene.
  useCanvasScene(scene);

  if (!state.isMobile) {
    return (
      <CanvasLayout>
        <MapDetailCard state={state} />
      </CanvasLayout>
    );
  }

  return (
    <>
      <Box
        sx={{
          display: "flex",
          height: PANEL_HEIGHT,
          overflow: "hidden",
        }}
      >
        <MapPane
          state={state}
          scene={scene}
          onOpenMobilePanel={() => state.setIsMobilePanelOpen(true)}
        />
      </Box>
      <MobileOverlay state={state} />
    </>
  );
}
