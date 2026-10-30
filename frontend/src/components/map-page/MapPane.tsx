import Box from "@mui/material/Box";
import { useMemo } from "react";
import type { MapScene } from "@/components/canvas/scene";
import WaterwayMap from "@/components/map/LazyMap";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import DelayedSpinner from "@/components/states/DelayedSpinner";
import { featureName } from "@/components/waterway/section-details/utils";
import { localizedName } from "@/lib/text/localization";
import FeatureSheet from "./FeatureSheet";
import { sheetPadding } from "./featureSnap";
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
    selectedFeature,
    isMobilePanelOpen,
    suggestMode,
    notePinPlacing,
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
  const featureSheet = state.featureSheet;
  const sheetPeek = featureSheet.open ? featureSheet.visible : null;
  const camera = useMemo(() => {
    if (sheetPeek != null) {
      return { ...scene.camera, padding: sheetPadding(sheetPeek) };
    }
    return sheetMode
      ? {
          ...scene.camera,
          padding: sheetPadding(modeSheetPeek(sheetMode)),
        }
      : scene.camera;
  }, [scene.camera, sheetMode, sheetPeek]);

  // The phone keeps the old fits: the subject belongs to the canvas camera.
  const { subject: _subject, camera: _camera, ...mapProps } = scene;
  // The panel covers the whole map unless it rests as a sheet over it.
  const covered =
    isMobilePanelOpen && !sheetMode && !suggestMode && !notePinPlacing;
  const chrome = useMemo(
    () => ({ ...mapProps.chrome, covered }),
    [mapProps.chrome, covered],
  );

  const resultsBadge = isAreaSearchLoading ? (
    <DelayedSpinner size={10} color="inherit" />
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
        // Behind a full-screen panel the map's controls are not reachable.
        inert={covered}
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
        <WaterwayMap {...mapProps} camera={camera} chrome={chrome} />

        <MapPaneChrome
          state={state}
          sheetMode={sheetMode != null || featureSheet.open}
          mapView={isMobileMapView}
          resultsBadge={resultsBadge}
          sectionName={sectionName}
          featureName={selectedFeature && featureName(selectedFeature)}
          waterwayName={waterwayName}
          level={sectionLevel}
          onOpen={toggleMobileMapView}
          onOpenSearch={onOpenMobilePanel}
        />
        {featureSheet.open && <FeatureSheet state={state} />}
      </Box>
    </Box>
  );
}
