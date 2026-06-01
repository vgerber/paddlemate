import ListIcon from "@mui/icons-material/List";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import SearchIcon from "@mui/icons-material/Search";
import WaterIcon from "@mui/icons-material/Water";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { FavoriteSection, SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { useWaterways } from "@/lib/hooks/useWaterways";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import AreaControls from "./AreaControls";
import DifficultySelect from "./DifficultySelect";
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
}: WaterwaySearchPanelProps) {
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
          : debouncedName ||
              debouncedCountry ||
              minDiff !== "" ||
              maxDiff !== ""
            ? {
                name: debouncedName || undefined,
                country: debouncedCountry || undefined,
                min_difficulty: minDiff !== "" ? minDiff : undefined,
                max_difficulty: maxDiff !== "" ? maxDiff : undefined,
              }
            : null, // no criteria - don't fetch all
    [mode, areaCircle, debouncedName, debouncedCountry, minDiff, maxDiff],
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

  // When searching by name, only show rivers whose name matches
  const visibleRivers = useMemo(() => {
    if (mode === "area" || !debouncedName) return waterways;
    const q = debouncedName.toLowerCase();
    return waterways.filter((w) => w.name.toLowerCase().includes(q));
  }, [mode, waterways, debouncedName]);

  // When searching by name, only show sections whose name matches
  const visibleSections = useMemo(() => {
    const sections = filteredSections ?? [];
    if (mode === "area" || !debouncedName) return sections;
    const q = debouncedName.toLowerCase();
    return sections.filter((s) => s.name.toLowerCase().includes(q));
  }, [mode, filteredSections, debouncedName]);

  useEffect(() => {
    onWaterwaysChange?.(waterways.map((w) => w.id));
  }, [waterways, onWaterwaysChange]);

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
    <>
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
              sx={{ color: "text.disabled", ml: "auto" }}
            >
              {total} results
            </Typography>
          )}
        </Box>

        {/* Mode toggle */}
        <ToggleButtonGroup
          value={mode}
          exclusive
          size="small"
          onChange={(_, v) => {
            if (v) setMode(v);
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
          ) : favorites.length > 0 ? (
            <>
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
          />
        ) : (
          <SectionList
            sections={visibleSections}
            selectedSectionId={selectedSectionId}
            waterwayNames={waterwayNames}
            onSectionClick={onSectionClick}
          />
        )}
      </Box>
    </>
  );
}
