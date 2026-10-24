import { useMemo } from "react";
import { featureDifficulty } from "@/components/waterway/section-details/utils";
import type { SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import {
  distanceKm,
  type LngLat,
  lineCoords,
  parseDifficulty,
} from "@/lib/geo";

interface FilterOptions {
  areaCircle: AreaCircle | null;
  minDiff?: number;
  maxDiff?: number;
}

/** Filter sections by geographic proximity (area circle) and difficulty range. */
export function useFilteredSections(
  sections: SectionWithFeatures[],
  { areaCircle, minDiff, maxDiff }: FilterOptions,
): SectionWithFeatures[] {
  return useMemo(() => {
    let result = sections;

    if (areaCircle) {
      result = result.filter((s) => {
        const coords = lineCoords(s.location);
        if (!coords || coords.length === 0) return false;
        const first = coords[0];
        const last = coords[coords.length - 1];
        const mid = coords[Math.floor(coords.length / 2)];
        const centre: LngLat = [areaCircle.lon, areaCircle.lat];
        return [first, last, mid].some(
          (p) => distanceKm(centre, p) <= areaCircle.radiusKm,
        );
      });
    }

    if (minDiff != null || maxDiff != null) {
      const minG = minDiff ?? 1;
      const maxG = maxDiff ?? 10;
      result = result.filter((s) => {
        const ww = s.features?.find((f) => f.feature_type === "whitewater");
        const diff = parseDifficulty(
          (ww && featureDifficulty(ww)) || undefined,
        );
        if (diff == null) return true;
        return diff >= minG && diff <= maxG;
      });
    }

    return result;
  }, [sections, areaCircle, minDiff, maxDiff]);
}
