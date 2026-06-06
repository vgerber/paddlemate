import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import GaugeChartPanel from "@/components/charts/GaugeChartPanel";
import SectionChartPanel from "@/components/charts/SectionChartPanel";
import SidebarContent from "./SidebarContent";
import type { MapPageState } from "./useMapPageState";

interface MobileOverlayProps {
  state: MapPageState;
}

/**
 * Full-screen overlay shown on mobile when the panel is open.
 * Sits above the map (z-index 1200), below the app bar, above the bottom nav.
 */
export default function MobileOverlay({ state }: MobileOverlayProps) {
  const {
    isMobilePanelOpen,
    setIsMobilePanelOpen,
    selectedWaterwayId,
    selectedSectionId,
    selectedGaugeId,
    setSelectedGaugeId,
    selectedGaugeRanges,
    sections,
  } = state;

  return (
    <Box
      sx={{
        display: { xs: isMobilePanelOpen ? "flex" : "none", md: "none" },
        position: "fixed",
        top: "48px",
        bottom: "calc(56px + env(safe-area-inset-bottom))",
        left: 0,
        right: 0,
        zIndex: 1200,
        flexDirection: "column",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      <IconButton
        size="small"
        onClick={() => setIsMobilePanelOpen(false)}
        sx={{
          position: "absolute",
          top: 6,
          right: 6,
          zIndex: 10,
          bgcolor: "background.paper",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <SidebarContent
          state={state}
          onAreaModeActivate={() => setIsMobilePanelOpen(false)}
        />
      </Box>

      {/* Charts shown inline in the overlay on mobile */}
      {selectedGaugeId != null && selectedGaugeRanges.length > 0 ? (
        <GaugeChartPanel
          ranges={selectedGaugeRanges}
          onClose={() => setSelectedGaugeId(null)}
        />
      ) : selectedSectionId != null && selectedWaterwayId != null ? (
        <SectionChartPanel
          waterwayId={selectedWaterwayId}
          sectionId={selectedSectionId}
          sectionName={sections.find((s) => s.id === selectedSectionId)?.name}
        />
      ) : null}
    </Box>
  );
}
