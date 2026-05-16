import { useCallback, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Box from "@mui/material/Box";
import WaterwayMap from "@/components/Map";
import type { GaugePin } from "@/components/Map";
import GaugeChartPanel from "@/components/GaugeChartPanel";
import SectionChartPanel from "@/components/SectionChartPanel";
import WaterwayDetailPanel, { type DetailTab } from "@/components/WaterwayDetailPanel";
import WaterwaySearchPanel from "@/components/WaterwaySearchPanel";
import { useAllSectionWaterStatus, useWaterway } from "@/lib/hooks/useWaterways";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    waterway: search.waterway ? Number(search.waterway) : undefined,
    section: search.section ? Number(search.section) : undefined,
  }),
  component: Home,
});

function Home() {
  const { waterway: selectedWaterwayId, section: selectedSectionId } =
    Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [detailTab, setDetailTab] = useState<DetailTab>("sections");
  const [selectedGaugeId, setSelectedGaugeId] = useState<number | null>(null);

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

  // Fetch gauge data when gauges tab is active or a gauge is selected
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const shouldFetchGauges =
    (detailTab === "gauges" || selectedGaugeId != null) && selectedWaterwayId != null;
  const allWaterStatuses = useAllSectionWaterStatus(
    selectedWaterwayId ?? 0,
    shouldFetchGauges ? sectionIds : [],
  );
  const gaugePins = useMemo(() => {
    if (detailTab !== "gauges") return undefined;
    const seen = new Set<number>();
    return allWaterStatuses.flatMap((q) =>
      (q.data?.ranges ?? []).flatMap((r) => {
        if (r.gauge.lat == null || r.gauge.lon == null || seen.has(r.gauge.id)) return [];
        seen.add(r.gauge.id);
        return [{ id: r.gauge.id, lat: r.gauge.lat, lon: r.gauge.lon, name: r.gauge.name, level: r.level }];
      }),
    );
  }, [detailTab, allWaterStatuses]);

  const gaugeRanges = useMemo(() => {
    if (!shouldFetchGauges) return [];
    const seen = new Set<number>();
    return allWaterStatuses.flatMap((q) =>
      (q.data?.ranges ?? []).filter((r) => {
        if (seen.has(r.gauge.id)) return false;
        seen.add(r.gauge.id);
        return true;
      }),
    );
  }, [shouldFetchGauges, allWaterStatuses]);

  const selectedGaugeRanges = useMemo(() => {
    if (selectedGaugeId == null) return [];
    const seen = new Set<number>();
    return allWaterStatuses.flatMap((q) =>
      (q.data?.ranges ?? []).filter((r) => {
        if (r.gauge.id !== selectedGaugeId || seen.has(r.id)) return false;
        seen.add(r.id);
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

  const handleSectionClick = (id: number) =>
    setSelectedSectionId(id === selectedSectionId ? undefined : id);

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
          <WaterwaySearchPanel onSelect={setSelectedWaterwayId} />
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
            sections={sections}
            selectedSectionId={selectedSectionId}
            onSectionClick={handleSectionClick}
            gaugePins={gaugePins}
            selectedGaugePinId={selectedGaugeId}
            onGaugeClick={handleGaugeClick}
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
