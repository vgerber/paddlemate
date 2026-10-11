import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SearchIcon from "@mui/icons-material/Search";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import Fab from "@mui/material/Fab";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import type { MapScene } from "@/components/canvas/scene";
import WaterwayMap from "@/components/map/Map";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import { localizedName } from "@/lib/localization";
import { theme } from "@/lib/theme";
import { modeSheetMode, modeSheetPeek } from "./modeSheet";
import SectionSpeedDial from "./SectionSpeedDial";
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

  const LEVEL_COLORS: Record<string, string> = {
    empty: theme.tokens.levels.empty.marker,
    low: theme.tokens.levels.low.marker,
    medium: theme.tokens.levels.medium.marker,
    high: theme.tokens.levels.high.marker,
  };

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
      {/* Map */}
      <Box
        data-testid="map-card"
        sx={{
          flex: 1,
          minHeight: 0,
          position: "relative",
        }}
      >
        {/* Descent banner - mobile only, floats over the map when overlay is closed */}
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

        {sheetMode ? null : isMobileMapView ? (
          /* Map-view mini header - shown when the detail overlay is toggled away */
          <>
            <SectionSpeedDial
              state={state}
              sx={{
                position: "absolute",
                bottom: "calc(60px + 16px)",
                right: 16,
                display: { xs: "flex", md: "none" },
              }}
            />
            <ButtonBase
              onClick={toggleMobileMapView}
              sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                display: { xs: "flex", md: "none" },
                bgcolor: "background.paper",
                borderTop: "1px solid",
                borderColor: "divider",
                px: 2,
                py: 1,
                alignItems: "center",
                gap: 1.5,
                zIndex: 1100,
              }}
            >
              {sectionLevel && LEVEL_COLORS[sectionLevel] && (
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: LEVEL_COLORS[sectionLevel],
                    flexShrink: 0,
                  }}
                />
              )}
              <Box sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <Typography
                  variant="subtitle2"
                  noWrap
                  sx={{ fontWeight: 700, lineHeight: 1.3 }}
                >
                  {sectionName ?? waterwayName ?? ""}
                </Typography>
                {sectionName && waterwayName && (
                  <Typography variant="caption" color="textSecondary" noWrap>
                    {waterwayName}
                  </Typography>
                )}
              </Box>
              <KeyboardArrowUpIcon
                fontSize="small"
                sx={{ color: "action.active", flexShrink: 0 }}
              />
            </ButtonBase>
          </>
        ) : (
          /* Search FAB - mobile only */
          <Box
            sx={{
              display: { xs: "block", md: "none" },
              position: "absolute",
              bottom: 16,
              right: 16,
            }}
          >
            <Badge badgeContent={resultsBadge} color="secondary" max={99}>
              <Fab
                color="secondary"
                aria-label="Open search panel"
                onClick={onOpenMobilePanel}
              >
                <SearchIcon />
              </Fab>
            </Badge>
          </Box>
        )}
      </Box>
    </Box>
  );
}
