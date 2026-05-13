import { useMemo, useState } from "react";
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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import { useWaterways } from "@/lib/hooks/useWaterways";

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
}

export default function WaterwaySearchPanel({
  onSelect,
}: WaterwaySearchPanelProps) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [minDiff, setMinDiff] = useState<number | "">("");
  const [maxDiff, setMaxDiff] = useState<number | "">("");

  const [debouncedName, setDebouncedName] = useState("");
  const [debouncedCountry, setDebouncedCountry] = useState("");
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

  const waterways = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;

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
        <List dense disablePadding>
          {waterways.map((waterway) => (
            <ListItemButton
              key={waterway.id}
              onClick={() => onSelect(waterway.id)}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemText
                primary={waterway.name}
                slotProps={{ primary: { variant: "body2", fontWeight: 600 } }}
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
      </Box>
    </>
  );
}
