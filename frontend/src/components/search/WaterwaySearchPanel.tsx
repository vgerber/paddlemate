import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ListIcon from "@mui/icons-material/List";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import SearchIcon from "@mui/icons-material/Search";
import WaterIcon from "@mui/icons-material/Water";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { FavoriteSection, SectionWithFeatures } from "@/lib/api";
import { proposalsApi } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { proposalKeys } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterways } from "@/lib/hooks/useWaterways";
import { readRecentWaterways } from "@/lib/recentWaterways";
import { sectionMatches } from "@/lib/sectionMatch";
import { searchKey } from "@/lib/text";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import AreaControls from "./AreaControls";
import DifficultySelect from "./DifficultySelect";
import RecentRiverList from "./RecentRiverList";
import RiverList from "./RiverList";
import SectionList from "./SectionList";

interface WaterwaySearchPanelProps {
  onSelect: (waterwayId: number) => void;
  onWaterwaysChange?: (ids: number[]) => void;
  areaCircle?: AreaCircle | null;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  areaLocked?: boolean;
  onAreaLockedChange?: (locked: boolean) => void;
  filteredSections?: SectionWithFeatures[];
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

type SearchMode = "name" | "area";
type ListView = "rivers" | "sections";

export default function WaterwaySearchPanel({
  onSelect,
  onWaterwaysChange,
  areaCircle,
  onAreaCircleChange,
  areaLocked,
  onAreaLockedChange,
  filteredSections,
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
  const { isAuthenticated } = useSession();
  const navigate = useNavigate({ from: "/" });
  const urlSearch = useSearch({ strict: false }) as {
    q?: string;
    country?: string;
    min_diff?: number;
    max_diff?: number;
    mode?: "area";
  };

  const [mode, setMode] = useState<SearchMode>(
    urlSearch.mode === "area" ? "area" : "name",
  );
  const [listView, setListView] = useState<ListView>("rivers");
  const [name, setName] = useState(urlSearch.q ?? "");
  const [country, setCountry] = useState(urlSearch.country ?? "");
  const [minDiff, setMinDiff] = useState<number | "">(urlSearch.min_diff ?? "");
  const [maxDiff, setMaxDiff] = useState<number | "">(urlSearch.max_diff ?? "");

  const debouncedName = useDebouncedValue(name);
  const debouncedCountry = useDebouncedValue(country.toUpperCase());
  // A single character matches half the database and fires the full
  // details/water-status fan-out for results nobody wants; wait for 2 chars.
  const searchName = debouncedName.trim().length >= 2 ? debouncedName : "";

  // Read once per mount - the panel remounts when returning from a river,
  // which is exactly when the list can have changed
  const [recentRivers] = useState(readRecentWaterways);

  const filters = useMemo(
    () =>
      mode === "area" && areaCircle
        ? {
            lat: areaCircle.lat,
            lon: areaCircle.lon,
            radius_km: areaCircle.radiusKm,
            min_difficulty: minDiff !== "" ? minDiff : undefined,
            max_difficulty: maxDiff !== "" ? maxDiff : undefined,
            per_page: 100,
          }
        : mode === "area"
          ? null // no circle drawn yet - don't fetch
          : searchName || debouncedCountry || minDiff !== "" || maxDiff !== ""
            ? {
                name: searchName || undefined,
                country: debouncedCountry || undefined,
                min_difficulty: minDiff !== "" ? minDiff : undefined,
                max_difficulty: maxDiff !== "" ? maxDiff : undefined,
              }
            : null, // no criteria - don't fetch all
    [mode, areaCircle, searchName, debouncedCountry, minDiff, maxDiff],
  );

  const hasFilters = filters !== null;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useWaterways(filters);

  const waterways = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;

  // The server decides what matches: it also searches translations and rapid
  // names, tolerates misspellings, and folds characters the browser cannot.
  // Re-filtering here could only drop rows it deliberately returned.
  const visibleRivers = waterways;

  // Own pending river proposals - shown as disabled "pending approval" entries
  const pendingFilters = {
    entity_type: "waterway",
    status: "pending",
    operation: "create",
  } as const;
  const { data: pendingWaterwayProposals = [] } = useQuery({
    queryKey: proposalKeys.list(pendingFilters),
    queryFn: () => proposalsApi.list(pendingFilters),
    enabled: isAuthenticated && mode === "name" && !!searchName,
  });
  const pendingRivers = useMemo(() => {
    if (mode === "area" || !searchName) return [];
    const q = searchKey(searchName);
    return pendingWaterwayProposals
      .map((p) => ({
        id: p.id,
        name: (p.proposed_data as { name?: string }).name ?? "?",
      }))
      .filter((p) => searchKey(p.name).includes(q));
  }, [mode, searchName, pendingWaterwayProposals]);

  // Sections are not returned by the search endpoint, so which of them to show
  // is decided here, per river: the ones that match, or - when none of them
  // does - all of them. A river reached through a fuzzy match or through its
  // own name has no matching section, and an empty list would then hide the
  // very sections the user is looking for.
  const visibleSections = useMemo(() => {
    const sections = filteredSections ?? [];
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
  }, [mode, filteredSections, searchName, waterwayNames]);

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

  // Sync filter state to URL
  useEffect(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        q: debouncedName || undefined,
        country: debouncedCountry || undefined,
        min_diff: minDiff !== "" ? minDiff : undefined,
        max_diff: maxDiff !== "" ? maxDiff : undefined,
        mode: mode === "area" ? ("area" as const) : undefined,
        ...(mode === "name"
          ? { lat: undefined, lon: undefined, radius: undefined }
          : {}),
      }),
      replace: true,
    });
  }, [navigate, debouncedName, debouncedCountry, minDiff, maxDiff, mode]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Filters header */}
      <Box
        sx={{
          px: 2,
          pt: 2,
          pb: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <Typography
            variant="subtitle2"
            sx={{ color: "text.secondary", letterSpacing: "0.12em" }}
          >
            RIVERS
          </Typography>
          {!isLoading && (
            <Typography
              variant="caption"
              sx={{
                color: "text.disabled",
                ml: "auto",
                display: { xs: "none", md: "block" },
              }}
            >
              {total} results
            </Typography>
          )}
          {onClose && (
            <IconButton
              size="small"
              onClick={onClose}
              sx={{ ml: "auto", display: { xs: "flex", md: "none" } }}
              aria-label="Close search panel"
            >
              <KeyboardArrowDownIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        {/* Mode toggle */}
        <ToggleButtonGroup
          value={mode}
          exclusive
          size="small"
          onChange={(_, v) => {
            if (v) {
              setMode(v);
              if (v === "area") onAreaModeActivate?.();
            }
          }}
          sx={{
            mb: 1.5,
            width: "100%",
            "& .MuiToggleButton-root": {
              flex: 1,
              py: 0.5,
              fontSize: "0.75rem",
            },
          }}
        >
          <ToggleButton value="name">
            <SearchIcon sx={{ fontSize: 14, mr: 0.5 }} /> Name
          </ToggleButton>
          <ToggleButton value="area">
            <RadioButtonUncheckedIcon sx={{ fontSize: 14, mr: 0.5 }} /> Area
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {mode === "name" ? (
            <>
              <TextField
                fullWidth
                placeholder="Search rivers or sections…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                size="small"
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon
                          fontSize="small"
                          sx={{ color: "text.disabled" }}
                        />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                <TextField
                  label="Country"
                  placeholder="AT"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  size="small"
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: {
                      maxLength: 2,
                      style: { textTransform: "uppercase" },
                    },
                  }}
                  sx={{ flex: 1, minWidth: 0 }}
                />
                <DifficultySelect
                  minDiff={minDiff}
                  maxDiff={maxDiff}
                  onMinChange={setMinDiff}
                  onMaxChange={setMaxDiff}
                />
              </Box>
            </>
          ) : (
            <>
              <AreaControls
                areaCircle={areaCircle ?? null}
                locked={areaLocked ?? false}
                onLockedChange={(v) => onAreaLockedChange?.(v)}
                onRadiusChange={(r) =>
                  areaCircle &&
                  onAreaCircleChange?.({ ...areaCircle, radiusKm: r })
                }
                onRadiusPreview={onRadiusPreview}
              />
              <DifficultySelect
                minDiff={minDiff}
                maxDiff={maxDiff}
                onMinChange={setMinDiff}
                onMaxChange={setMaxDiff}
              />
            </>
          )}
        </Box>
      </Box>

      {/* List view toggle */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          pt: 1,
          pb: 1,
          gap: 0.5,
        }}
      >
        <ToggleButtonGroup
          value={listView}
          exclusive
          size="small"
          onChange={(_, v) => {
            if (v) setListView(v);
          }}
          sx={{
            width: "100%",
            "& .MuiToggleButton-root": {
              flex: 1,
              py: 0.25,
              px: 1,
              fontSize: "0.7rem",
            },
          }}
        >
          <ToggleButton value="rivers">
            <WaterIcon sx={{ fontSize: 14, mr: 0.5 }} /> Rivers (
            {visibleRivers.length})
          </ToggleButton>
          <ToggleButton value="sections">
            <ListIcon sx={{ fontSize: 14, mr: 0.5 }} /> Sections (
            {visibleSections.length})
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Results list */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 1, pt: 0 }}>
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}
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
                  sections={favorites as unknown as SectionWithFeatures[]}
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
