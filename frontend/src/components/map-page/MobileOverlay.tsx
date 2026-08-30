import Box from "@mui/material/Box";
import Slide from "@mui/material/Slide";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import MapCharts from "./MapCharts";
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
    selectedSectionId,
    sectionDetailTab,
    isMobileMapView,
    toggleMobileMapView,
    suggestMode,
  } = state;

  const closeOverlay = () => setIsMobilePanelOpen(false);
  // Mirrors MapCharts: no chart on the section Logs and Notes tabs.
  const chartsHidden =
    selectedSectionId != null &&
    (sectionDetailTab === "logs" || sectionDetailTab === "notes");
  // Sheet mode: the map above must stay reachable - suggest flows, and
  // placing a note pin.
  const sheet = Boolean(suggestMode) || state.notePinPlacing;

  return (
    <Slide direction="up" in={isMobilePanelOpen}>
      <Box
        sx={{
          display: { xs: "flex", md: "none" },
          position: "fixed",
          top: sheet ? "45%" : 0,
          bottom: sheet ? 0 : "calc(56px + env(safe-area-inset-bottom))",
          left: 0,
          right: 0,
          zIndex: sheet ? 1350 : 1200,
          flexDirection: "column",
          bgcolor: "background.default",
          overflow: "hidden",
          borderTop: sheet ? "1px solid" : "none",
          borderColor: "divider",
          boxShadow: sheet ? "0 -8px 16px rgba(0,0,0,0.35)" : "none",
        }}
      >
        {/* Sheet-style top edge in suggest mode: a fixed handle strip the
            content scrolls beneath, instead of a hard cut against the map. */}
        {sheet && (
          <Box
            sx={{
              flexShrink: 0,
              display: "flex",
              justifyContent: "center",
              pt: 1,
              pb: 0.75,
              borderBottom: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ width: 36, height: 3, bgcolor: "divider" }} />
          </Box>
        )}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <StandingDescentBanner />
          <SidebarContent
            state={state}
            onAreaModeActivate={closeOverlay}
            onClose={closeOverlay}
            onMobileMapToggle={toggleMobileMapView}
            mobileMapActive={isMobileMapView}
          />
        </Box>

        {/* Charts shown inline in the overlay on mobile (hidden in suggest mode) */}
        {!suggestMode && <MapCharts state={state} />}

        {/* Speed Dial - section-specific actions on mobile */}
        <SectionSpeedDial
          state={state}
          sx={{
            position: "absolute",
            bottom: chartsHidden ? 16 : "calc(260px + 16px)",
            right: 16,
          }}
        />
      </Box>
    </Slide>
  );
}
