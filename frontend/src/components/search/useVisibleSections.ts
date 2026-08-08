import { useMemo } from "react";
import type { SectionWithFeatures, Waterway } from "@/lib/api";
import { sectionMatches } from "@/lib/sectionMatch";
import type { SearchMode } from "./useWaterwaySearchFilters";

/** Sections are not returned by the search endpoint, so which of them to show
 * is decided here, per river: the ones that match, or - when none of them
 * does - all of them. A river reached through a fuzzy match or through its
 * own name has no matching section, and an empty list would then hide the
 * very sections the user is looking for. */
export function useVisibleSections({
  waterways,
  filteredSections,
  mode,
  searchName,
  waterwayNames,
}: {
  waterways: Waterway[];
  filteredSections?: SectionWithFeatures[];
  mode: SearchMode;
  searchName: string;
  waterwayNames?: Record<number, string>;
}) {
  return useMemo(() => {
    // Sections lag a round trip behind the rivers, so the ones still in hand
    // can belong to the previous search term. Showing those would list, and
    // count, sections of rivers that are no longer a result.
    const resultIds = new Set(waterways.map((w) => w.id));
    const sections = (filteredSections ?? []).filter((s) =>
      resultIds.has(s.waterway_id),
    );
    if (mode === "area" || !searchName) return sections;

    const byWaterway = new Map<number, typeof sections>();
    for (const section of sections) {
      const group = byWaterway.get(section.waterway_id);
      if (group) group.push(section);
      else byWaterway.set(section.waterway_id, [section]);
    }

    const keep = new Set<number>();
    for (const [waterwayId, group] of byWaterway) {
      const matching = group.filter((section) =>
        sectionMatches(section, searchName, waterwayNames?.[waterwayId]),
      );
      for (const section of matching.length > 0 ? matching : group) {
        keep.add(section.id);
      }
    }
    return sections.filter((section) => keep.has(section.id));
  }, [mode, filteredSections, searchName, waterwayNames, waterways]);
}
