import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import DockedAction from "@/components/DockedAction";
import { SwipeGhost } from "@/components/SwipeGhost";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import UnderlineTabs from "@/components/UnderlineTabs";
import type { FavoriteSection, SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { useSwipeTabs } from "@/lib/hooks/useSwipeTabs";
import { useSectionLevels } from "@/lib/hooks/useWaterStatus";
import { useWaterways } from "@/lib/hooks/useWaterways";
import { SearchIcon, StarIcon } from "@/lib/icons";
import { readRecentWaterways } from "@/lib/recentWaterways";
import { theme } from "@/lib/theme";
import ListGroupHeader from "./ListGroupHeader";
import RecentRiverList from "./RecentRiverList";
import type { RegionBrowseProps } from "./RegionBrowse";
import RegionSuggestions, { isListingRegions } from "./RegionSelect";
import RiverList from "./RiverList";
import SearchControls from "./SearchControls";
import SearchFiltersHeader from "./SearchFiltersHeader";
import SectionList from "./SectionList";
import { usePendingRiverProposals } from "./usePendingRiverProposals";
import { useVisibleSections } from "./useVisibleSections";
import type { ListView } from "./useWaterwaySearchFilters";
import {
  type SearchMode,
  useWaterwaySearchFilters,
} from "./useWaterwaySearchFilters";

const { tokens } = theme;

/** "Rivers (3)"; a zero count is dropped rather than shown. */
function countedLabel(label: string, count: number | string): string {
  return count === 0 ? label : `${label} (${count})`;
}

const MODES: SearchMode[] = ["name", "area", "region"];

interface WaterwaySearchPanelProps {
  onSelect: (waterwayId: number) => void;
  onWaterwaysChange?: (ids: number[]) => void;
  /** The sections the list shows, for the map to draw the same ones. */
  onShownSectionsChange?: (sections: SectionWithFeatures[]) => void;
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
  onClose?: () => void;
  onRadiusPreview?: (radiusKm: number) => void;
  onLoadingChange?: (loading: boolean) => void;
  /** Opens the "suggest new river" panel, prefilled with the searched name. */
  onProposeRiver?: (name: string) => void;
  /** The map's regions, for the level chips and "Part of" in region mode. */
  regionBrowse?: RegionBrowseProps;
  /** The panel sits in the phone's peek sheet: no title row, and it asks the
   * sheet to open for the region list and to rest once a region is picked. */
  sheet?: { onState: (state: "peek" | "open") => void };
}

export default function WaterwaySearchPanel({
  onSelect,
  onWaterwaysChange,
  onShownSectionsChange,
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
  onClose,
  onRadiusPreview,
  onLoadingChange,
  onProposeRiver,
  regionBrowse,
  sheet,
}: WaterwaySearchPanelProps) {
  const searchFilters = useWaterwaySearchFilters(areaCircle);
  const { mode, searchName, filters } = searchFilters;
  const swipe = useSwipeTabs({
    index: MODES.indexOf(mode),
    count: MODES.length,
    onIndexChange: (i) => searchFilters.setMode(MODES[i]),
  });
  const [listView, setListView] = useState<ListView>("sections");

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
    refetch,
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

  // Own pending river proposals - shown as disabled "pending approval" entries
  const pendingRivers = usePendingRiverProposals(searchName, mode === "name");

  const allSections = useVisibleSections({
    waterways,
    filteredSections,
    mode,
    searchName,
    waterwayNames,
  });

  // Level class per section, fetched only while Water now is on. The rows
  // read the same cache, so nothing is asked twice.
  const { water } = searchFilters;
  const levelPairs = useMemo(
    () =>
      water.length > 0
        ? allSections.map((s) => ({
            waterwayId: s.waterway_id,
            sectionId: s.id,
          }))
        : [],
    [water, allSections],
  );
  const { statuses, levels, unknown } = useSectionLevels(levelPairs);
  // Only sections known to be at a chosen level are listed. The ones whose
  // level could not be read are left out and counted in a note, so the list
  // never claims a level it cannot show.
  const visibleSections = useMemo(
    () =>
      water.length > 0
        ? allSections.filter((s) => {
            const level = levels[s.id];
            return level != null && water.includes(level);
          })
        : allSections,
    [water, allSections, levels],
  );
  const unknownShown =
    water.length > 0 ? allSections.filter((s) => unknown.has(s.id)).length : 0;

  // With Water now on, a river counts when one of its sections is at a chosen
  // level, so the Rivers tab agrees with the Sections tab.
  const visibleRivers = useMemo(() => {
    if (water.length === 0) return waterways;
    const ids = new Set(visibleSections.map((s) => s.waterway_id));
    return waterways.filter((w) => ids.has(w.id));
  }, [water, waterways, visibleSections]);
  const riverCount =
    water.length > 0 ? visibleRivers.length : total + pendingRivers.length;

  useEffect(() => {
    onWaterwaysChange?.(waterways.map((w) => w.id));
  }, [waterways, onWaterwaysChange]);

  useEffect(() => {
    onShownSectionsChange?.(visibleSections);
  }, [visibleSections, onShownSectionsChange]);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  // Area and region searches draw every hit on the map, so pull all pages
  useEffect(() => {
    if (
      (mode !== "name" || water.length > 0) &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [mode, water, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Favorites lack the localization arrays of SectionWithFeatures; fill
  // them so the list renders without lying about the type.
  const favoriteSections: SectionWithFeatures[] = useMemo(
    () => favorites.map((f) => ({ ...f, names: [], descriptions: [] })),
    [favorites],
  );

  const listingRegions =
    mode === "region" &&
    (!searchFilters.region || isListingRegions(searchFilters.regionQuery));
  // A failed search with nothing in hand shows the note alone: no tabs, no
  // counts, no "nothing found".
  const failed = error != null && waterways.length === 0;
  const showResults = hasFilters && !listingRegions && !failed;

  // The region list needs room: lift the sheet while one is being typed.
  const typingRegion = isListingRegions(searchFilters.regionQuery);
  const sheetState = sheet?.onState;
  useEffect(() => {
    if (typingRegion) sheetState?.("open");
  }, [typingRegion, sheetState]);

  const resultTabs = [
    {
      value: "sections" as ListView,
      label: countedLabel(
        "Sections",
        sectionsPending ? "…" : visibleSections.length,
      ),
    },
    // The server total, not the number loaded: paging in more results must
    // not look like the search found more.
    {
      value: "rivers" as ListView,
      label: countedLabel("Rivers", riverCount),
    },
  ];

  const noInput = !hasFilters && mode === "name";
  // Empty copy is for a finished search only.
  const settled =
    !isLoading && !sectionsPending && !statuses.some((q) => q.isPending);
  const shownCount =
    listView === "rivers" ? visibleRivers.length : visibleSections.length;

  const idle =
    favorites.length > 0 || recentRivers.length > 0 ? (
      <>
        {favorites.length > 0 && (
          <>
            <ListGroupHeader
              icon={<StarIcon sx={{ fontSize: 14 }} />}
              label="Starred sections"
            />
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
          </>
        )}
        <Box
          sx={
            favorites.length > 0 && recentRivers.length > 0
              ? {
                  mt: 1.5,
                  borderTop: "1px solid",
                  borderColor: "divider",
                }
              : undefined
          }
        >
          <RecentRiverList rivers={recentRivers} onSelect={onSelect} />
        </Box>
      </>
    ) : (
      <EmptyState
        icon={<SearchIcon />}
        title="Type a name, country or difficulty to search"
        py={4}
      />
    );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        // In the desktop card the whole panel is one white ground; on a phone
        // the list sits on the overlay's grey ground, header and cards white.
        bgcolor: { md: tokens.surface },
      }}
    >
      <SearchFiltersHeader
        filters={searchFilters}
        swipe={swipe}
        onClose={onClose}
        sheet={sheet != null}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflowX: "clip",
        }}
      >
        <Box
          {...swipe.paneProps}
          data-testid="search-pane"
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <SearchControls
            filters={searchFilters}
            total={listView === "rivers" ? riverCount : visibleSections.length}
            areaCircle={areaCircle}
            areaLocked={areaLocked}
            onAreaCircleChange={onAreaCircleChange}
            onAreaLockedChange={onAreaLockedChange}
            onRadiusPreview={onRadiusPreview}
            listingRegions={listingRegions}
            regionBrowse={regionBrowse}
          />

          {showResults && (
            <Box
              sx={{
                px: { xs: `${tokens.phone.line - 4}px`, md: 2 },
                flexShrink: 0,
              }}
            >
              <UnderlineTabs
                value={listView}
                onChange={setListView}
                items={resultTabs}
              />
            </Box>
          )}

          <Box
            sx={{
              flex: 1,
              overflowY: "auto",
              overscrollBehavior: "contain",
              // A scroller starts its own touch-action boundary: without this
              // a sideways swipe is taken as a pan and the pane never sees it.
              touchAction: "pan-y",
              px: { xs: 1.5, md: 0 },
              pt: 0.5,
              pb: 1,
            }}
          >
            {(isLoading || (showResults && !settled && shownCount === 0)) && (
              <LoadingBox />
            )}
            {failed && !listingRegions && (
              <ErrorState
                error={error}
                fallback="Could not load rivers."
                onRetry={() => refetch()}
                py={4}
              />
            )}
            {listingRegions && (
              <Box sx={{ px: { xs: `${tokens.phone.inner}px`, md: 2 }, pt: 1 }}>
                <RegionSuggestions
                  query={searchFilters.regionQuery}
                  onPick={(picked) => {
                    searchFilters.setRegion(picked);
                    searchFilters.setRegionQuery("");
                    // The results need the room; the map stays one drag away.
                    sheet?.onState("open");
                  }}
                />
              </Box>
            )}
            {noInput && idle}
            {showResults &&
              !isLoading &&
              (settled || shownCount > 0) &&
              listView === "rivers" && (
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
              )}
            {showResults &&
              settled &&
              listView === "sections" &&
              unknownShown > 0 && (
                <Typography
                  role="status"
                  variant="caption"
                  color="textSecondary"
                  sx={{
                    display: "block",
                    px: { xs: `${tokens.phone.inner}px`, md: 2 },
                    pt: 1,
                  }}
                >
                  {unknownShown === 1
                    ? "Water level unknown for 1 section."
                    : `Water level unknown for ${unknownShown} sections.`}
                </Typography>
              )}
            {showResults &&
              (settled || shownCount > 0) &&
              listView === "sections" && (
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
        <SwipeGhost
          swipe={swipe}
          index={MODES.indexOf(mode)}
          count={MODES.length}
          sx={() => ({ display: "flex", flexDirection: "column" })}
        >
          {(i) => (
            <>
              <SearchControls
                filters={{ ...searchFilters, mode: MODES[i] }}
                total={0}
                areaCircle={areaCircle}
                areaLocked={areaLocked}
                listingRegions={false}
                regionBrowse={regionBrowse}
              />
              {MODES[i] === "name" && (
                <Box sx={{ flex: 1, px: { xs: 1.5, md: 0 }, pt: 0.5 }}>
                  {searchName ? <LoadingBox /> : idle}
                </Box>
              )}
            </>
          )}
        </SwipeGhost>
      </Box>

      {/* Entry point for proposing a river; prefills the suggest panel with
          the current search text. Desktop only: a phone has no FAB over the
          results and proposes from the empty-result prompt. */}
      {onProposeRiver && (
        <DockedAction
          label="New river"
          onClick={() => onProposeRiver(mode === "name" ? searchName : "")}
        />
      )}
    </Box>
  );
}
