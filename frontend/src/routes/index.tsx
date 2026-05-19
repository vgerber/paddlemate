import { useCallback, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import WaterwayMap from "@/components/map/Map";
import type { AreaCircle, GaugePin } from "@/components/map/Map";
import GaugeChartPanel from "@/components/charts/GaugeChartPanel";
import SectionChartPanel from "@/components/charts/SectionChartPanel";
import WaterwayDetailPanel, {
  type DetailTab,
} from "@/components/waterway/WaterwayDetailPanel";
import WaterwaySearchPanel from "@/components/search/WaterwaySearchPanel";
import {
  useAllSectionWaterStatus,
  useSectionWaterStatuses,
  useWaterway,
  waterwayKeys,
} from "@/lib/hooks/useWaterways";
import { useFilteredSections } from "@/lib/hooks/useFilteredSections";
import { useGaugeData } from "@/lib/hooks/useGaugeData";
import { waterwaysApi } from "@/lib/api";

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

  // Fetch full waterway data for search results to show on map (capped to avoid fanout)
  const searchWaterwayDetails = useQueries({
    queries:
      selectedWaterwayId == null
        ? searchWaterwayIds.slice(0, 20).map((id) => ({
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
  const shouldFetchGauges =
    (detailTab === "gauges" || selectedGaugeId != null) &&
    selectedWaterwayId != null;
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

  const LEVEL_ORDER = ["empty", "low", "medium", "high"];
  const sectionLevels = useMemo(() => {
    const map: Record<number, string> = {};
    allWaterStatuses.forEach((q, i) => {
      if (!q.data?.ranges.length || sectionIds[i] == null) return;
      const maxLevel = q.data.ranges.reduce<string>((best, r) => {
        return LEVEL_ORDER.indexOf(r.level) > LEVEL_ORDER.indexOf(best)
          ? r.level
          : best;
      }, "empty");
      map[sectionIds[i]] = maxLevel;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const maxLevel = q.data.ranges.reduce<string>((best, r) => {
        return LEVEL_ORDER.indexOf(r.level) > LEVEL_ORDER.indexOf(best)
          ? r.level
          : best;
      }, "empty");
      map[searchSectionPairs[i].sectionId] = maxLevel;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchWaterStatuses, searchSectionPairs]);

  const handleGaugeClick = useCallback((pin: GaugePin) => {
    setSelectedGaugeId((prev) => (prev === pin.id ? null : pin.id));
  }, []);

  const handleGaugeSelect = useCallback((gaugeId: number) => {
    setSelectedGaugeId((prev) => (prev === gaugeId ? null : gaugeId));
  }, []);

  const handleSectionClick = (id: number) => {
    if (selectedWaterwayId == null) {
      const section = filteredSearchSections.find((s) => s.id === id);
      if (section) {
        setSelectedWaterwayId(section.waterway_id);
        setSelectedSectionId(id);
        return;
      }
    }
    setSelectedSectionId(id === selectedSectionId ? undefined : id);
  };

  return (
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
          />
        ) : (
          <WaterwayDetailPanel
            waterwayId={selectedWaterwayId}
            selectedSectionId={selectedSectionId}
            selectedGaugeId={selectedGaugeId}
            gaugeRanges={gaugeRanges}
            tab={detailTab}
            onTabChange={setDetailTab}
            onBack={() => setSelectedWaterwayId(undefined)}
            onSectionClick={handleSectionClick}
            onGaugeSelect={handleGaugeSelect}
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
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <WaterwayMap
            sections={
              selectedWaterwayId != null ? sections : filteredSearchSections
            }
            selectedSectionId={selectedSectionId}
            onSectionClick={handleSectionClick}
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
            sectionName={sections.find((s) => s.id === selectedSectionId)?.name}
          />
        ) : null}
      </Box>
    </Box>
  );
}
