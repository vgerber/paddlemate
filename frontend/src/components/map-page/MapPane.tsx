import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import GaugeChartPanel from "@/components/charts/GaugeChartPanel";
import SectionChartPanel from "@/components/charts/SectionChartPanel";
import WaterwayMap from "@/components/map/Map";
import AreaControls from "@/components/search/AreaControls";
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
    setSelectedGaugeId,
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
    sectionPutIn,
    sectionTakeOut,
    sectionPreviewCoords,
    featureVertices,
    featureGeomType,
    featurePickingActive,
    sectionPickingFor,
    handleMapPick,
    focusedPoint,
    isAreaMode,
    isMobile,
    isAreaSearchLoading,
    selectedGaugeRanges,
  } = state;

  const visibleAreaCircle =
    selectedWaterwayId == null
      ? previewRadius != null && areaCircle != null
        ? { ...areaCircle, radiusKm: previewRadius }
        : areaCircle
      : null;

  const showAreaStrip = isMobile && isAreaMode && selectedWaterwayId == null;

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
        <WaterwayMap
          sections={
            selectedWaterwayId != null ? sections : filteredSearchSections
          }
          selectedSectionId={selectedSectionId}
          onSectionClick={suggestMode ? undefined : handleSectionClick}
          gaugePins={gaugePins}
          selectedGaugePinId={selectedGaugeId}
          onGaugeClick={handleGaugeClick}
          areaCircle={visibleAreaCircle}
          areaLocked={areaLocked}
          onAreaCircleChange={
            selectedWaterwayId == null && !areaLocked
              ? setAreaCircle
              : undefined
          }
          waterwayNames={waterwayNames}
          labelMode={labelMode}
          onLabelModeChange={setLabelMode}
          sectionLevels={
            selectedWaterwayId != null ? sectionLevels : searchSectionLevels
          }
          putIn={sectionPutIn}
          takeOut={sectionTakeOut}
          sectionPreviewCoords={sectionPreviewCoords ?? undefined}
          featureVertices={featureVertices}
          featureGeomType={featureGeomType}
          placingFeature={featurePickingActive || sectionPickingFor !== null}
          onMapClick={
            featurePickingActive || sectionPickingFor !== null
              ? handleMapPick
              : undefined
          }
          focusedPoint={focusedPoint}
        />

        {/* Area strip — mobile, area mode, no waterway selected */}
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
              py: 1,
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
        ) : (
          /* Search FAB — mobile only */
          <Box
            sx={{
              display: { xs: "block", md: "none" },
              position: "absolute",
              bottom: 16,
              right: 16,
            }}
          >
            <Badge badgeContent={resultsBadge} color="secondary" max={99}>
              <Fab size="small" color="primary" onClick={onOpenMobilePanel}>
                <FilterAltIcon />
              </Fab>
            </Badge>
          </Box>
        )}
      </Box>

      {/* Charts — desktop only */}
      <Box sx={{ display: { xs: "none", md: "block" } }}>
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
    </Box>
  );
}
