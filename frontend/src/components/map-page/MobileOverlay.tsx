import Box from "@mui/material/Box";
import Slide from "@mui/material/Slide";
import GaugeChartPanel from "@/components/charts/GaugeChartPanel";
import SectionChartPanel from "@/components/charts/SectionChartPanel";
import SectionSpeedDial from "./SectionSpeedDial";
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
    isMobileMapView,
    toggleMobileMapView,
  } = state;

  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name;
  const closeOverlay = () => setIsMobilePanelOpen(false);

  return (
    <Slide direction="up" in={isMobilePanelOpen} mountOnEnter unmountOnExit>
      <Box
        sx={{
          display: { xs: "flex", md: "none" },
          position: "fixed",
          top: { xs: 0, sm: "48px" },
          bottom: "calc(56px + env(safe-area-inset-bottom))",
          left: 0,
          right: 0,
          zIndex: 1200,
          flexDirection: "column",
          bgcolor: "background.paper",
          overflow: "hidden",
        }}
      >
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
            onAreaModeActivate={closeOverlay}
            onMobileMapToggle={toggleMobileMapView}
            mobileMapActive={isMobileMapView}
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
            sectionName={sectionName}
          />
        ) : null}

        {/* Speed Dial — section-specific actions on mobile */}
        <SectionSpeedDial
          state={state}
          sx={{ position: "absolute", bottom: "calc(260px + 16px)", right: 16 }}
        />
      </Box>
    </Slide>
  );
}
