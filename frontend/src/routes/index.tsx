import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import RiverIcon from "@mui/icons-material/Water";
import WaterwayMap from "@/components/Map";
import { useWaterway, useWaterways } from "@/lib/hooks/useWaterways";

export const Route = createFileRoute("/")({
  component: Home,
});

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

function Home() {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [minDiff, setMinDiff] = useState<number | "">("");
  const [maxDiff, setMaxDiff] = useState<number | "">("");

  const [debouncedName, setDebouncedName] = useState("");
  const [debouncedCountry, setDebouncedCountry] = useState("");
  const [nameTimer, setNameTimer] = useState<ReturnType<typeof setTimeout>>();
  const [countryTimer, setCountryTimer] =
    useState<ReturnType<typeof setTimeout>>();

  const [selectedWaterwayId, setSelectedWaterwayId] = useState<number | null>(
    null,
  );
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(
    null,
  );

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
    () => ({
      name: debouncedName || undefined,
      country: debouncedCountry || undefined,
      min_difficulty: minDiff !== "" ? minDiff : undefined,
      max_difficulty: maxDiff !== "" ? maxDiff : undefined,
    }),
    [debouncedName, debouncedCountry, minDiff, maxDiff],
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useWaterways(filters);

  const { data: selectedWaterway, isLoading: isLoadingDetail } =
    useWaterway(selectedWaterwayId);

  const waterways = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  const sections = useMemo(
    () => selectedWaterway?.sections ?? [],
    [selectedWaterway],
  );

  const total = data?.pages[0]?.total ?? 0;

  const handleWaterwayClick = (id: number) => {
    if (selectedWaterwayId === id) {
      setSelectedWaterwayId(null);
      setSelectedSectionId(null);
    } else {
      setSelectedWaterwayId(id);
      setSelectedSectionId(null);
    }
  };

  const handleSectionClick = (id: number) => {
    setSelectedSectionId(id === selectedSectionId ? null : id);
  };

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 48px)" }}>
      <Box
        sx={{
          width: 360,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
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
            <RiverIcon sx={{ color: "primary.main", fontSize: 18 }} />
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

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
          </Box>
        </Box>

        <Box sx={{ flex: 1, overflowY: "auto", p: 1 }}>
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

          {waterways.map((waterway) => {
            const isSelected = waterway.id === selectedWaterwayId;
            return (
              <Box key={waterway.id} sx={{ mb: 0.5 }}>
                <Card
                  sx={{
                    outline: isSelected ? "2px solid" : "none",
                    outlineColor: "primary.main",
                  }}
                >
                  <CardActionArea
                    onClick={() => handleWaterwayClick(waterway.id)}
                  >
                    <CardContent sx={{ py: 1.5, px: 2 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 1.5,
                        }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body1"
                            sx={{ fontWeight: 700, lineHeight: 1.3 }}
                            noWrap
                          >
                            {waterway.name}
                          </Typography>
                        </Box>
                        <Chip
                          label={waterway.waterway_type.toUpperCase()}
                          color="primary"
                          size="small"
                          variant="outlined"
                          sx={{ flexShrink: 0, fontSize: "0.65rem" }}
                        />
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>

                <Collapse in={isSelected}>
                  {isLoadingDetail ? (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        py: 1,
                      }}
                    >
                      <CircularProgress size={18} />
                    </Box>
                  ) : (
                    <List dense disablePadding sx={{ pl: 1 }}>
                      {sections.map((section) => (
                        <ListItemButton
                          key={section.id}
                          selected={section.id === selectedSectionId}
                          onClick={() => handleSectionClick(section.id)}
                          sx={{ borderRadius: 1, py: 0.5 }}
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
                        </ListItemButton>
                      ))}
                    </List>
                  )}
                </Collapse>
              </Box>
            );
          })}

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
        </Box>
      </Box>

      <Box sx={{ flex: 1 }}>
        <WaterwayMap
          sections={sections}
          selectedSectionId={selectedSectionId}
          onSectionClick={handleSectionClick}
        />
      </Box>
    </Box>
  );
}
