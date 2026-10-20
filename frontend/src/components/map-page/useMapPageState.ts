import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AreaCircle, GaugePin } from "@/components/map/Map";
import type {
  DetailTab,
  SectionDetailTab,
  SuggestMode,
} from "@/components/waterway/types";
import {
  type Feature,
  proposalsApi,
  type SectionWithFeatures,
} from "@/lib/api";
import { type Bounds, DEFAULT_RADIUS_KM, type ViewBounds } from "@/lib/geo";
import { useFavorites } from "@/lib/hooks/useFavorites";
import { useFilteredSections } from "@/lib/hooks/useFilteredSections";
import { useGaugeData } from "@/lib/hooks/useGaugeData";
import { proposalKeys } from "@/lib/hooks/useProposals";
import { useRegionOutline, useRegionsInView } from "@/lib/hooks/useRegions";
import { useSectionLevels } from "@/lib/hooks/useWaterStatus";
import { useWaterwaySections } from "@/lib/hooks/useWaterwaySections";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { pushRecentWaterway } from "@/lib/recentWaterways";
import { ALL_REGION_KINDS } from "@/lib/regionKinds";
import { defaultAreaCircle } from "./areaFrame";
import { modeSheetMode, modeSheetPeek } from "./modeSheet";
import { useFeaturePicker } from "./useFeaturePicker";
import { useMobilePanelState } from "./useMobilePanelState";

export type RouteSearch = {
  waterway?: number;
  section?: number;
  lat?: number;
  lon?: number;
  radius?: number;
  panel?: true;
  min_diff?: number;
  max_diff?: number;
  mode?: "area" | "region";
  region?: number;
};

