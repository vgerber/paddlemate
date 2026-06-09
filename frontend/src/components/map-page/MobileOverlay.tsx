import AddLocationAltIcon from "@mui/icons-material/AddLocationAlt";
import CloseIcon from "@mui/icons-material/Close";
import DirectionsBoatIcon from "@mui/icons-material/DirectionsBoat";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Slide from "@mui/material/Slide";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import GaugeChartPanel from "@/components/charts/GaugeChartPanel";
import SectionChartPanel from "@/components/charts/SectionChartPanel";
import { useSession } from "@/lib/hooks/useSession";
import { useStandingDescent } from "@/lib/hooks/useStandingDescent";
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
    suggestMode,
    setSuggestMode,
    favoritedIds,
    toggleFavorite,
  } = state;

  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const { current: standingDescent, start: startDescent } = useStandingDescent();

  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name;
  const isFavorited = favoritedIds?.has(selectedSectionId ?? -1) ?? false;
  const showSpeedDial =
    selectedSectionId != null && selectedWaterwayId != null && !suggestMode;
  const closeOverlay = () => setIsMobilePanelOpen(false);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);

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
            onMobileClose={closeOverlay}
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
        {showSpeedDial && (
          <SpeedDial
            ariaLabel="Section actions"
            sx={{ position: "absolute", bottom: "calc(260px + 16px)", right: 16 }}
            icon={<SpeedDialIcon openIcon={<CloseIcon />} />}
            direction="up"
            open={speedDialOpen}
            onOpen={(_, reason) => {
              if (reason !== "mouseEnter" && reason !== "focus")
                setSpeedDialOpen(true);
            }}
            onClose={() => setSpeedDialOpen(false)}
          >
            <SpeedDialAction
              icon={
                isFavorited ? (
                  <StarIcon sx={{ color: "warning.main" }} />
                ) : (
                  <StarBorderIcon />
                )
              }
              tooltipTitle={isFavorited ? "Remove favorite" : "Add favorite"}
              onClick={() => toggleFavorite?.(selectedSectionId!)}
            />
            {isAuthenticated && !standingDescent && (
              <SpeedDialAction
                icon={<PlayArrowIcon />}
                tooltipTitle="Start descent"
                onClick={() =>
                  startDescent({
                    startTime: new Date().toISOString(),
                    waterwayId: selectedWaterwayId!,
                    sectionId: selectedSectionId!,
                    sectionName: sectionName ?? "",
                  })
                }
              />
            )}
            {isAuthenticated && !standingDescent && (
              <SpeedDialAction
                icon={<DirectionsBoatIcon />}
                tooltipTitle="Log descent"
                onClick={() =>
                  navigate({
                    to: "/logs/new",
                    search: {
                      waterwayId: selectedWaterwayId!,
                      sectionId: selectedSectionId!,
                      startTime: undefined,
                    },
                  })
                }
              />
            )}
            {isAuthenticated && (
              <SpeedDialAction
                icon={<AddLocationAltIcon />}
                tooltipTitle="Add feature"
                onClick={() => setSuggestMode("feature")}
              />
            )}
          </SpeedDial>
        )}
      </Box>
    </Slide>
  );
}
