import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import FloatingCard from "@/components/canvas/FloatingCard";
import { labelSx, theme } from "@/lib/theme";
import SidebarContent from "./SidebarContent";
import type { MapPageState } from "./useMapPageState";

const { tokens } = theme;

function cardTitle(state: MapPageState): string {
  if (state.suggestMode === "waterway") return "New river";
  if (state.suggestMode === "feature") return "New feature";
  if (state.selectedWaterwayId == null) return "Search";
  return state.selectedSectionId == null ? "River" : "Section";
}

/** The map page's detail card on the canvas: search, river, section,
 * features, notes and sources, in the one panel the phone shows full screen.
 * The chart docks along the map's foot (or leads the card under 1280). */
export default function MapDetailCard({ state }: { state: MapPageState }) {
  return (
    <FloatingCard
      id="detail"
      side="left"
      kind="detail"
      screen="map"
      header={
        <Box
          sx={{ px: 2, minHeight: 56, display: "flex", alignItems: "center" }}
        >
          <Typography
            component="h2"
            sx={{ ...labelSx, color: tokens.onSurfaceVariant }}
          >
            {cardTitle(state)}
          </Typography>
        </Box>
      }
    >
      <Box
        data-testid="side-panel"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          bgcolor: tokens.surfaceLow,
        }}
      >
        <SidebarContent state={state} />
      </Box>
    </FloatingCard>
  );
}
