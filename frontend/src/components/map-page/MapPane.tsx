import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useMemo } from "react";
import type { MapScene } from "@/components/canvas/scene";
import WaterwayMap from "@/components/map/Map";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import { localizedName } from "@/lib/localization";
import MapPaneChrome from "./MapPaneChrome";
import { modeSheetMode, modeSheetPeek } from "./modeSheet";
import type { MapPageState } from "./useMapPageState";

interface MapPaneProps {
  state: MapPageState;
  /** The map to draw, from `useMapScene`. */
  scene: MapScene;
  onOpenMobilePanel: () => void;
}

/**
 * The phone's full-height map container with:
 * - WaterwayMap, drawing the page's scene
 * - The area and region sheet is drawn over it by MobileOverlay
 * - Mobile search FAB (outside area and region search)
 * Wide screens draw the same scene on the canvas host instead.
 */
export default function MapPane({
  state,
  scene,
  onOpenMobilePanel,
}: MapPaneProps) {
  const {
    selectedWaterwayId,
    selectedSectionId,
    sections,
    filteredSearchSections,
    waterwayNames,
    sectionLevels,
    isAreaSearchLoading,
    isMobileMapView,
    toggleMobileMapView,
  } = state;

  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const sectionName = selectedSection
    ? localizedName(selectedSection.name, selectedSection.names)
    : undefined;
  const waterwayName =
    selectedWaterwayId != null ? waterwayNames[selectedWaterwayId] : undefined;
  const sectionLevel =
    selectedSectionId != null ? sectionLevels[selectedSectionId] : undefined;

  // Area and region are searched by looking at the map, so their sheet
  // rests over it and the map frames what it shows above the sheet.
  const sheetMode = modeSheetMode(state);
  const camera = useMemo(
    () =>
      sheetMode
        ? {
            ...scene.camera,
            padding: {
              top: 64,
              left: 24,
              right: 24,
              bottom: modeSheetPeek(sheetMode) + 16,
            },
          }
        : scene.camera,
    [scene.camera, sheetMode],
  );

  // The phone keeps the old fits: the subject belongs to the canvas camera.
  const { subject: _subject, camera: _camera, ...mapProps } = scene;

  const resultsBadge = isAreaSearchLoading ? (
    <CircularProgress size={10} color="inherit" />
  ) : (
    filteredSearchSections.length || null
  );

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        data-testid="map-card"
        sx={{
          flex: 1,
          minHeight: 0,
          position: "relative",
        }}
      >
        <StandingDescentBanner
          sx={{
            display: { xs: "flex", md: "none" },
            position: "absolute",
            top: 0,
            left: 0,
            // Clear of the zoom and compass keys down the right edge.
            right: 64,
            zIndex: 10,
          }}
        />
        <WaterwayMap {...mapProps} camera={camera} />

        <MapPaneChrome
          state={state}
          sheetMode={sheetMode != null}
          mapView={isMobileMapView}
          resultsBadge={resultsBadge}
          sectionName={sectionName}
          waterwayName={waterwayName}
          level={sectionLevel}
          onOpen={toggleMobileMapView}
          onOpenSearch={onOpenMobilePanel}
        />
      </Box>
    </Box>
  );
}
