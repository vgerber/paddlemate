import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { waterStatusApi } from "@/lib/api";
import { type DotLevel, dotLevel } from "@/lib/levelDots";
import { createLimiter } from "@/lib/limiter";
import { maxLevel, type WaterLevel } from "@/lib/waterLevel";
import { waterwayKeys } from "./useWaterways";

/** Matches the gauge reader poll interval. */
const WATER_STATUS_STALE_MS = 5 * 60 * 1000;

/** There is one request per section and no batch endpoint, so a long result
 * list would fire dozens at once. Everything that asks for a status shares
 * this queue. */
const MAX_IN_FLIGHT = 6;
const limited = createLimiter(MAX_IN_FLIGHT);

function statusQuery(waterwayId: number, sectionId: number) {
  return {
    queryKey: waterwayKeys.sectionWaterStatus(waterwayId, sectionId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      limited(
        () => waterStatusApi.getForSection(waterwayId, sectionId, signal),
        signal,
      ),
    staleTime: WATER_STATUS_STALE_MS,
    // A failed status is unknown at once, and mounting a row chip must not
    // ask again: a status flipping back to pending would hide and remount
    // the very rows that asked.
    retry: false,
    retryOnMount: false,
  };
}

export function useWaterStatus(
  waterwayId: number | null,
  sectionId: number | null,
) {
  return useQuery({
    ...statusQuery(waterwayId ?? 0, sectionId ?? 0),
    enabled: waterwayId !== null && sectionId !== null,
  });
}

/** Water status for arbitrary (waterwayId, sectionId) pairs. Cache-shared
 * with useWaterStatus, so per-row chips reuse these results. */
export function useSectionWaterStatuses(
  pairs: { waterwayId: number; sectionId: number }[],
) {
  return useQueries({
    queries: pairs.map(({ waterwayId, sectionId }) =>
      statusQuery(waterwayId, sectionId),
    ),
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
 * section lines and list chips. `unknown` holds the sections whose request
 * failed or came back without a level; they have no entry in `levels`, and
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
      if (q.data?.ranges.length) {
        map[sectionId] = maxLevel(q.data.ranges.map((r) => r.level));
      } else if (!q.isPending) unknownIds.add(sectionId);
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
