import { useMemo } from "react";
import type { SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { haversineKm, parseDifficulty } from "@/lib/geo";

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

		if (minDiff != null || maxDiff != null) {
			const minG = minDiff ?? 1;
			const maxG = maxDiff ?? 10;
			result = result.filter((s) => {
				const ww = s.features?.find((f) => f.feature_type === "whitewater");
				const diff = parseDifficulty(
					(ww?.metadata as Record<string, unknown> | undefined)?.difficulty as
						| string
						| undefined,
				);
				if (diff == null) return true;
				return diff >= minG && diff <= maxG;
			});
		}

		return result;
	}, [sections, areaCircle, minDiff, maxDiff]);
}
