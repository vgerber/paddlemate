import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { waterStatusApi } from "@/lib/api";
import { maxLevel, type WaterLevel } from "@/lib/waterLevel";
import { waterwayKeys } from "./useWaterways";

/** Matches the gauge reader poll interval. */
const WATER_STATUS_STALE_MS = 5 * 60 * 1000;

export function useWaterStatus(
  waterwayId: number | null,
  sectionId: number | null,
) {
  return useQuery({
    queryKey: waterwayKeys.sectionWaterStatus(waterwayId ?? 0, sectionId ?? 0),
    queryFn: () =>
      waterStatusApi.getForSection(waterwayId as number, sectionId as number),
    enabled: waterwayId !== null && sectionId !== null,
    staleTime: WATER_STATUS_STALE_MS,
  });
}

/** Water status for arbitrary (waterwayId, sectionId) pairs. Cache-shared
 * with useWaterStatus, so per-row chips reuse these results. */
export function useSectionWaterStatuses(
  pairs: { waterwayId: number; sectionId: number }[],
) {
  return useQueries({
    queries: pairs.map(({ waterwayId, sectionId }) => ({
      queryKey: waterwayKeys.sectionWaterStatus(waterwayId, sectionId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        waterStatusApi.getForSection(waterwayId, sectionId, signal),
      staleTime: WATER_STATUS_STALE_MS,
    })),
  });
}

/** Water status for every section of one waterway. */
export function useAllSectionWaterStatus(
  waterwayId: number,
  sectionIds: number[],
) {
  return useSectionWaterStatuses(
    sectionIds.map((sectionId) => ({ waterwayId, sectionId })),
  );
}

/** Water statuses plus a sectionId -> most severe level map, for coloring
 * section lines and list chips. */
export function useSectionLevels(
  pairs: { waterwayId: number; sectionId: number }[],
) {
  const statuses = useSectionWaterStatuses(pairs);
  const levels = useMemo(() => {
    const map: Record<number, WaterLevel> = {};
    statuses.forEach((q, i) => {
      if (!q.data?.ranges.length || pairs[i] == null) return;
      map[pairs[i].sectionId] = maxLevel(q.data.ranges.map((r) => r.level));
    });
    return map;
  }, [statuses, pairs]);
  return { statuses, levels };
}
