import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AreaCircle, GaugePin } from "@/components/map/Map";
import type {
  DetailTab,
  SuggestMode,
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

export type RouteSearch = {
  waterway?: number;
  section?: number;
  lat?: number;
  lon?: number;
  radius?: number;
  min_diff?: number;
  max_diff?: number;
  mode?: "area";
};

const LEVEL_ORDER = ["empty", "low", "medium", "high"] as const;

export function useMapPageState(search: RouteSearch) {
  const {
    waterway: selectedWaterwayId,
    section: selectedSectionId,
    lat,
    lon,
    radius,
    min_diff,
    max_diff,
    mode,
  } = search;

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
  const [previewRadius, setPreviewRadius] = useState<number | null>(null);
  const [isSearchPanelLoading, setIsSearchPanelLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on section change
  useEffect(() => {
    setFocusedPoint(null);
  }, [selectedSectionId]);

  // Auto-open panel on mobile when a waterway is set (e.g. URL has ?waterway=…)
  useEffect(() => {
    if (isMobile && selectedWaterwayId != null) {
      setIsMobilePanelOpen(true);
    }
  }, [selectedWaterwayId, isMobile]);

  const areaCircle: AreaCircle | null =
    lat != null && lon != null && radius != null
      ? { lat, lon, radiusKm: radius }
      : null;

  const isAreaMode = mode === "area";

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

  /** Reset live preview then commit to URL. Used when area changes from a panel. */
  const handleAreaCircleChange = useCallback(
    (c: AreaCircle | null) => {
      setPreviewRadius(null);
      setAreaCircle(c);
    },
    [setAreaCircle],
  );

  const setSelectedWaterwayId = useCallback(
    (id: number | undefined) => {
      setDetailTab("sections");
      setSelectedGaugeId(null);
      navigate({
        search: (prev) => ({ ...prev, waterway: id, section: undefined }),
      });
    },
    [navigate],
  );

  const setSelectedSectionId = useCallback(
    (id: number | undefined) =>
      navigate({ search: (prev) => ({ ...prev, section: id }) }),
    [navigate],
  );

  const { data: selectedWaterway } = useWaterway(selectedWaterwayId ?? null);
  const sections = useMemo(
    () => selectedWaterway?.sections ?? [],
    [selectedWaterway],
  );

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
  const isAreaSearchLoading =
    isSearchPanelLoading ||
    searchWaterwayDetails.some((q) => q.isLoading || q.isFetching);

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

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
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

  const handleSectionClick = useCallback(
    (id: number) => {
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
    },
    [
      selectedWaterwayId,
      selectedSectionId,
      filteredSearchSections,
      isMobile,
      setSelectedWaterwayId,
      setSelectedSectionId,
    ],
  );

  /** Clears all suggest/feature-picking state (called when suggestMode is set to null). */
  const clearSuggestState = useCallback(() => {
    setSectionPutIn(null);
    setSectionTakeOut(null);
    setSectionPickingFor(null);
    setSectionPreviewCoords(null);
    setFeatureVertices([]);
    setFeaturePickingActive(false);
    setFeatureGeomType("Point");
  }, []);

  return {
    // URL-derived (read-only from search params)
    selectedWaterwayId,
    selectedSectionId,
    isAreaMode,
    areaCircle,
    // Navigation helpers
    setSelectedWaterwayId,
    setSelectedSectionId,
    setAreaCircle,
    handleAreaCircleChange,
    // UI state
    detailTab,
    setDetailTab,
    selectedGaugeId,
    setSelectedGaugeId,
    searchWaterwayIds,
    setSearchWaterwayIds,
    labelMode,
    setLabelMode,
    areaLocked,
    setAreaLocked,
    featurePickingActive,
    setFeaturePickingActive,
    featureGeomType,
    setFeatureGeomType,
    featureVertices,
    setFeatureVertices,
    sectionPickingFor,
    setSectionPickingFor,
    sectionPutIn,
    setSectionPutIn,
    sectionTakeOut,
    setSectionTakeOut,
    sectionPreviewCoords,
    setSectionPreviewCoords,
    suggestMode,
    setSuggestMode,
    focusedPoint,
    setFocusedPoint,
    isMobile,
    isMobilePanelOpen,
    setIsMobilePanelOpen,
    previewRadius,
    setPreviewRadius,
    isSearchPanelLoading,
    setIsSearchPanelLoading,
    // Favorites
    favorites,
    favoritedIds,
    toggleFavorite,
    // Data
    sections,
    filteredSearchSections,
    waterwayNames,
    isAreaSearchLoading,
    gaugePins,
    gaugeRanges,
    selectedGaugeRanges,
    sectionLevels,
    searchSectionLevels,
    // Handlers
    handleSectionClick,
    handleGaugeClick,
    handleMapPick,
    handleGaugeSelect,
    clearSuggestState,
  };
}

export type MapPageState = ReturnType<typeof useMapPageState>;
