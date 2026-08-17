import type { SectionWaterSnapshot, SectionWithFeatures } from "@/lib/api";

/** One snapshot per gauge series - older descents stored one per feature
 * range, which would repeat the same reading. */
export function uniqueSnapshotsBySeries(
  snaps: SectionWaterSnapshot[],
): SectionWaterSnapshot[] {
  return snaps.filter(
    (s, i) => snaps.findIndex((x) => x.series_id === s.series_id) === i,
  );
}

/** Display-only SectionWithFeatures for map rendering when only id, name and
 * geometry are known (descent routes, wizard drafts). */
export function toPseudoSection(input: {
  id: number;
  name: string;
  location: SectionWithFeatures["location"];
}): SectionWithFeatures {
  return {
    id: input.id,
    name: input.name,
    waterway_id: 0,
    description: null,
    regions: [],
    location: input.location,
    features: [],
    names: [],
    descriptions: [],
    created_at: "",
    updated_at: "",
  } as SectionWithFeatures;
}
