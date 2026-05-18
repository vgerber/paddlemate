import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import SearchIcon from "@mui/icons-material/Search";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import WaterIcon from "@mui/icons-material/Water";
import ListIcon from "@mui/icons-material/List";
import { useWaterways } from "@/lib/hooks/useWaterways";
import type { SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/components/Map";

const DIFFICULTY_OPTIONS = [
  { label: "Any", value: "" },
  { label: "I", value: 1 },
  { label: "II", value: 2 },
  { label: "III", value: 3 },
  { label: "IV", value: 4 },
  { label: "V", value: 5 },
  { label: "VI", value: 6 },
  { label: "X", value: 10 },
];

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

  const [debouncedName, setDebouncedName] = useState(urlSearch.q ?? "");
  const [debouncedCountry, setDebouncedCountry] = useState(
    urlSearch.country ? urlSearch.country.toUpperCase() : "",
  );
  const [nameTimer, setNameTimer] = useState<ReturnType<typeof setTimeout>>();
  const [countryTimer, setCountryTimer] =
    useState<ReturnType<typeof setTimeout>>();

  const handleNameChange = (value: string) => {
    setName(value);
    clearTimeout(nameTimer);
    setNameTimer(setTimeout(() => setDebouncedName(value), 300));
  };

  const handleCountryChange = (value: string) => {
    setCountry(value);
    clearTimeout(countryTimer);
    setCountryTimer(
      setTimeout(() => setDebouncedCountry(value.toUpperCase()), 300),
    );
  };

  const filters = useMemo(
    () =>
      mode === "area" && areaCircle
        ? {
            lat: areaCircle.lat,
            lon: areaCircle.lon,
            radius_km: areaCircle.radiusKm,
            name: debouncedName || undefined,
            min_difficulty: minDiff !== "" ? minDiff : undefined,
            max_difficulty: maxDiff !== "" ? maxDiff : undefined,
            per_page: 100,
          }
        : {
            name: debouncedName || undefined,
            country: debouncedCountry || undefined,
            min_difficulty: minDiff !== "" ? minDiff : undefined,
            max_difficulty: maxDiff !== "" ? maxDiff : undefined,
          },
    [mode, areaCircle, debouncedName, debouncedCountry, minDiff, maxDiff],
  );

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

  useEffect(() => {
    onWaterwaysChange?.(waterways.map((w) => w.id));
  }, [waterways, onWaterwaysChange]);

  // Sync filter state to URL (replace so back-button isn't polluted)
  useEffect(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        q: debouncedName || undefined,
        country: debouncedCountry || undefined,
        min_diff: minDiff !== "" ? minDiff : undefined,
        max_diff: maxDiff !== "" ? maxDiff : undefined,
        mode: mode === "area" ? ("area" as const) : undefined,
        // Clear circle coords when switching back to name mode
        ...(mode === "name"
          ? { lat: undefined, lon: undefined, radius: undefined }
          : {}),
      }),
      replace: true,
    });
  }, [navigate, debouncedName, debouncedCountry, minDiff, maxDiff, mode]);

  return (
    <>
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
            if (!v) return;
            setMode(v);
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
                placeholder="Search rivers…"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
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
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  label="Country"
                  placeholder="AT"
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  size="small"
                  inputProps={{
                    maxLength: 2,
                    style: { textTransform: "uppercase" },
                  }}
                  sx={{ width: 90 }}
                />
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>Min grade</InputLabel>
                  <Select
                    label="Min grade"
                    value={minDiff}
                    onChange={(e) => setMinDiff(e.target.value as number | "")}
                  >
                    {DIFFICULTY_OPTIONS.map((o) => (
                      <MenuItem key={o.label} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>Max grade</InputLabel>
                  <Select
                    label="Max grade"
                    value={maxDiff}
                    onChange={(e) => setMaxDiff(e.target.value as number | "")}
                  >
                    {DIFFICULTY_OPTIONS.map((o) => (
                      <MenuItem key={o.label} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </>
          ) : (
            <>
              {areaCircle ? (
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ flex: 1 }}
                    >
                      Radius: {areaCircle.radiusKm} km
                    </Typography>
                    <Tooltip title={areaLocked ? "Unlock area" : "Lock area"}>
                      <IconButton
                        size="small"
                        onClick={() => onAreaLockedChange?.(!areaLocked)}
                        color={areaLocked ? "primary" : "default"}
                      >
                        {areaLocked ? (
                          <LockIcon fontSize="small" />
                        ) : (
                          <LockOpenIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Slider
                    value={areaCircle.radiusKm}
                    min={1}
                    max={200}
                    step={1}
                    size="small"
                    onChange={(_, v) =>
                      onAreaCircleChange?.({
                        ...areaCircle,
                        radiusKm: v as number,
                      })
                    }
                    sx={{ mt: 0.5 }}
                  />
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ py: 1 }}
                >
                  Click on the map to set the search center.
                </Typography>
              )}
              <Box sx={{ display: "flex", gap: 1 }}>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>Min grade</InputLabel>
                  <Select
                    label="Min grade"
                    value={minDiff}
                    onChange={(e) => setMinDiff(e.target.value as number | "")}
                  >
                    {DIFFICULTY_OPTIONS.map((o) => (
                      <MenuItem key={o.label} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>Max grade</InputLabel>
                  <Select
                    label="Max grade"
                    value={maxDiff}
                    onChange={(e) => setMaxDiff(e.target.value as number | "")}
                  >
                    {DIFFICULTY_OPTIONS.map((o) => (
                      <MenuItem key={o.label} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </>
          )}
        </Box>
      </Box>

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
            {waterways.length})
          </ToggleButton>
          <ToggleButton value="sections">
            <ListIcon sx={{ fontSize: 14, mr: 0.5 }} /> Sections (
            {filteredSections?.length ?? 0})
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

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
        {listView === "rivers" ? (
          <>
            <List dense disablePadding>
              {waterways.map((waterway) => (
                <ListItemButton
                  key={waterway.id}
                  onClick={() => onSelect(waterway.id)}
                  sx={{ borderRadius: 1, mb: 0.5 }}
                >
                  <ListItemText
                    primary={waterway.name}
                    slotProps={{
                      primary: { variant: "body2", fontWeight: 600 },
                    }}
                  />
                  <Chip
                    label={waterway.waterway_type.toUpperCase()}
                    color="primary"
                    size="small"
                    variant="outlined"
                    sx={{ flexShrink: 0, fontSize: "0.65rem" }}
                  />
                </ListItemButton>
              ))}
            </List>
            {!isLoading && waterways.length === 0 && (
              <Typography
                color="text.secondary"
                variant="body2"
                sx={{ textAlign: "center", py: 4 }}
              >
                No rivers found.
              </Typography>
            )}
            {hasNextPage && (
              <Button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mt: 1 }}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            )}
          </>
        ) : (
          <>
            <List dense disablePadding>
              {(() => {
                const sections = filteredSections ?? [];
                const grouped: {
                  waterwayId: number;
                  sections: typeof sections;
                }[] = [];
                const seen = new Map<number, typeof sections>();
                for (const s of sections) {
                  const existing = seen.get(s.waterway_id);
                  if (existing) {
                    existing.push(s);
                  } else {
                    const arr = [s];
                    seen.set(s.waterway_id, arr);
                    grouped.push({ waterwayId: s.waterway_id, sections: arr });
                  }
                }
                return grouped.map(({ waterwayId, sections: group }) => (
                  <Box key={waterwayId}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        px: 1,
                        pt: 1.5,
                        pb: 0.5,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: "text.secondary",
                          textTransform: "uppercase",
                          fontSize: "0.65rem",
                          letterSpacing: "0.05em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {waterwayNames?.[waterwayId] ?? `River #${waterwayId}`}
                      </Typography>
                      <Box
                        sx={{
                          flex: 1,
                          height: "1px",
                          bgcolor: "divider",
                        }}
                      />
                    </Box>
                    {group.map((section) => (
                      <ListItemButton
                        key={section.id}
                        selected={section.id === selectedSectionId}
                        onClick={() => onSectionClick?.(section.id)}
                        sx={{ borderRadius: 1, mb: 0.5 }}
                      >
                        <ListItemText
                          primary={section.name}
                          secondary={
                            [section.region, section.country]
                              .filter(Boolean)
                              .join(", ") || undefined
                          }
                          slotProps={{
                            primary: { variant: "body2" },
                            secondary: { variant: "caption" },
                          }}
                        />
                        {(() => {
                          const ww = section.features?.find(
                            (f) => f.feature_type === "whitewater",
                          );
                          const diff = (
                            ww?.metadata as Record<string, unknown> | undefined
                          )?.difficulty as string | undefined;
                          return diff ? (
                            <Chip
                              label={diff}
                              size="small"
                              sx={{ flexShrink: 0 }}
                            />
                          ) : null;
                        })()}
                      </ListItemButton>
                    ))}
                  </Box>
                ));
              })()}
            </List>
            {!isLoading && (filteredSections?.length ?? 0) === 0 && (
              <Typography
                color="text.secondary"
                variant="body2"
                sx={{ textAlign: "center", py: 4 }}
              >
                No sections found.
              </Typography>
            )}
          </>
        )}
      </Box>
    </>
  );
}
