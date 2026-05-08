import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import RiverIcon from "@mui/icons-material/Water";
import { useWaterways } from "@/lib/hooks/useWaterways";

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

  // Debounce name + country to avoid hammering the API on every keystroke
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
    <Box
      sx={{
        maxWidth: 720,
        mx: "auto",
        px: 3,
        py: 4,
        minHeight: "calc(100vh - 48px)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
        <RiverIcon sx={{ color: "primary.main" }} />
        <Typography
          variant="subtitle1"
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

      {/* Filters */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 3 }}>
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
            inputProps={{ maxLength: 2, style: { textTransform: "uppercase" } }}
            sx={{ width: 100 }}
          />
          <FormControl size="small" sx={{ minWidth: 110 }}>
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
          <FormControl size="small" sx={{ minWidth: 110 }}>
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

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {error && (
        <Typography color="error" variant="body2">
          Failed to load rivers.
        </Typography>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {waterways.map((waterway) => (
          <Card key={waterway.id} sx={{ textDecoration: "none" }}>
            <Link
              to="/waterways/$waterwayId"
              params={{ waterwayId: String(waterway.id) }}
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "block",
              }}
            >
              <CardActionArea>
                <CardContent
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 2,
                    py: 2,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontFamily: '"Space Grotesk", sans-serif',
                        fontWeight: 700,
                        fontSize: "1rem",
                        mb: 0.25,
                      }}
                    >
                      {waterway.name}
                    </Typography>
                    {(waterway.region || waterway.country) && (
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {[waterway.region, waterway.country]
                          .filter(Boolean)
                          .join(", ")}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    label={waterway.waterway_type.toUpperCase()}
                    color="primary"
                    size="small"
                    variant="outlined"
                    sx={{ flexShrink: 0 }}
                  />
                </CardContent>
              </CardActionArea>
            </Link>
          </Card>
        ))}

        {!isLoading && waterways.length === 0 && (
          <Typography
            color="text.secondary"
            variant="body2"
            sx={{ textAlign: "center", py: 6 }}
          >
            No rivers found.
          </Typography>
        )}

        {hasNextPage && (
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outlined"
            sx={{ mt: 1, alignSelf: "center" }}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        )}
      </Box>
    </Box>
  );
}
