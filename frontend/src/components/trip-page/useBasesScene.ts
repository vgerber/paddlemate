import { useMemo } from "react";
import type { RangeRing } from "@/components/map/Map";
import type { SectionWithFeatures } from "@/lib/api";
import { lineCoords, pointCoords } from "@/lib/geo";
import { useTripCandidates, useTripStays } from "@/lib/hooks/useTrips";
import { useWaterwaySections } from "@/lib/hooks/useWaterwaySections";
import { theme } from "@/lib/theme";
import {
  type BaseRange,
  baseColors,
  baseNumbers,
  baseRanges,
  rangeBounds,
} from "@/lib/tripRange";

type Bounds = [[number, number], [number, number]];

export interface BasesScene {
  ranges: BaseRange[];
  /** Real bases first, then the candidates as hollow proposed rings. */
  rings: RangeRing[];
  /** Only the sections the trip watches. */
  watched: SectionWithFeatures[];
  /** The rings and the watched sections together; null while nothing is
   * placed. */
  bounds: Bounds | null;
  /** Nothing to draw: no base placed and no candidate pointed at. */
  isEmpty: boolean;
}

function extend(box: Bounds | null, lon: number, lat: number): Bounds {
  return box
    ? [
        [Math.min(box[0][0], lon), Math.min(box[0][1], lat)],
        [Math.max(box[1][0], lon), Math.max(box[1][1], lat)],
      ]
    : [
        [lon, lat],
        [lon, lat],
      ];
}

/** What a trip's bases put on a map: the rings, the sections on the watch
 * lists and the box that frames them. The phone's `BasesMap` and the wide
 * canvas draw the same thing from this. */
export function useBasesScene(
  tripId: number | null,
  isMember: boolean,
): BasesScene {
  const { data: staysData } = useTripStays(tripId);
  const { data: candidates } = useTripCandidates(tripId, isMember);
  const stays = useMemo(() => staysData ?? [], [staysData]);

  const ranges = useMemo(() => baseRanges(stays), [stays]);
  const colors = useMemo(() => baseColors(stays), [stays]);
  const numbers = useMemo(() => baseNumbers(stays), [stays]);

  const waterwayIds = useMemo(
    () => [
      ...new Set(
        stays
          .flatMap((s) => s.sections)
          .map((s) => s.waterway_id)
          .filter((id): id is number => id != null),
      ),
    ],
    [stays],
  );
  const { sections: allSections } = useWaterwaySections(
    waterwayIds,
    waterwayIds.length > 0,
  );

  // Fetching a waterway brings all of its sections; the map is about the ones
  // the trip watches, and drawing the rest would frame the wrong ground.
  const watched = useMemo(() => {
    const ids = new Set(
      stays.flatMap((s) => s.sections.map((x) => x.section_id)),
    );
    return allSections.filter((s) => ids.has(s.id));
  }, [allSections, stays]);

  const rings = useMemo<RangeRing[]>(() => {
    const real = ranges.map((r) => ({
      id: String(r.stayId),
      lat: r.lat,
      lon: r.lon,
      radiusKm: r.radiusKm,
      label: r.name,
      color: colors[r.stayId],
      number: numbers[r.stayId],
    }));
    const proposed = (candidates ?? []).flatMap((c): RangeRing[] => {
      const point = pointCoords(c.location);
      if (!point) return [];
      return [
        {
          id: `candidate-${c.id}`,
          lat: point[1],
          lon: point[0],
          // A candidate has no watch list of its own, so there is no reach
          // to draw - only where somebody is pointing.
          radiusKm: 0,
          label: c.name,
          color: theme.tokens.onSurfaceVariant,
          number: 0,
          proposed: true,
        },
      ];
    });
    return [...real, ...proposed];
  }, [ranges, colors, numbers, candidates]);

  const bounds = useMemo(() => {
    let box = rangeBounds(ranges);
    for (const ring of rings) {
      if (ring.proposed) box = extend(box, ring.lon, ring.lat);
    }
    for (const section of watched) {
      for (const [lon, lat] of lineCoords(section.location) ?? []) {
        box = extend(box, lon, lat);
      }
    }
    return box;
  }, [ranges, rings, watched]);

  return { ranges, rings, watched, bounds, isEmpty: rings.length === 0 };
}
