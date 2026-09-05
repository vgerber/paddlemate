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
import { useEffect, useMemo } from "react";
import WaterwayMap, { type NotePin, type PointPin } from "@/components/map/Map";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import AreaControls from "@/components/search/AreaControls";
import {
  proposalToPseudoFeature,
  spansWholeSection,
} from "@/components/waterway/section-details/utils";
import { categoryColor, categoryLabel } from "@/lib/comments";
import { timeAgo } from "@/lib/format";
import { lineCoords, pointCoords } from "@/lib/geo";
import { useWaterwayComments } from "@/lib/hooks/useComments";
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
    suggestGaugePins,
    handleSectionClick,
    gaugePins,
    selectedGaugeId,
    handleGaugeClick,
    areaCircle,
    regionOutline,
    regionChoices,
    countryBorders,
    regionsLoading,
    selectRegion,
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
    focusBounds,
    isAreaMode,
    isRegionMode,
    isMobile,
    isAreaSearchLoading,
    isMobileMapView,
    toggleMobileMapView,
    showProposedFeatures,
    featureProposals,
    setMapBounds,
    detailTab,
    sectionDetailTab,
    notePin,
    setNotePin,
    notePinPlacing,
    setNotePinPlacing,
    selectedNoteId,
    setSelectedNoteId,
    setDetailTab,
    setSectionDetailTab,
    setSelectedSectionId,
    exitMapView,
  } = state;

  // A notes tab is in view: the river overview or one section's thread.
  const notesActive =
    selectedWaterwayId != null &&
    (selectedSectionId == null
      ? detailTab === "notes"
      : sectionDetailTab === "notes");

  // Note markers are on the map whenever a river is open, not only on the
  // notes tab - a pinned hazard is map content, and clicking one is how the
  // notes tab opens. The river overview feeds them (cache shared with the
  // thread); in section view only other sections' notes are dropped.
  const showNoteMarkers = selectedWaterwayId != null && suggestMode == null;
  const riverNotes = useWaterwayComments(
    showNoteMarkers ? (selectedWaterwayId ?? null) : null,
    true,
  );
  const noteComments = (riverNotes.data ?? []).filter(
    (comment) =>
      selectedSectionId == null ||
      comment.entity_type === "waterway" ||
      comment.entity_id === selectedSectionId,
  );

  /** Open the thread a note lives in, with the note selected. */
  const openNoteInThread = (id: number) => {
    setSelectedNoteId(id);
    const note = riverNotes.data?.find((comment) => comment.id === id);
    if (
      selectedSectionId != null &&
      note?.entity_type === "water_section" &&
      note.entity_id === selectedSectionId
    ) {
      setSectionDetailTab("notes");
    } else if (selectedSectionId != null) {
      // The note belongs to the river or another section - the overview is
      // where it can actually be read and highlighted.
      setSelectedSectionId(undefined);
      setDetailTab("notes");
    } else {
      setDetailTab("notes");
    }
    // On mobile the panel is hidden while browsing the map; bring it back.
    exitMapView();
  };

  /** Marker click. Mobile only opens the popup - the full-height panel
   * would cover the map and the popup with it; the popup's own "Open in
   * notes" does the navigating. Desktop shows panel and map side by side,
   * so it can do both at once. */
  const handleNoteMarkerSelect = (id: number | null) => {
    if (isMobile || id == null) {
      setSelectedNoteId(id);
      return;
    }
    openNoteInThread(id);
  };

  const notePins: NotePin[] = showNoteMarkers
    ? noteComments.flatMap((comment) => {
        const coords = comment.location ? pointCoords(comment.location) : null;
        if (!coords) return [];
        return [
          {
            id: comment.id,
            lon: coords[0],
            lat: coords[1],
            color:
              categoryColor(comment.category) ?? theme.tokens.onSurfaceVariant,
            categoryLabel: categoryLabel(comment.category),
            body: comment.body,
            author: comment.author_name ?? undefined,
            age: timeAgo(comment.created_at),
          },
        ];
      })
    : [];
  const draftPin: PointPin[] =
    notesActive && notePin
      ? [
          {
            id: "note-draft",
            lon: notePin[0],
            lat: notePin[1],
            color: theme.tokens.tertiary,
            title: "New note location",
            emphasis: true,
          },
        ]
      : [];

  // Leaving the notes tab abandons any half-placed pin.
  useEffect(() => {
    if (!notesActive) {
      setNotePinPlacing(false);
      setNotePin(null);
      setSelectedNoteId(null);
    }
  }, [notesActive, setNotePinPlacing, setNotePin, setSelectedNoteId]);

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

  // Area and region are both searched by touching the map, so on a phone -
  // where the panel covers it - the mode keeps a strip of its own: what is
  // picked, and the way back to the results.
  const showAreaStrip = isMobile && isAreaMode && selectedWaterwayId == null;
  const showRegionStrip =
    isMobile && isRegionMode && selectedWaterwayId == null;
  const showModeStrip = showAreaStrip || showRegionStrip;

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
          gaugePins={
            suggestMode === "waterway" && suggestGaugePins.length > 0
              ? suggestGaugePins
              : gaugePins
          }
          selectedGaugePinId={selectedGaugeId}
          onGaugeClick={
            suggestMode === "waterway" ? undefined : handleGaugeClick
          }
          areaCircle={visibleAreaCircle}
          regionOutline={selectedWaterwayId != null ? null : regionOutline}
          regionChoices={selectedWaterwayId != null ? null : regionChoices}
          countryBorders={countryBorders}
          onRegionSelect={selectedWaterwayId != null ? undefined : selectRegion}
          areaLocked={areaLocked}
          onAreaCircleChange={
            isAreaMode && selectedWaterwayId == null && !areaLocked
              ? setAreaCircle
              : undefined
          }
          sectionLevels={
            selectedWaterwayId != null ? sectionLevels : searchSectionLevels
          }
          focusedPoint={focusedPoint}
          focusBounds={focusBounds}
          // The mobile sheet (suggest mode, note-pin placing) covers the
          // canvas from 45% down; pad focus moves so targets stay above it.
          focusPaddingBottom={
            isMobile && (suggestMode != null || notePinPlacing)
              ? Math.round(window.innerHeight * 0.55)
              : 0
          }
          proposedFeatures={proposedFeatures}
          pointPins={draftPin.length > 0 ? draftPin : undefined}
          notePins={notePins.length > 0 ? notePins : undefined}
          selectedNoteId={selectedNoteId}
          onNoteSelect={handleNoteMarkerSelect}
          onNoteOpenThread={isMobile ? openNoteInThread : undefined}
          onBoundsChange={setMapBounds}
          drawing={{
            sectionPreviewCoords: sectionPreviewCoords ?? undefined,
            featureVertices,
            featureGeomType,
            placingFeature: featurePickingActive || notePinPlacing,
            onMapClick: featurePickingActive
              ? handleMapPick
              : notePinPlacing
                ? (lng, lat) => {
                    setNotePin([lng, lat]);
                    setNotePinPlacing(false);
                  }
                : undefined,
          }}
          chrome={{
            waterwayNames,
            labelMode,
            onLabelModeChange: setLabelMode,
            controlsBottomOffset:
              isMobile && (showModeStrip || isMobileMapView) ? 60 : 0,
            controlsAnchor:
              isMobile && suggestMode === "feature" ? "top" : undefined,
            attributionPosition: isMobile ? "top-left" : "bottom-right",
          }}
        />

        {/* Mode strip - mobile, map-driven mode, no waterway selected */}
        {showModeStrip ? (
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
              {showRegionStrip ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {/* A viewport the server has not seen takes ten seconds to
                      fetch from OSM; without this the map just sits empty. */}
                  {regionsLoading && !regionOutline && (
                    <CircularProgress size={12} color="inherit" />
                  )}
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {regionOutline
                      ? [regionOutline.country, regionOutline.name]
                          .filter(Boolean)
                          .join(" · ")
                      : regionsLoading
                        ? "Finding the regions here…"
                        : "Tap a region on the map to search in it"}
                  </Typography>
                </Box>
              ) : areaCircle ? (
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
