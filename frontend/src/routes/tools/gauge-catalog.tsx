import Box from "@mui/material/Box";
import { createFileRoute } from "@tanstack/react-router";
import GaugeCatalogMap from "@/components/gauge-catalog/GaugeCatalogMap";
import { PANEL_HEIGHT, theme } from "@/lib/theme";

const { tokens } = theme;

export const Route = createFileRoute("/tools/gauge-catalog")({
  component: GaugeCatalogPage,
});

function GaugeCatalogPage() {
  // Fill the viewport below the app bar (and above the mobile bottom nav).
  // A phone gets the map edge to edge; a desktop sets it in a rounded card
  // inset from the window. Positioned so the map's overlays anchor to it.
  return (
    <Box sx={{ height: PANEL_HEIGHT, p: { xs: 0, md: 1.5 } }}>
      <Box
        sx={{
          position: "relative",
          height: "100%",
          overflow: "hidden",
          bgcolor: tokens.surface,
          borderRadius: { xs: 0, md: `${tokens.radii.lg}px` },
          boxShadow: { xs: "none", md: tokens.elevation.e1 },
        }}
      >
        <GaugeCatalogMap />
      </Box>
    </Box>
  );
}
