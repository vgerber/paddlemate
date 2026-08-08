import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import LoadingBox from "@/components/states/LoadingBox";
import type { FavoriteSection, SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { useWaterways } from "@/lib/hooks/useWaterways";
import { readRecentWaterways } from "@/lib/recentWaterways";
import ListViewToggle, { type ListView } from "./ListViewToggle";
import RecentRiverList from "./RecentRiverList";
import RiverList from "./RiverList";
import SearchFiltersHeader from "./SearchFiltersHeader";
import SectionList from "./SectionList";
import { usePendingRiverProposals } from "./usePendingRiverProposals";
import { useVisibleSections } from "./useVisibleSections";
import { useWaterwaySearchFilters } from "./useWaterwaySearchFilters";

interface WaterwaySearchPanelProps {
  onSelect: (waterwayId: number) => void;
  onWaterwaysChange?: (ids: number[]) => void;
  areaCircle?: AreaCircle | null;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  areaLocked?: boolean;
  onAreaLockedChange?: (locked: boolean) => void;
  filteredSections?: SectionWithFeatures[];
  /** True while the sections of the current results are still being fetched. */
  sectionsPending?: boolean;
  selectedSectionId?: number;
  onSectionClick?: (id: number) => void;
  waterwayNames?: Record<number, string>;
  favorites?: FavoriteSection[];
  favoritedIds?: Set<number>;
  onToggleFavorite?: (id: number) => void;
  onAreaModeActivate?: () => void;
  onClose?: () => void;
  onRadiusPreview?: (radiusKm: number) => void;
  onLoadingChange?: (loading: boolean) => void;
  /** Opens the "suggest new river" panel, prefilled with the searched name. */
  onProposeRiver?: (name: string) => void;
}

export default function WaterwaySearchPanel({
  onSelect,
  onWaterwaysChange,
  areaCircle,
  onAreaCircleChange,
  areaLocked,
  onAreaLockedChange,
  filteredSections,
  sectionsPending = false,
  selectedSectionId,
  onSectionClick,
  waterwayNames,
  favorites = [],
  favoritedIds,
  onToggleFavorite,
  onAreaModeActivate,
  onClose,
  onRadiusPreview,
  onLoadingChange,
  onProposeRiver,
}: WaterwaySearchPanelProps) {
  const searchFilters = useWaterwaySearchFilters(areaCircle);
  const { mode, searchName, filters } = searchFilters;
  const [listView, setListView] = useState<ListView>("rivers");

  // Read once per mount - the panel remounts when returning from a river,
  // which is exactly when the list can have changed
  const [recentRivers] = useState(readRecentWaterways);

  const hasFilters = filters !== null;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useWaterways(filters);

  // Without filters the query is disabled, but keepPreviousData still hands
  // out the last search's pages - clearing the input must clear the results.
  const waterways = useMemo(
    () => (hasFilters ? (data?.pages.flatMap((p) => p.items) ?? []) : []),
    [hasFilters, data],
  );
  const total = hasFilters ? (data?.pages[0]?.total ?? 0) : 0;

  // The server decides what matches: it also searches translations and rapid
  // names, tolerates misspellings, and folds characters the browser cannot.
  // Re-filtering here could only drop rows it deliberately returned.
  const visibleRivers = waterways;

  // Own pending river proposals - shown as disabled "pending approval" entries
  const pendingRivers = usePendingRiverProposals(searchName, mode === "name");

  const visibleSections = useVisibleSections({
    waterways,
    filteredSections,
    mode,
    searchName,
    waterwayNames,
  });

  useEffect(() => {
    onWaterwaysChange?.(waterways.map((w) => w.id));
  }, [waterways, onWaterwaysChange]);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  // In area mode, auto-fetch all pages so the map shows all results
  useEffect(() => {
    if (mode === "area" && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [mode, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Favorites lack the localization arrays of SectionWithFeatures; fill
  // them so the list renders without lying about the type.
  const favoriteSections: SectionWithFeatures[] = useMemo(
    () => favorites.map((f) => ({ ...f, names: [], descriptions: [] })),
    [favorites],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SearchFiltersHeader
        filters={searchFilters}
        total={total}
        isLoading={isLoading}
        onClose={onClose}
        onAreaModeActivate={onAreaModeActivate}
        areaCircle={areaCircle}
        areaLocked={areaLocked}
        onAreaCircleChange={onAreaCircleChange}
        onAreaLockedChange={onAreaLockedChange}
        onRadiusPreview={onRadiusPreview}
      />

      <ListViewToggle
        listView={listView}
        onChange={setListView}
        riverCount={total + pendingRivers.length}
        sectionCount={visibleSections.length}
        sectionsPending={sectionsPending}
      />

      {/* Results list */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 1, pt: 0 }}>
        {isLoading && <LoadingBox />}
        {error && (
          <Typography color="error" variant="body2" sx={{ p: 1 }}>
            Failed to load rivers.
          </Typography>
        )}
        {!hasFilters ? (
          mode === "area" ? (
            <Typography
              variant="body2"
              color="text.disabled"
              sx={{ textAlign: "center", py: 4, fontStyle: "italic" }}
            >
              Click on the map to set the search center.
            </Typography>
          ) : favorites.length > 0 || recentRivers.length > 0 ? (
            <>
              {favorites.length > 0 && (
                <SectionList
                  sections={favoriteSections}
                  selectedSectionId={selectedSectionId}
                  waterwayNames={Object.fromEntries(
                    favorites.map((f) => [f.waterway_id, f.waterway_name]),
                  )}
                  onSectionClick={onSectionClick}
                  favoritedIds={favoritedIds}
                  onToggleFavorite={onToggleFavorite}
                />
              )}
              <RecentRiverList rivers={recentRivers} onSelect={onSelect} />
            </>
          ) : (
            <Typography
              variant="body2"
              color="text.disabled"
              sx={{ textAlign: "center", py: 4, fontStyle: "italic" }}
            >
              Type a name, country or difficulty to search
            </Typography>
          )
        ) : listView === "rivers" ? (
          <RiverList
            waterways={visibleRivers}
            isLoading={isLoading}
            hasNextPage={mode === "name" && (hasNextPage ?? false)}
            isFetchingNextPage={isFetchingNextPage}
            onSelect={onSelect}
            onLoadMore={fetchNextPage}
            pendingRivers={pendingRivers}
            searchName={mode === "name" ? searchName : undefined}
            onProposeRiver={
              onProposeRiver && mode === "name" && searchName
                ? () => onProposeRiver(searchName)
                : undefined
            }
          />
        ) : (
          <SectionList
            sections={visibleSections}
            selectedSectionId={selectedSectionId}
            waterwayNames={waterwayNames}
            onSectionClick={onSectionClick}
            searchName={mode === "name" ? searchName : undefined}
          />
        )}
      </Box>
    </Box>
  );
}
