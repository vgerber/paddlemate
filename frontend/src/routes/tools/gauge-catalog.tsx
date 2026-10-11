import Box from "@mui/material/Box";
import { createFileRoute } from "@tanstack/react-router";
import GaugeCatalogMap from "@/components/gauge-catalog/GaugeCatalogMap";
import { PANEL_HEIGHT } from "@/lib/theme";

export const Route = createFileRoute("/tools/gauge-catalog")({
  component: GaugeCatalogPage,
});

function GaugeCatalogPage() {
  // Full-bleed map: fill the viewport below the app bar (and above the mobile
  // bottom nav). Positioned so the map's absolute overlays anchor to it.
  return (
    <Box
      sx={{
        position: "relative",
        height: PANEL_HEIGHT,
        overflow: "hidden",
      }}
    >
      <GaugeCatalogMap />
    </Box>
  );
}
