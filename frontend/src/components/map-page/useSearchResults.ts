import { useCallback, useMemo, useState } from "react";
import type { AreaCircle } from "@/components/map/Map";
import type { SectionWithFeatures } from "@/lib/api";
import { useFilteredSections } from "@/lib/hooks/useFilteredSections";
import { useSectionLevels } from "@/lib/hooks/useWaterStatus";
import { useWaterwaySections } from "@/lib/hooks/useWaterwaySections";

/** The most search results the map asks a water level for. */
const MAX_LEVELLED_RESULTS = 60;

interface SearchResultsInput {
  selectedWaterwayId: number | undefined;
  selectedSectionId: number | undefined;
  /** The circle to filter by; null outside area search. */
  areaCircle: AreaCircle | null;
  minDiff: number | undefined;
  maxDiff: number | undefined;
  /** The open waterway, whose name the result names do not cover. */
  selectedWaterway: { id: number; name: string } | undefined;
}

/** What the search panel found and what the map draws of it. */
export function useSearchResults({
  selectedWaterwayId,
  selectedSectionId,
  areaCircle,
  minDiff,
  maxDiff,
  selectedWaterway,
}: SearchResultsInput) {
  const [searchWaterwayIds, setSearchWaterwayIds] = useState<number[]>([]);
  const [isSearchPanelLoading, setIsSearchPanelLoading] = useState(false);
  // The sections the search panel lists, after its own matching (name scope,
  // Water now). Null until a panel reports; the map then draws all results.
  const [shownSearchSections, setShownRaw] = useState<
    SectionWithFeatures[] | null
  >(null);
  // Same sections, same state: the panel recomputes its list on many renders.
  const setShownSearchSections = useCallback(
    (next: SectionWithFeatures[]) =>
      setShownRaw((prev) =>
        prev &&
        prev.length === next.length &&
        prev.every((s, i) => s === next[i])
          ? prev
          : next,
      ),
    [],
  );

  const results = useWaterwaySections(
    searchWaterwayIds,
    selectedWaterwayId == null,
  );
  const filteredSearchSections = useFilteredSections(results.sections, {
    areaCircle,
    minDiff,
    maxDiff,
  });

  // What the map draws of the search: the panel's list, plus the open section.
  const mapSearchSections = useMemo(() => {
    if (!shownSearchSections) return filteredSearchSections;
    const open = filteredSearchSections.find((s) => s.id === selectedSectionId);
    return open && !shownSearchSections.includes(open)
      ? [...shownSearchSections, open]
      : shownSearchSections;
  }, [shownSearchSections, filteredSearchSections, selectedSectionId]);

  const levelPairs = useMemo(
    () =>
      selectedWaterwayId == null
        ? mapSearchSections.slice(0, MAX_LEVELLED_RESULTS).map((s) => ({
            waterwayId: s.waterway_id,
            sectionId: s.id,
          }))
        : [],
    [selectedWaterwayId, mapSearchSections],
  );
  const { levels: searchSectionLevels } = useSectionLevels(levelPairs);

  const waterwayNames = useMemo(() => {
    const map: Record<number, string> = { ...results.names };
    if (selectedWaterway) map[selectedWaterway.id] = selectedWaterway.name;
    return map;
  }, [results.names, selectedWaterway]);

  return {
    searchWaterwayIds,
    setSearchWaterwayIds,
    shownSearchSections,
    setShownSearchSections,
    isSearchPanelLoading,
    setIsSearchPanelLoading,
    waterwayNames,
    filteredSearchSections,
    mapSearchSections,
    isAreaSearchLoading: isSearchPanelLoading || results.isFetching,
    areSearchSectionsPending: results.arePending,
    searchSectionLevels,
  };
}
