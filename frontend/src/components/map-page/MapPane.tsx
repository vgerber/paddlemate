import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import WaterwayMap from "@/components/map/Map";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import AreaControls from "@/components/search/AreaControls";
import {
  proposalToPseudoFeature,
  spansWholeSection,
} from "@/components/waterway/section-details/utils";
import { lineCoords } from "@/lib/geo";
import { localizedName } from "@/lib/localization";
import { theme } from "@/lib/theme";
import MapCharts from "./MapCharts";
import SectionSpeedDial from "./SectionSpeedDial";
import type { MapPageState } from "./useMapPageState";

interface MapPaneProps {
  state: MapPageState;
  onOpenMobilePanel: () => void;
}

/**
 * Full-height map container with:
 * - WaterwayMap
 * - Mobile area strip (area mode, no waterway selected)
 * - Mobile search FAB (all other cases)
 * - Desktop charts (hidden on mobile)
 */
export default function MapPane({ state, onOpenMobilePanel }: MapPaneProps) {
  const {
    selectedWaterwayId,
    selectedSectionId,
    sections,
    filteredSearchSections,
    suggestMode,
    handleSectionClick,
    gaugePins,
    selectedGaugeId,
    handleGaugeClick,
    areaCircle,
    setAreaCircle,
    previewRadius,
    setPreviewRadius,
    areaLocked,
    setAreaLocked,
    waterwayNames,
    labelMode,
    setLabelMode,
    sectionLevels,
    searchSectionLevels,
    sectionPreviewCoords,
    featureVertices,
    featureGeomType,
    featurePickingActive,
    handleMapPick,
    focusedPoint,
    isAreaMode,
    isMobile,
    isAreaSearchLoading,
    isMobileMapView,
    toggleMobileMapView,
    showProposedFeatures,
    featureProposals,
    setMapBounds,
  } = state;

  const LEVEL_COLORS: Record<string, string> = theme.tokens.levelColors;

  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const sectionName = selectedSection
    ? localizedName(selectedSection.name, selectedSection.names)
    : undefined;
  const waterwayName =
    selectedWaterwayId != null ? waterwayNames[selectedWaterwayId] : undefined;
  const sectionLevel =
    selectedSectionId != null ? sectionLevels[selectedSectionId] : undefined;

  // Stable identity - feeds the map's area fitBounds effect, which must not
  // refire on unrelated re-renders (see useMapPageState.areaCircle).
  const visibleAreaCircle = useMemo(
    () =>
      selectedWaterwayId == null && isAreaMode
        ? previewRadius != null && areaCircle != null
          ? { ...areaCircle, radiusKm: previewRadius }
          : areaCircle
        : null,
    [selectedWaterwayId, isAreaMode, previewRadius, areaCircle],
  );

  const showAreaStrip = isMobile && isAreaMode && selectedWaterwayId == null;

  // Line features spanning (nearly) the whole section (e.g. the whitewater
  // zone) would just redraw the section line - keep them in the timeline
  // but off the map.
  const mapFeatures = useMemo(() => {
    if (!selectedSection) return undefined;
    const line = lineCoords(selectedSection.location);
    if (!line) return selectedSection.features;
    return selectedSection.features.filter((f) => !spansWholeSection(f, line));
  }, [selectedSection]);

  // Stable identity - inline mapping in JSX would rebuild the array every
  // render and defeat the map's GeoJSON memoization.
  const proposedFeatures = useMemo(
    () =>
      showProposedFeatures
        ? featureProposals
            .map(proposalToPseudoFeature)
            .filter((f) => f !== null)
        : undefined,
    [showProposedFeatures, featureProposals],
  );

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
      <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* Descent banner - mobile only, floats over the map when overlay is closed */}
        <StandingDescentBanner
          sx={{
            display: { xs: "flex", md: "none" },
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          }}
        />
        <WaterwayMap
          sections={
            selectedWaterwayId != null ? sections : filteredSearchSections
          }
          features={mapFeatures}
          selectedSectionId={selectedSectionId}
          onSectionClick={suggestMode ? undefined : handleSectionClick}
          gaugePins={gaugePins}
          selectedGaugePinId={selectedGaugeId}
          onGaugeClick={handleGaugeClick}
          areaCircle={visibleAreaCircle}
          areaLocked={areaLocked}
          onAreaCircleChange={
            isAreaMode && selectedWaterwayId == null && !areaLocked
              ? setAreaCircle
              : undefined
          }
          waterwayNames={waterwayNames}
          labelMode={labelMode}
          onLabelModeChange={setLabelMode}
          sectionLevels={
            selectedWaterwayId != null ? sectionLevels : searchSectionLevels
          }
          sectionPreviewCoords={sectionPreviewCoords ?? undefined}
          featureVertices={featureVertices}
          featureGeomType={featureGeomType}
          placingFeature={featurePickingActive}
          onMapClick={featurePickingActive ? handleMapPick : undefined}
          focusedPoint={focusedPoint}
          controlsBottomOffset={
            isMobile && (showAreaStrip || isMobileMapView) ? 60 : 0
          }
          controlsAnchor={
            isMobile && suggestMode === "feature" ? "top" : undefined
          }
          proposedFeatures={proposedFeatures}
          onBoundsChange={setMapBounds}
        />

        {/* Area strip - mobile, area mode, no waterway selected */}
        {showAreaStrip ? (
          <Box
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              bgcolor: "background.paper",
              borderTop: "1px solid",
              borderColor: "divider",
              px: 2,
              py: 0.5,
              display: "flex",
              alignItems: "center",
              gap: 2,
              zIndex: 1100,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {areaCircle ? (
                <AreaControls
                  areaCircle={areaCircle}
                  locked={areaLocked}
                  onLockedChange={setAreaLocked}
                  onRadiusPreview={(km) => setPreviewRadius(km)}
                  onRadiusChange={(km) => {
                    setPreviewRadius(null);
                    setAreaCircle({ ...areaCircle, radiusKm: km });
                  }}
                />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Tap and drag on the map to draw a search area
                </Typography>
              )}
            </Box>
            <Badge badgeContent={resultsBadge} color="secondary" max={99}>
              <IconButton
                onClick={onOpenMobilePanel}
                sx={{ color: "text.primary" }}
              >
                <FormatListBulletedIcon />
              </IconButton>
            </Badge>
          </Box>
        ) : isMobileMapView ? (
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
                  <Typography variant="caption" color="text.secondary" noWrap>
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
              <Fab color="secondary" onClick={onOpenMobilePanel}>
                <FilterAltIcon />
              </Fab>
            </Badge>
          </Box>
        )}
      </Box>

      {/* Charts - desktop only */}
      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <MapCharts state={state} />
      </Box>
    </Box>
  );
}
