import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import { useQueries } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import GaugeChartPanel from "@/components/charts/GaugeChartPanel";
import SectionChartPanel from "@/components/charts/SectionChartPanel";
import type { AreaCircle, GaugePin } from "@/components/map/Map";
import WaterwayMap from "@/components/map/Map";
import WaterwaySearchPanel from "@/components/search/WaterwaySearchPanel";
import WaterwayDetailPanel, {
  type DetailTab,
  type SuggestMode,
} from "@/components/waterway/WaterwayDetailPanel";
import { waterwaysApi } from "@/lib/api";
import { useFavorites } from "@/lib/hooks/useFavorites";
import { useFilteredSections } from "@/lib/hooks/useFilteredSections";
import { useGaugeData } from "@/lib/hooks/useGaugeData";
import {
  useAllSectionWaterStatus,
  useSectionWaterStatuses,
  useWaterway,
  waterwayKeys,
} from "@/lib/hooks/useWaterways";

const LEVEL_ORDER = ["empty", "low", "medium", "high"] as const;

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    waterway: search.waterway ? Number(search.waterway) : undefined,
    section: search.section ? Number(search.section) : undefined,
    q: typeof search.q === "string" ? search.q || undefined : undefined,
    country:
      typeof search.country === "string"
        ? search.country || undefined
        : undefined,
    min_diff: search.min_diff != null ? Number(search.min_diff) : undefined,
    max_diff: search.max_diff != null ? Number(search.max_diff) : undefined,
    mode: search.mode === "area" ? ("area" as const) : undefined,
    lat: search.lat != null ? Number(search.lat) : undefined,
    lon: search.lon != null ? Number(search.lon) : undefined,
    radius: search.radius != null ? Number(search.radius) : undefined,
  }),
  component: Home,
});

