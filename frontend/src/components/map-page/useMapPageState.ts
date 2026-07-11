import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AreaCircle, GaugePin } from "@/components/map/Map";
import type { DetailTab, SuggestMode } from "@/components/waterway/types";
import { proposalsApi, waterwaysApi } from "@/lib/api";
import { useFavorites } from "@/lib/hooks/useFavorites";
import { useFilteredSections } from "@/lib/hooks/useFilteredSections";
import { useGaugeData } from "@/lib/hooks/useGaugeData";
import { proposalKeys } from "@/lib/hooks/useProposals";
import {
  useAllSectionWaterStatus,
  useSectionWaterStatuses,
  useWaterway,
  waterwayKeys,
} from "@/lib/hooks/useWaterways";
import { pushRecentWaterway } from "@/lib/recentWaterways";

export type RouteSearch = {
  waterway?: number;
  section?: number;
  lat?: number;
  lon?: number;
  radius?: number;
  panel?: "1";
  min_diff?: number;
  max_diff?: number;
  mode?: "area";
};

const LEVEL_ORDER = ["empty", "low", "medium", "high"] as const;

export function useMapPageState(search: RouteSearch) {
  const {
    waterway: selectedWaterwayId,
    section: selectedSectionId,
    panel,
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

  // Preview line drawn on the map (e.g. OSM river highlight in suggest flows)
  const [sectionPreviewCoords, setSectionPreviewCoords] = useState<
    [number, number][] | null
  >(null);

  const [suggestMode, setSuggestMode] = useState<SuggestMode | null>(null);
  // Name prefill for the "suggest new river" panel (from the search field)
  const [suggestWaterwayName, setSuggestWaterwayName] = useState("");
  const [focusedPoint, setFocusedPoint] = useState<[number, number] | null>(
    null,
  );

  // Current map viewport bounds (used for OSM lookups in suggest flows)
  const [mapBounds, setMapBoundsRaw] = useState<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  // Keep the previous reference for identical bounds - the map reports on
  // every moveend (including camera-effect fitBounds), and a fresh object
  // for unchanged bounds would re-render the whole page in a loop.
  const setMapBounds = useCallback(
    (b: { south: number; west: number; north: number; east: number }) =>
      setMapBoundsRaw((prev) =>
        prev &&
        prev.south === b.south &&
        prev.west === b.west &&
        prev.north === b.north &&
        prev.east === b.east
          ? prev
          : b,
      ),
    [],
  );

  const [showProposedFeatures, setShowProposedFeatures] = useState(false);
  const toggleShowProposedFeatures = useCallback(
    () => setShowProposedFeatures((v) => !v),
    [],
  );
  const { data: featureProposals = [] } = useQuery({
    queryKey: proposalKeys.list({
      entity_type: "feature",
      status: "pending",
      section_id: selectedSectionId,
    }),
    queryFn: () =>
      proposalsApi.list({
        entity_type: "feature",
        status: "pending",
        section_id: selectedSectionId,
      }),
    enabled: selectedSectionId != null && showProposedFeatures,
  });

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // isMobileMapView lets the user toggle the overlay away to see the map while
  // keeping the section selected. Auto-resets when section is deselected.
  const [isMobileMapViewRaw, setIsMobileMapViewRaw] = useState(false);
  const isMobileMapView = isMobileMapViewRaw && selectedWaterwayId != null;
  const toggleMobileMapView = useCallback(
    () => setIsMobileMapViewRaw((v) => !v),
    [],
  );

  // isMobilePanelOpen is URL-driven so the browser back button works through
  // overlay history: FAB → /?panel=1 → /?panel=1&waterway=123 → back → back
  const setIsMobilePanelOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setIsMobileMapViewRaw(false); // ensure overlay is visible when explicitly opening
        navigate({ search: (prev) => ({ ...prev, panel: "1" }) });
      } else {
        navigate({
          search: (prev) => ({
            ...prev,
            panel: undefined,
            waterway: undefined,
            section: undefined,
          }),
        });
      }
    },
    [navigate],
  );
  const isMobilePanelOpen =
    isMobile &&
    (panel === "1" || selectedWaterwayId != null) &&
    !isMobileMapView;

  const [previewRadius, setPreviewRadius] = useState<number | null>(null);
  const [isSearchPanelLoading, setIsSearchPanelLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on section change
  useEffect(() => {
    setFocusedPoint(null);
  }, [selectedSectionId]);

  // When suggest mode opens, always bring the overlay back (map-view hides it)
  useEffect(() => {
    if (suggestMode != null) {
      setIsMobileMapViewRaw(false);
    }
  }, [suggestMode]);

  // Stable identity per (lat, lon, radius) - camera effects and section
  // filters depend on this object; rebuilding it every render made the
  // area-mode fitBounds effect refire on each render (update-depth loop).
  const areaCircle: AreaCircle | null = useMemo(
    () =>
      lat != null && lon != null && radius != null
        ? { lat, lon, radiusKm: radius }
        : null,
    [lat, lon, radius],
  );

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

  // Remember opened rivers for the "recent" list in the search panel
  const selectedWaterwayName = selectedWaterway?.name;
  useEffect(() => {
    if (selectedWaterwayId != null && selectedWaterwayName) {
      pushRecentWaterway({
        id: selectedWaterwayId,
        name: selectedWaterwayName,
      });
    }
  }, [selectedWaterwayId, selectedWaterwayName]);

  const searchWaterwayDetails = useQueries({
    queries:
      selectedWaterwayId == null
        ? searchWaterwayIds.map((id) => ({
            queryKey: waterwayKeys.detail(id),
            queryFn: ({ signal }: { signal: AbortSignal }) =>
              waterwaysApi.get(id, signal),
            // Result ids change on every keystroke; don't refetch details
            // that were already loaded for a previous search.
            staleTime: 5 * 60 * 1000,
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
    areaCircle: isAreaMode ? areaCircle : null,
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

  const selectedSectionGaugeRanges = useMemo(() => {
    if (selectedSectionId == null) return [];
    const idx = sectionIds.indexOf(selectedSectionId);
    if (idx < 0) return [];
    return allWaterStatuses[idx]?.data?.ranges ?? [];
  }, [selectedSectionId, sectionIds, allWaterStatuses]);

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
      }
    },
    [featurePickingActive],
  );

  const handleGaugeSelect = useCallback((gaugeId: number) => {
    setSelectedGaugeId((prev) => (prev === gaugeId ? null : gaugeId));
  }, []);

  const handleSectionClick = useCallback(
    (id: number) => {
      if (selectedWaterwayId == null) {
        const section =
          filteredSearchSections.find((s) => s.id === id) ??
          favorites.find((s) => s.id === id);
        if (section) {
          setSelectedWaterwayId(section.waterway_id);
          setSelectedSectionId(id);
          if (isMobile) setIsMobilePanelOpen(true);
          return;
        }
      }
      setSelectedSectionId(id === selectedSectionId ? undefined : id);
      if (isMobile && selectedWaterwayId != null && !isMobileMapView)
        setIsMobilePanelOpen(true);
    },
    [
      selectedWaterwayId,
      selectedSectionId,
      filteredSearchSections,
      favorites,
      isMobile,
      isMobileMapView,
      setSelectedWaterwayId,
      setSelectedSectionId,
      setIsMobilePanelOpen,
    ],
  );

  /** Clears all suggest/feature-picking state (called when suggestMode is set to null). */
  const clearSuggestState = useCallback(() => {
    setSectionPreviewCoords(null);
    setFeatureVertices([]);
    setFeaturePickingActive(false);
    setFeatureGeomType("Point");
    setSuggestWaterwayName("");
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
    sectionPreviewCoords,
    setSectionPreviewCoords,
    suggestMode,
    setSuggestMode,
    suggestWaterwayName,
    setSuggestWaterwayName,
    mapBounds,
    setMapBounds,
    focusedPoint,
    setFocusedPoint,
    showProposedFeatures,
    toggleShowProposedFeatures,
    featureProposals,
    isMobile,
    isMobilePanelOpen,
    setIsMobilePanelOpen,
    isMobileMapView,
    toggleMobileMapView,
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
    selectedSectionGaugeRanges,
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
