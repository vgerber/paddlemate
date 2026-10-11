import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SearchIcon from "@mui/icons-material/Search";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import type { MapScene } from "@/components/canvas/scene";
import WaterwayMap from "@/components/map/Map";
import RegionSheet from "@/components/map/RegionSheet";
import { partOf, rangesHiddenByNesting } from "@/components/map/regionGeometry";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import AreaControls from "@/components/search/AreaControls";
import { localizedName } from "@/lib/localization";
import { theme } from "@/lib/theme";
import SectionSpeedDial from "./SectionSpeedDial";
import type { MapPageState } from "./useMapPageState";

interface MapPaneProps {
  state: MapPageState;
  /** The map to draw, from `useMapScene`. */
  scene: MapScene;
  regionLevel: string | null;
  onRegionLevelChange: (level: string | null) => void;
  onOpenMobilePanel: () => void;
}

/**
 * The phone's full-height map container with:
 * - WaterwayMap, drawing the page's scene
 * - Mobile area strip (area mode, no waterway selected)
 * - Mobile search FAB (all other cases)
 * Wide screens draw the same scene on the canvas host instead.
 */
export default function MapPane({
  state,
  scene,
  regionLevel,
  onRegionLevelChange,
  onOpenMobilePanel,
}: MapPaneProps) {
  const {
    selectedWaterwayId,
    selectedSectionId,
    sections,
    filteredSearchSections,
    areaCircle,
    regionOutline,
    regionChoices,
    regionsLoading,
    selectRegion,
    setAreaCircle,
    setPreviewRadius,
    areaLocked,
    setAreaLocked,
    waterwayNames,
    sectionLevels,
    isAreaMode,
    isRegionMode,
    isMobile,
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

  // Area and region are both searched by touching the map, so on a phone -
  // where the panel covers it - the mode keeps a strip of its own: what is
  // picked, and the way back to the results.
  const showAreaStrip = isMobile && isAreaMode && selectedWaterwayId == null;
  const showRegionStrip =
    isMobile && isRegionMode && selectedWaterwayId == null;

  // "part of" and the ranges the map left out are read from everything in view.
  const regionParents = useMemo(
    () => (regionOutline ? partOf(regionChoices, regionOutline) : []),
    [regionChoices, regionOutline],
  );
  const hiddenRanges = useMemo(
    () => rangesHiddenByNesting(regionChoices, regionOutline?.id),
    [regionChoices, regionOutline?.id],
  );

  // The phone keeps the old fits: the subject belongs to the canvas camera.
  const { subject: _subject, ...mapProps } = scene;

  const resultsBadge = isAreaSearchLoading ? (
    <CircularProgress size={10} color="inherit" />
  ) : (
    filteredSearchSections.length || null
  );

  const resultsButton = (
    <Badge badgeContent={resultsBadge} color="secondary" max={99}>
      <IconButton
        aria-label="Open search panel"
        onClick={onOpenMobilePanel}
        sx={{ color: "text.primary" }}
      >
        <FormatListBulletedIcon />
      </IconButton>
    </Badge>
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
        <WaterwayMap {...mapProps} />

        {showRegionStrip && (
          <RegionSheet
            picked={regionOutline}
            loading={regionsLoading && !regionOutline}
            level={regionLevel}
            onLevelChange={onRegionLevelChange}
            parents={regionParents}
            hiddenRanges={hiddenRanges}
            onPick={selectRegion}
            action={resultsButton}
          />
        )}

        {/* Area strip - mobile, no waterway selected */}
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
              // Room for the results badge, which anchors above the button
              // and poked out over the map at a tighter padding.
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
                <Typography variant="caption" color="textSecondary">
                  Tap and drag on the map to draw a search area
                </Typography>
              )}
            </Box>
            {resultsButton}
          </Box>
        ) : showRegionStrip ? null : isMobileMapView ? (
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
