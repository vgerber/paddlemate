import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import StarIcon from "@mui/icons-material/Star";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import DockedAction from "@/components/DockedAction";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import UnderlineTabs from "@/components/UnderlineTabs";
import type { FavoriteSection, SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { useSwipeTabs } from "@/lib/hooks/useSwipeTabs";
import { useSectionLevels } from "@/lib/hooks/useWaterStatus";
import { useWaterways } from "@/lib/hooks/useWaterways";
import { readRecentWaterways } from "@/lib/recentWaterways";
import { theme } from "@/lib/theme";
import ListGroupHeader from "./ListGroupHeader";
import type { ListView } from "./ListViewToggle";
import RecentRiverList from "./RecentRiverList";
import type { RegionBrowseProps } from "./RegionBrowse";
import RegionSuggestions, { isListingRegions } from "./RegionSelect";
import RiverList from "./RiverList";
import SearchFiltersHeader, { SearchControls } from "./SearchFiltersHeader";
import SectionList from "./SectionList";
import { usePendingRiverProposals } from "./usePendingRiverProposals";
import { useVisibleSections } from "./useVisibleSections";
import {
  type SearchMode,
  useWaterwaySearchFilters,
} from "./useWaterwaySearchFilters";

const { tokens } = theme;

const MODES: SearchMode[] = ["name", "area", "region"];

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
  /** Not used by the panel any more; kept so callers need not change. */
  onMapModeActivate?: () => void;
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
  const { levels, unknown } = useSectionLevels(levelPairs);
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

  useEffect(() => {
    onWaterwaysChange?.(waterways.map((w) => w.id));
  }, [waterways, onWaterwaysChange]);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  // Area and region searches draw every hit on the map, so pull all pages
  useEffect(() => {
    if (mode !== "name" && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [mode, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Favorites lack the localization arrays of SectionWithFeatures; fill
  // them so the list renders without lying about the type.
  const favoriteSections: SectionWithFeatures[] = useMemo(
    () => favorites.map((f) => ({ ...f, names: [], descriptions: [] })),
    [favorites],
  );

  const listingRegions =
    mode === "region" &&
    (!searchFilters.region || isListingRegions(searchFilters.regionQuery));
  const showResults = hasFilters && !listingRegions;

  // The region list needs room: lift the sheet while one is being typed.
  const typingRegion = isListingRegions(searchFilters.regionQuery);
  const sheetState = sheet?.onState;
  useEffect(() => {
    if (typingRegion) sheetState?.("open");
  }, [typingRegion, sheetState]);

  const resultTabs = [
    {
      value: "sections" as ListView,
      label: `Sections (${sectionsPending ? "…" : visibleSections.length})`,
    },
    // The server total, not the number loaded: paging in more results must
    // not look like the search found more.
    {
      value: "rivers" as ListView,
      label: `Rivers (${total + pendingRivers.length})`,
    },
  ];

  const noInput = !hasFilters && mode === "name";

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
          total={water.length > 0 ? visibleSections.length : total}
          areaCircle={areaCircle}
          areaLocked={areaLocked}
          onAreaCircleChange={onAreaCircleChange}
          onAreaLockedChange={onAreaLockedChange}
          onRadiusPreview={onRadiusPreview}
          listingRegions={listingRegions}
          regionBrowse={regionBrowse}
        />

        {showResults && (
          <Box sx={{ px: 2, flexShrink: 0 }}>
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
          {isLoading && <LoadingBox />}
          {error && (
            <Typography
              color="error"
              variant="body2"
              sx={{ px: { xs: 1, md: 2 }, py: 1 }}
            >
              Failed to load rivers.
            </Typography>
          )}
          {listingRegions && (
            <Box sx={{ px: { xs: 1, md: 2 }, pt: 1 }}>
              <RegionSuggestions
                query={searchFilters.regionQuery}
                onPick={(picked) => {
                  searchFilters.setRegion(picked);
                  searchFilters.setRegionQuery("");
                  sheet?.onState("peek");
                }}
              />
            </Box>
          )}
          {noInput &&
            (favorites.length > 0 || recentRivers.length > 0 ? (
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
                icon={<SearchOutlinedIcon />}
                title="Type a name, country or difficulty to search"
                py={4}
              />
            ))}
          {showResults && listView === "rivers" && (
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
          {showResults && listView === "sections" && unknownShown > 0 && (
            <Typography
              role="status"
              variant="caption"
              color="textSecondary"
              sx={{ display: "block", px: { xs: 1, md: 2 }, pt: 1 }}
            >
              {unknownShown === 1
                ? "Water level unknown for 1 section."
                : `Water level unknown for ${unknownShown} sections.`}
            </Typography>
          )}
          {showResults && listView === "sections" && (
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
