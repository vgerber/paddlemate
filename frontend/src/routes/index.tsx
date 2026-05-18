import { useCallback, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import WaterwayMap from "@/components/Map";
import type { AreaCircle, GaugePin } from "@/components/Map";
import GaugeChartPanel from "@/components/GaugeChartPanel";
import SectionChartPanel from "@/components/SectionChartPanel";
import WaterwayDetailPanel, {
  type DetailTab,
} from "@/components/WaterwayDetailPanel";
import WaterwaySearchPanel from "@/components/WaterwaySearchPanel";
import {
  useAllSectionWaterStatus,
  useWaterway,
  waterwayKeys,
} from "@/lib/hooks/useWaterways";
import { waterwaysApi } from "@/lib/api";

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseDifficulty(diff: string | undefined): number | null {
  if (!diff) return null;
  if (/^X/i.test(diff)) return 10;
  if (/^VI/i.test(diff)) return 6;
  if (/^V/i.test(diff)) return 5;
  if (/^IV/i.test(diff)) return 4;
  if (/^III/i.test(diff)) return 3;
  if (/^II/i.test(diff)) return 2;
  if (/^I/i.test(diff)) return 1;
  return null;
}

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
  const sections = selectedWaterway?.sections ?? [];

  // Fetch full waterway data (with sections+geometry) for search results to show on map
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

  // Filter search sections by area circle and difficulty
  const filteredSearchSections = useMemo(() => {
    let result = searchSections;

    // Geographic: keep sections whose put-in, take-out, OR midpoint is within the circle
    if (areaCircle) {
      result = result.filter((s) => {
        const geom = s.location as unknown as GeoJSON.LineString;
        if (geom?.type !== "LineString" || !geom.coordinates.length)
          return false;
        const coords = geom.coordinates;
        const first = coords[0];
        const last = coords[coords.length - 1];
        const mid = coords[Math.floor(coords.length / 2)];
        return (
          haversineKm(areaCircle.lat, areaCircle.lon, first[1], first[0]) <=
            areaCircle.radiusKm ||
          haversineKm(areaCircle.lat, areaCircle.lon, last[1], last[0]) <=
            areaCircle.radiusKm ||
          haversineKm(areaCircle.lat, areaCircle.lon, mid[1], mid[0]) <=
            areaCircle.radiusKm
        );
      });
    }

    // Difficulty: filter out sections that are outside the min/max grade range
    if (min_diff != null || max_diff != null) {
      const minG = min_diff ?? 1;
      const maxG = max_diff ?? 10;
      result = result.filter((s) => {
        const ww = s.features?.find((f) => f.feature_type === "whitewater");
        const diff = parseDifficulty(
          (ww?.metadata as Record<string, unknown> | undefined)?.difficulty as
            | string
            | undefined,
        );
        if (diff == null) return true; // no grade info → show
        return diff >= minG && diff <= maxG;
      });
    }

    return result;
  }, [areaCircle, min_diff, max_diff, searchSections]);

  // Fetch gauge data when gauges tab is active or a gauge is selected
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const shouldFetchGauges =
    (detailTab === "gauges" || selectedGaugeId != null) &&
    selectedWaterwayId != null;
  const allWaterStatuses = useAllSectionWaterStatus(
    selectedWaterwayId ?? 0,
    shouldFetchGauges ? sectionIds : [],
  );
  const gaugePins = useMemo(() => {
    if (detailTab !== "gauges") return undefined;
    const seen = new Set<string>();
    return allWaterStatuses.flatMap((q) =>
      (q.data?.ranges ?? []).flatMap((r) => {
        const stationKey = r.gauge.source_id.split(":")[0];
        if (r.gauge.lat == null || r.gauge.lon == null || seen.has(stationKey))
          return [];
        seen.add(stationKey);
        return [
          {
            id: r.gauge.id,
            lat: r.gauge.lat,
            lon: r.gauge.lon,
            name: r.gauge.name,
            level: r.level,
          },
        ];
      }),
    );
  }, [detailTab, allWaterStatuses]);

  // One list entry per physical station (deduplicated by station UUID = source_id prefix).
  const gaugeRanges = useMemo(() => {
    if (!shouldFetchGauges) return [];
    const seen = new Set<string>();
    return allWaterStatuses.flatMap((q) =>
      (q.data?.ranges ?? []).filter((r) => {
        const stationKey = r.gauge.source_id.split(":")[0];
        if (seen.has(stationKey)) return false;
        seen.add(stationKey);
        return true;
      }),
    );
  }, [shouldFetchGauges, allWaterStatuses]);

  // All series for the selected gauge's station, deduplicated by series_id.
  const selectedGaugeRanges = useMemo(() => {
    if (selectedGaugeId == null) return [];
    // Find the station key for the selected gauge
    const selectedRange = allWaterStatuses
      .flatMap((q) => q.data?.ranges ?? [])
      .find((r) => r.gauge.id === selectedGaugeId);
    if (!selectedRange) return [];
    const stationKey = selectedRange.gauge.source_id.split(":")[0];
    const seenSeries = new Set<number>();
    return allWaterStatuses.flatMap((q) =>
      (q.data?.ranges ?? []).filter((r) => {
        const rKey = r.gauge.source_id.split(":")[0];
        if (rKey !== stationKey || seenSeries.has(r.series.id)) return false;
        seenSeries.add(r.series.id);
        return true;
      }),
    );
  }, [selectedGaugeId, allWaterStatuses]);

  const handleGaugeClick = useCallback((pin: GaugePin) => {
    setSelectedGaugeId((prev) => (prev === pin.id ? null : pin.id));
  }, []);

  const handleGaugeSelect = useCallback((gaugeId: number) => {
    setSelectedGaugeId((prev) => (prev === gaugeId ? null : gaugeId));
  }, []);

  const handleSectionClick = (id: number) => {
    if (selectedWaterwayId == null) {
      // In search mode, also select the parent waterway
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
