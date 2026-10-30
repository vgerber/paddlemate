import { useMemo } from "react";
import { featureDifficulty } from "@/components/waterway/section-details/utils";
import type { SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { type LngLat, parseDifficulty, sectionDistanceKm } from "@/lib/geo";

interface FilterOptions {
  areaCircle: AreaCircle | null;
  minDiff?: number;
  maxDiff?: number;
}

/** Filter sections by geographic proximity (area circle, nearest first) and difficulty range. */
export function useFilteredSections(
  sections: SectionWithFeatures[],
  { areaCircle, minDiff, maxDiff }: FilterOptions,
): SectionWithFeatures[] {
  return useMemo(() => {
    let result = sections;

    if (areaCircle) {
      const centre: LngLat = [areaCircle.lon, areaCircle.lat];
      // Nearest first; the sort is stable, so equal distances keep their order.
      result = result
        .map((s) => ({ s, km: sectionDistanceKm(s.location, centre) }))
        .filter(({ km }) => km <= areaCircle.radiusKm)
        .sort((a, b) => a.km - b.km)
        .map(({ s }) => s);
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