function Home() {
  const {
    waterway: selectedWaterwayId,
    section: selectedSectionId,
    lat,
    lon,
    radius,
    min_diff,
    max_diff,
  } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [detailTab, setDetailTab] = useState<DetailTab>("sections");
  const [selectedGaugeId, setSelectedGaugeId] = useState<number | null>(null);
  const [searchWaterwayIds, setSearchWaterwayIds] = useState<number[]>([]);
  const [labelMode, setLabelMode] = useState<"section" | "river">("section");
  const [areaLocked, setAreaLocked] = useState(false);
  const { favorites, favoritedIds, toggle: toggleFavorite } = useFavorites();

  // Feature suggestion: pick geometry vertices from the map
  const [featurePickingActive, setFeaturePickingActive] = useState(false);
  const [featureGeomType, setFeatureGeomType] = useState<
    "Point" | "LineString" | "Polygon"
  >("Point");
  const [featureVertices, setFeatureVertices] = useState<
    { lng: number; lat: number }[]
  >([]);

  // Section suggestion: pick put-in and take-out from the map
  const [sectionPickingFor, setSectionPickingFor] = useState<
    "put-in" | "take-out" | null
  >(null);
  const [sectionPutIn, setSectionPutIn] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [sectionTakeOut, setSectionTakeOut] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [sectionPreviewCoords, setSectionPreviewCoords] = useState<
    [number, number][] | null
  >(null);

  const [suggestMode, setSuggestMode] = useState<SuggestMode | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<[number, number] | null>(
    null,
  );
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  // Reset focused feature when the section changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on section change
  useEffect(() => {
    setFocusedPoint(null);
  }, [selectedSectionId]);

  // Auto-open panel on mobile when a waterway is set (e.g. URL has ?waterway=…)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional auto-open on waterway/mobile change
  useEffect(() => {
    if (isMobile && selectedWaterwayId != null) {
      setIsMobilePanelOpen(true);
    }
  }, [selectedWaterwayId, isMobile]);

  // Derive areaCircle from URL params
  const areaCircle: AreaCircle | null =
    lat != null && lon != null && radius != null
      ? { lat, lon, radiusKm: radius }
      : null;

  const setAreaCircle = useCallback(
    (circle: AreaCircle | null) => {
      navigate({
        search: (prev) => ({
          ...prev,
          lat: circle?.lat,
          lon: circle?.lon,
          radius: circle?.radiusKm,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const setSelectedWaterwayId = (id: number | undefined) => {
    setDetailTab("sections");
    setSelectedGaugeId(null);
    navigate({
      search: (prev) => ({ ...prev, waterway: id, section: undefined }),
    });
  };
  const setSelectedSectionId = (id: number | undefined) =>
    navigate({ search: (prev) => ({ ...prev, section: id }) });

  const { data: selectedWaterway } = useWaterway(selectedWaterwayId ?? null);
  const sections = useMemo(
    () => selectedWaterway?.sections ?? [],
    [selectedWaterway],
  );

  // Fetch full waterway data for search results to show on map
  const searchWaterwayDetails = useQueries({
    queries:
      selectedWaterwayId == null
        ? searchWaterwayIds.map((id) => ({
            queryKey: waterwayKeys.detail(id),
            queryFn: () => waterwaysApi.get(id),
          }))
        : [],
  });
  const searchSections = useMemo(
    () => searchWaterwayDetails.flatMap((q) => q.data?.sections ?? []),
    [searchWaterwayDetails],
  );

  const waterwayNames = useMemo(() => {
    const map: Record<number, string> = {};
    for (const q of searchWaterwayDetails) {
      if (q.data) map[q.data.id] = q.data.name;
    }
    if (selectedWaterway) map[selectedWaterway.id] = selectedWaterway.name;
    return map;
  }, [searchWaterwayDetails, selectedWaterway]);

  const filteredSearchSections = useFilteredSections(searchSections, {
    areaCircle,
    minDiff: min_diff,
    maxDiff: max_diff,
  });

  // Gauge data
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  // Always fetch water statuses when a waterway is selected (powers map icons + gauge tab)
  // gaugeRanges must be available in all tabs (e.g. feature suggestion form uses them)
  const shouldFetchGauges = selectedWaterwayId != null;
  const allWaterStatuses = useAllSectionWaterStatus(
    selectedWaterwayId ?? 0,
    selectedWaterwayId != null ? sectionIds : [],
  );
  const { gaugePins, gaugeRanges, selectedGaugeRanges } = useGaugeData({
    allWaterStatuses,
    selectedGaugeId,
    detailTab,
    shouldFetchGauges,
  });

  const sectionLevels = useMemo(() => {
    const map: Record<number, string> = {};
    allWaterStatuses.forEach((q, i) => {
      if (!q.data?.ranges.length || sectionIds[i] == null) return;
      const maxLevel = q.data.ranges.reduce<(typeof LEVEL_ORDER)[number]>(
        (best, r) => {
          const level = r.level as (typeof LEVEL_ORDER)[number];
          return LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(best)
            ? level
            : best;
        },
        "empty",
      );
      map[sectionIds[i]] = maxLevel;
    });
    return map;
  }, [allWaterStatuses, sectionIds]);

  // Water levels for search-mode sections (no selected waterway)
  const searchSectionPairs = useMemo(
    () =>
      selectedWaterwayId == null
        ? filteredSearchSections.slice(0, 60).map((s) => ({
            waterwayId: s.waterway_id,
            sectionId: s.id,
          }))
        : [],
    [selectedWaterwayId, filteredSearchSections],
  );
  const searchWaterStatuses = useSectionWaterStatuses(searchSectionPairs);
  const searchSectionLevels = useMemo(() => {
    const map: Record<number, string> = {};
    searchWaterStatuses.forEach((q, i) => {
      if (!q.data?.ranges.length || searchSectionPairs[i] == null) return;
      const maxLevel = q.data.ranges.reduce<(typeof LEVEL_ORDER)[number]>(
        (best, r) => {
          const level = r.level as (typeof LEVEL_ORDER)[number];
          return LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(best)
            ? level
            : best;
        },
        "empty",
      );
      map[searchSectionPairs[i].sectionId] = maxLevel;
    });
    return map;
  }, [searchWaterStatuses, searchSectionPairs]);

  const handleGaugeClick = useCallback((pin: GaugePin) => {
    setSelectedGaugeId((prev) => (prev === pin.id ? null : pin.id));
  }, []);

  const handleMapPick = useCallback(
    (lng: number, lat: number) => {
      if (featurePickingActive) {
        setFeatureVertices((prev) => [...prev, { lng, lat }]);
        // Don't stop — form controls when picking ends
        return;
      } else if (sectionPickingFor === "put-in") {
        setSectionPutIn({ lat, lon: lng });
        setSectionPickingFor(null);
      } else if (sectionPickingFor === "take-out") {
        setSectionTakeOut({ lat, lon: lng });
        setSectionPickingFor(null);
      }
    },
    [featurePickingActive, sectionPickingFor],
  );

  const handleGaugeSelect = useCallback((gaugeId: number) => {
    setSelectedGaugeId((prev) => (prev === gaugeId ? null : gaugeId));
  }, []);

  const handleSectionClick = (id: number) => {
    if (selectedWaterwayId == null) {
      const section = filteredSearchSections.find((s) => s.id === id);
      if (section) {
        setSelectedWaterwayId(section.waterway_id);
        setSelectedSectionId(id);
        if (isMobile) setIsMobilePanelOpen(true);
        return;
      }
    }
    setSelectedSectionId(id === selectedSectionId ? undefined : id);
    if (isMobile && selectedWaterwayId != null) setIsMobilePanelOpen(true);
  };

  return (
    <>
      <Box sx={{ display: "flex", height: "calc(100vh - 48px)" }}>
        {/* Sidebar */}
        <Box
          sx={{
            width: 360,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRight: "1px solid",
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          {selectedWaterwayId == null ? (
            <WaterwaySearchPanel
              onSelect={setSelectedWaterwayId}
              onWaterwaysChange={setSearchWaterwayIds}
              areaCircle={areaCircle}
              onAreaCircleChange={setAreaCircle}
              areaLocked={areaLocked}
              onAreaLockedChange={setAreaLocked}
              filteredSections={filteredSearchSections}
              selectedSectionId={selectedSectionId}
              onSectionClick={handleSectionClick}
              waterwayNames={waterwayNames}
              favorites={favorites}
              favoritedIds={favoritedIds}
              onToggleFavorite={toggleFavorite}
            />
          ) : (
            <WaterwayDetailPanel
              waterwayId={selectedWaterwayId}
              selectedSectionId={selectedSectionId}
              selectedGaugeId={selectedGaugeId}
              gaugeRanges={gaugeRanges}
              tab={detailTab}
              onTabChange={setDetailTab}
              onBack={() => {
                setSuggestMode(null);
                setSelectedWaterwayId(undefined);
              }}
              onSectionClick={handleSectionClick}
              onSectionDeselect={() => setSelectedSectionId(undefined)}
              suggestMode={suggestMode}
              onSuggestModeChange={(mode) => {
                setSuggestMode(mode);
                if (mode === null) {
                  setSectionPutIn(null);
                  setSectionTakeOut(null);
                  setSectionPickingFor(null);
                  setSectionPreviewCoords(null);
                  setFeatureVertices([]);
                  setFeaturePickingActive(false);
                  setFeatureGeomType("Point");
                }
              }}
              onGaugeSelect={handleGaugeSelect}
              favoritedIds={favoritedIds}
              onToggleFavorite={toggleFavorite}
              sectionPutIn={sectionPutIn}
              sectionTakeOut={sectionTakeOut}
              sectionPickingFor={sectionPickingFor}
              onStartPickPutIn={() => setSectionPickingFor("put-in")}
              onStartPickTakeOut={() => setSectionPickingFor("take-out")}
              onSectionDraftClear={() => {
                setSectionPutIn(null);
                setSectionTakeOut(null);
                setSectionPickingFor(null);
              }}
              featureVertices={featureVertices}
              featureGeomType={featureGeomType}
              onPreviewCoordsChange={setSectionPreviewCoords}
              featurePickingActive={featurePickingActive}
              onStartPickFeature={() => setFeaturePickingActive(true)}
              onStopPickFeature={() => setFeaturePickingActive(false)}
              onPopFeatureVertex={() =>
                setFeatureVertices((prev) => prev.slice(0, -1))
              }
              onRemoveFeatureVertex={(i) =>
                setFeatureVertices((prev) => prev.filter((_, idx) => idx !== i))
              }
              onFeatureGeomTypeChange={(t) => {
                setFeatureGeomType(t);
                setFeatureVertices([]);
                setFeaturePickingActive(false);
              }}
              onFeatureDraftClear={() => {
                setFeatureVertices([]);
                setFeaturePickingActive(false);
              }}
              onFeatureClick={(coords) => setFocusedPoint(coords)}
            />
          )}
        </Box>

        {/* Map + chart */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
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
              areaCircle={selectedWaterwayId == null ? areaCircle : null}
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
              placingFeature={
                featurePickingActive || sectionPickingFor !== null
              }
              onMapClick={
                featurePickingActive || sectionPickingFor !== null
                  ? handleMapPick
                  : undefined
              }
              focusedPoint={focusedPoint}
            />
          </Box>
          {selectedGaugeId != null && selectedGaugeRanges.length > 0 ? (
            <GaugeChartPanel
              ranges={selectedGaugeRanges}
              onClose={() => setSelectedGaugeId(null)}
            />
          ) : selectedSectionId != null && selectedWaterwayId != null ? (
            <SectionChartPanel
              waterwayId={selectedWaterwayId}
              sectionId={selectedSectionId}
              sectionName={
                sections.find((s) => s.id === selectedSectionId)?.name
              }
            />
          ) : null}
        </Box>
      </Box>
    </>
  );
}