/** Every level the region chips offer; asked for together so the map can draw
 * districts and ranges at the zoom where they fit. */

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
    region,
  } = search;

  const navigate = useNavigate({ from: "/" });

  const [detailTab, setDetailTab] = useState<DetailTab>("sections");
  const [sectionDetailTab, setSectionDetailTab] =
    useState<SectionDetailTab>("features");
  const [selectedGaugeId, setSelectedGaugeId] = useState<number | null>(null);
  const [searchWaterwayIds, setSearchWaterwayIds] = useState<number[]>([]);
  // The sections the search panel lists, after its own matching (name scope,
  // Water now). Null until a panel reports; the map then draws all results.
  const [shownSearchSections, setShownRaw] = useState<
    SectionWithFeatures[] | null
  >(null);
  // Same sections, same state: the panel recomputes its list on many renders.
  const setShownSearchSections = useCallback(
    (next: SectionWithFeatures[]) =>
      setShownRaw((prev) =>
        prev &&
        prev.length === next.length &&
        prev.every((s, i) => s === next[i])
          ? prev
          : next,
      ),
    [],
  );
  const [labelMode, setLabelMode] = useState<"section" | "river">("section");
  const [areaLocked, setAreaLocked] = useState(false);
  // The level chips narrow which regions the map draws.
  const [regionLevel, setRegionLevel] = useState<string | null>(null);
  const { favorites, favoritedIds, toggle: toggleFavorite } = useFavorites();

  // Feature suggestion: pick geometry vertices from the map
  const featurePicker = useFeaturePicker();
  const {
    featurePickingActive,
    setFeaturePickingActive,
    featureGeomType,
    setFeatureGeomType,
    featureVertices,
    setFeatureVertices,
    editFeature,
    handleMapPick,
  } = featurePicker;

  /** Open the suggest-feature panel prefilled with an existing feature. */
  const startEditFeature = useCallback(
    (f: Feature) => {
      featurePicker.seedFromFeature(f);
      setSuggestMode("feature");
    },
    [featurePicker.seedFromFeature],
  );

  // Preview line drawn on the map (e.g. OSM river highlight in suggest flows)
  const [sectionPreviewCoords, setSectionPreviewCoords] = useState<
    [number, number][] | null
  >(null);

  const [suggestMode, setSuggestMode] = useState<SuggestMode | null>(null);
  // Name prefill for the "suggest new river" panel (from the search field)
  const [suggestWaterwayName, setSuggestWaterwayName] = useState("");
  // Note composer's map pin: placing routes the next map click here, the
  // draft pin rides along until the note is posted.
  const [notePinPlacing, setNotePinPlacing] = useState(false);
  const [notePin, setNotePin] = useState<[number, number] | null>(null);
  // Selection shared between the thread and the map's note markers.
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<[number, number] | null>(
    null,
  );
  // Bounding box the camera should fit (e.g. a gauge-backed river's stations
  // in the suggest-river panel): [[minLon, minLat], [maxLon, maxLat]].
  const [focusBounds, setFocusBounds] = useState<Bounds | null>(null);
  // Catalog stations of the river being suggested, shown as neutral map pins
  // while the suggest-river panel is open.
  const [suggestGaugePins, setSuggestGaugePins] = useState<GaugePin[]>([]);
  // Feature highlighted in the section's feature timeline; the chart panel
  // brings this feature's water ranges to the front.
  const [selectedFeatureId, setSelectedFeatureId] = useState<number | null>(
    null,
  );

  // Current map viewport bounds (used for OSM lookups in suggest flows)
  const [mapBounds, setMapBoundsRaw] = useState<ViewBounds | null>(null);
  // Keep the previous reference for identical bounds - the map reports on
  // every moveend (including camera-effect fitBounds), and a fresh object
  // for unchanged bounds would re-render the whole page in a loop.
  const setMapBounds = useCallback(
    (b: ViewBounds) =>
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
    // Always loaded for the selected section (not just when the proposals
    // toggle is on): the feature timeline marks features with a pending
    // delete proposal.
    enabled: selectedSectionId != null,
  });

  const {
    isMobile,
    isMobileMapView,
    toggleMobileMapView,
    isMobilePanelOpen,
    setIsMobilePanelOpen,
    exitMapView,
  } = useMobilePanelState(panel, selectedWaterwayId);

  const [previewRadius, setPreviewRadius] = useState<number | null>(null);
  const [isSearchPanelLoading, setIsSearchPanelLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on section change
  useEffect(() => {
    setFocusedPoint(null);
  }, [selectedSectionId]);

  // The river-focus box and station pins only make sense inside the
  // suggest-river panel; clear them when the panel closes.
  useEffect(() => {
    if (suggestMode !== "waterway") {
      setFocusBounds(null);
      setSuggestGaugePins([]);
    }
  }, [suggestMode]);

  // When suggest mode opens, always bring the overlay back (map-view hides it)
  useEffect(() => {
    if (suggestMode != null) {
      exitMapView();
    }
  }, [suggestMode, exitMapView]);

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

  // The region searched in: its boundary is drawn on the map, and the camera
  // frames it once when it is picked.
  const { data: regionOutline } = useRegionOutline(
    mode === "region" ? region : undefined,
  );
  const regionBbox = regionOutline?.bbox;
  useEffect(() => {
    if (!regionBbox) return;
    const [west, south, east, north] = regionBbox;
    setFocusBounds([
      [west, south],
      [east, north],
    ]);
  }, [regionBbox]);

  // In region mode the map doubles as the picker: every region in view is
  // drawn and clickable, so a region can be found by looking rather than by
  // knowing its name.
  const regionsInView = useRegionsInView(
    mode === "region" && mapBounds ? mapBounds : undefined,
    regionLevel ? [regionLevel] : ALL_REGION_KINDS,
  );
  const selectRegion = useCallback(
    (regionId: number) =>
      navigate({
        search: (prev) => ({ ...prev, mode: "region", region: regionId }),
        replace: true,
      }),
    [navigate],
  );

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

  // The circle is there from the moment area search opens: at the middle of
  // the map that is in view, above a phone's sheet. A tap moves it from there.
  const sheetMode = modeSheetMode({
    isMobile,
    isAreaMode,
    isRegionMode: mode === "region",
    selectedWaterwayId,
    suggestMode,
  });
  const needsCircle =
    isAreaMode &&
    selectedWaterwayId == null &&
    suggestMode == null &&
    areaCircle == null;
  useEffect(() => {
    if (!needsCircle || !mapBounds) return;
    const covered =
      sheetMode === "area" ? modeSheetPeek("area") / window.innerHeight : 0;
    setAreaCircle(
      defaultAreaCircle(mapBounds, radius ?? DEFAULT_RADIUS_KM, covered),
    );
  }, [needsCircle, mapBounds, radius, sheetMode, setAreaCircle]);

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
      setSectionDetailTab("features");
      setSelectedGaugeId(null);
      navigate({
        search: (prev) => ({ ...prev, waterway: id, section: undefined }),
      });
    },
    [navigate],
  );

  const setSelectedSectionId = useCallback(
    (id: number | undefined) => {
      setSectionDetailTab("features");
      setSelectedFeatureId(null);
      navigate({ search: (prev) => ({ ...prev, section: id }) });
    },
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

  const searchResults = useWaterwaySections(
    searchWaterwayIds,
    selectedWaterwayId == null,
  );
  const searchSections = searchResults.sections;
  const isAreaSearchLoading = isSearchPanelLoading || searchResults.isFetching;
  const areSearchSectionsPending = searchResults.arePending;

  const waterwayNames = useMemo(() => {
    const map: Record<number, string> = { ...searchResults.names };
    if (selectedWaterway) map[selectedWaterway.id] = selectedWaterway.name;
    return map;
  }, [searchResults.names, selectedWaterway]);

  const filteredSearchSections = useFilteredSections(searchSections, {
    areaCircle: isAreaMode ? areaCircle : null,
    minDiff: min_diff,
    maxDiff: max_diff,
  });

  // What the map draws of the search: the panel's list, plus the open section.
  const mapSearchSections = useMemo(() => {
    if (!shownSearchSections) return filteredSearchSections;
    const open = filteredSearchSections.find((s) => s.id === selectedSectionId);
    return open && !shownSearchSections.includes(open)
      ? [...shownSearchSections, open]
      : shownSearchSections;
  }, [shownSearchSections, filteredSearchSections, selectedSectionId]);

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const shouldFetchGauges = selectedWaterwayId != null;
  const sectionPairs = useMemo(
    () =>
      selectedWaterwayId != null
        ? sectionIds.map((sectionId) => ({
            waterwayId: selectedWaterwayId,
            sectionId,
          }))
        : [],
    [selectedWaterwayId, sectionIds],
  );
  const { statuses: allWaterStatuses, levels: sectionLevels } =
    useSectionLevels(sectionPairs);
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

  const searchSectionPairs = useMemo(
    () =>
      selectedWaterwayId == null
        ? mapSearchSections.slice(0, 60).map((s) => ({
            waterwayId: s.waterway_id,
            sectionId: s.id,
          }))
        : [],
    [selectedWaterwayId, mapSearchSections],
  );
  const { levels: searchSectionLevels } = useSectionLevels(searchSectionPairs);

  const handleGaugeClick = useCallback((pin: GaugePin) => {
    setSelectedGaugeId((prev) => (prev === pin.id ? null : pin.id));
  }, []);

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
    setSuggestWaterwayName("");
    featurePicker.reset();
  }, [featurePicker.reset]);

  /** Leave suggest mode AND clear its state - the two must always pair. */
  const closeSuggest = useCallback(() => {
    setSuggestMode(null);
    clearSuggestState();
  }, [clearSuggestState]);

  return {
    // URL-derived (read-only from search params)
    selectedWaterwayId,
    selectedSectionId,
    isAreaMode,
    isRegionMode: mode === "region",
    areaCircle,
    regionOutline,
    regionChoices: regionsInView.regions,
    countryBorders: regionsInView.countries,
    regionsLoading: regionsInView.loading,
    regionsHiddenKinds: regionsInView.hiddenKinds,
    selectRegion,
    regionLevel,
    setRegionLevel,
    // Navigation helpers
    setSelectedWaterwayId,
    setSelectedSectionId,
    setAreaCircle,
    handleAreaCircleChange,
    // UI state
    detailTab,
    setDetailTab,
    sectionDetailTab,
    setSectionDetailTab,
    selectedGaugeId,
    setSelectedGaugeId,
    searchWaterwayIds,
    setSearchWaterwayIds,
    shownSearchSections,
    setShownSearchSections,
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
    editFeature,
    startEditFeature,
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
    notePinPlacing,
    setNotePinPlacing,
    notePin,
    setNotePin,
    selectedNoteId,
    setSelectedNoteId,
    focusBounds,
    setFocusBounds,
    suggestGaugePins,
    setSuggestGaugePins,
    selectedFeatureId,
    setSelectedFeatureId,
    showProposedFeatures,
    toggleShowProposedFeatures,
    featureProposals,
    isMobile,
    isMobilePanelOpen,
    setIsMobilePanelOpen,
    isMobileMapView,
    toggleMobileMapView,
    exitMapView,
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
    mapSearchSections,
    waterwayNames,
    isAreaSearchLoading,
    areSearchSectionsPending,
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
    closeSuggest,
  };
}

export type MapPageState = ReturnType<typeof useMapPageState>;
