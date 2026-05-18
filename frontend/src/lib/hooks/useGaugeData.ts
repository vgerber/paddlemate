import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { SectionWaterStatus, WaterRangeWithStatus } from "@/lib/api";
import type { GaugePin } from "@/components/map/GaugeMarkers";

export type { GaugePin } from "@/components/map/GaugeMarkers";

interface UseGaugeDataOptions {
  allWaterStatuses: UseQueryResult<SectionWaterStatus>[];
  selectedGaugeId: number | null;
  detailTab: string;
  shouldFetchGauges: boolean;
}

interface UseGaugeDataResult {
  gaugePins: GaugePin[] | undefined;
  gaugeRanges: WaterRangeWithStatus[];
  selectedGaugeRanges: WaterRangeWithStatus[];
}

export function useGaugeData({
  allWaterStatuses,
  selectedGaugeId,
  detailTab,
  shouldFetchGauges,
}: UseGaugeDataOptions): UseGaugeDataResult {
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

  const selectedGaugeRanges = useMemo(() => {
    if (selectedGaugeId == null) return [];
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

  return { gaugePins, gaugeRanges, selectedGaugeRanges };
}
