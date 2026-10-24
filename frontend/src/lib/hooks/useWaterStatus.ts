import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { waterStatusApi } from "@/lib/api";
import { type DotLevel, dotLevel } from "@/lib/levelDots";
import { currentLevel, type WaterLevel } from "@/lib/waterLevel";
import { waterwayKeys } from "./useWaterways";

/** Matches the gauge reader poll interval. */
const WATER_STATUS_STALE_MS = 5 * 60 * 1000;

const STATUS_OPTIONS = {
  staleTime: WATER_STATUS_STALE_MS,
  // A failed status is unknown at once, and mounting a row chip must not
  // ask again: a status flipping back to pending would hide and remount
  // the very rows that asked.
  retry: false,
  retryOnMount: false,
};

/** One section on its own, e.g. the open section's panel. */
export function useWaterStatus(
  waterwayId: number | null,
  sectionId: number | null,
) {
  return useQuery({
    queryKey: waterwayKeys.sectionWaterStatus(waterwayId ?? 0, sectionId ?? 0),
    queryFn: ({ signal }) =>
      waterStatusApi.getForSection(
        waterwayId as number,
        sectionId as number,
        signal,
      ),
    ...STATUS_OPTIONS,
    enabled: waterwayId !== null && sectionId !== null,
  });
}

/** One section's status as a row of a list shows it: asked for together with
 * the other rows, and read from the same cache entry as `useWaterStatus`. */
export function useRowWaterStatus(
  waterwayId: number | null,
  sectionId: number | null,
) {
  return useQuery({
    queryKey: waterwayKeys.sectionWaterStatus(waterwayId ?? 0, sectionId ?? 0),
    queryFn: () => waterStatusApi.getBatched(sectionId as number),
    ...STATUS_OPTIONS,
    enabled: waterwayId !== null && sectionId !== null,
  });
}

/** Water status for arbitrary (waterwayId, sectionId) pairs. Cache-shared
 * with useWaterStatus, so per-row chips reuse these results. The sections
 * that need a fetch are asked for together, up to 100 per request. */
export function useSectionWaterStatuses(
  pairs: { waterwayId: number; sectionId: number }[],
) {
  return useQueries({
    queries: pairs.map(({ waterwayId, sectionId }) => ({
      queryKey: waterwayKeys.sectionWaterStatus(waterwayId, sectionId),
      queryFn: () => waterStatusApi.getBatched(sectionId),
      ...STATUS_OPTIONS,
    })),
  });
}

/** Water statuses plus a sectionId -> current level map, for coloring
 * section lines and list chips. `unknown` holds the sections whose request
 * failed or came back without a current level (no gauge, uncalibrated or
 * stale); they have no entry in `levels`, and
 * sections still being asked are in neither. */
export function useSectionLevels(
  pairs: { waterwayId: number; sectionId: number }[],
) {
  const statuses = useSectionWaterStatuses(pairs);
  const { levels, unknown } = useMemo(() => {
    const map: Record<number, WaterLevel> = {};
    const unknownIds = new Set<number>();
    statuses.forEach((q, i) => {
      if (pairs[i] == null) return;
      const { sectionId } = pairs[i];
      const level = q.data ? currentLevel(q.data.ranges) : null;
      if (level) map[sectionId] = level;
      else if (!q.isPending) unknownIds.add(sectionId);
    });
    return { levels: map, unknown: unknownIds };
  }, [statuses, pairs]);
  return { statuses, levels, unknown };
}

/** One dot level per pair, in order, from the same cached statuses the chips
 * use. A section still being asked is unknown until it answers. */
export function useSectionDotLevels(
  pairs: { waterwayId: number; sectionId: number }[],
): DotLevel[] {
  const statuses = useSectionWaterStatuses(pairs);
  return statuses.map((q) => dotLevel(q.data));
}
