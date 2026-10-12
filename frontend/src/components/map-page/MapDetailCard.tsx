import Box from "@mui/material/Box";
import { useDockMode } from "@/components/canvas/CanvasContext";
import { useLayout } from "@/components/canvas/canvasStore";
import FloatingCard from "@/components/canvas/FloatingCard";
import { theme } from "@/lib/theme";
import SidebarContent from "./SidebarContent";
import type { MapPageState } from "./useMapPageState";

const { tokens } = theme;

/** The card's accessible name: the panel inside draws its own title. */
function cardTitle(state: MapPageState): string {
  if (state.suggestMode === "waterway") return "New river";
  if (state.suggestMode === "feature") return "New feature";
  if (state.selectedWaterwayId == null) return "Search";
  return state.selectedSectionId == null ? "River" : "Section";
}

/** The map page's detail card on the canvas: search, river, section,
 * features, notes and sources, in the one panel the phone shows full screen.
 * From 1280 it runs the full height and its foot (the reading block) goes on
 * into the rail; narrower it hugs its content and the chart leads it. */
export default function MapDetailCard({ state }: { state: MapPageState }) {
  const wide = useDockMode() === "dock";
  const railed = useLayout((s) => s.dock != null);
  return (
    <FloatingCard
      id="detail"
      side="left"
      kind="detail"
      screen="map"
      // Every panel in the card has its own header, which is the card's.
      title={cardTitle(state)}
      selfHeaded
      fullHeight={wide}
      joinedRail={railed}
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
