import FilterListIcon from "@mui/icons-material/FilterList";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import SearchIcon from "@mui/icons-material/Search";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { AreaCircle } from "@/lib/geo";
import AreaControls from "./AreaControls";
import DifficultySelect from "./DifficultySelect";
import type { WaterwaySearchFilters } from "./useWaterwaySearchFilters";

interface SearchFiltersHeaderProps {
  filters: WaterwaySearchFilters;
  total: number;
  isLoading: boolean;
  onClose?: () => void;
  onAreaModeActivate?: () => void;
  areaCircle?: AreaCircle | null;
  areaLocked?: boolean;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  onAreaLockedChange?: (locked: boolean) => void;
  onRadiusPreview?: (radiusKm: number) => void;
}

/** Panel header: title row, name/area mode toggle and the search input.
 * Optional filters (country, difficulty) stay collapsed behind the filter
 * button; a badge dot marks active filters while they are hidden. */
export default function SearchFiltersHeader({
  filters,
  total,
  isLoading,
  onClose,
  onAreaModeActivate,
  areaCircle,
  areaLocked,
  onAreaCircleChange,
  onAreaLockedChange,
  onRadiusPreview,
}: SearchFiltersHeaderProps) {
  const { mode, name, country, minDiff, maxDiff } = filters;
  const hasActiveFilters =
    country.trim() !== "" || minDiff !== "" || maxDiff !== "";
  // Open on mount when a filter is already set (e.g. seeded from the URL),
  // so active filters are never invisible-but-effective on first paint.
  const [filtersOpen, setFiltersOpen] = useState(hasActiveFilters);

  return (
    <Box
      sx={{
        px: 2,
        pt: 1.5,
        pb: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
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
        <IconButton
          size="small"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
          title={filtersOpen ? "Hide filters" : "Show filters"}
          sx={{ ml: isLoading ? "auto" : 0 }}
        >
          <Badge
            color="primary"
            variant="dot"
            invisible={!hasActiveFilters || filtersOpen}
          >
            <FilterListIcon fontSize="small" />
          </Badge>
        </IconButton>
        {onClose && (
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ display: { xs: "flex", md: "none" } }}
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
            filters.setMode(v);
            if (v === "area") onAreaModeActivate?.();
          }
        }}
        sx={{
          mb: 1,
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

      {mode === "name" ? (
        <TextField
          fullWidth
          placeholder="Search rivers or sections…"
          value={name}
          onChange={(e) => filters.setName(e.target.value)}
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
      ) : (
        <AreaControls
          areaCircle={areaCircle ?? null}
          locked={areaLocked ?? false}
          onLockedChange={(v) => onAreaLockedChange?.(v)}
          onRadiusChange={(r) =>
            areaCircle && onAreaCircleChange?.({ ...areaCircle, radiusKm: r })
          }
          onRadiusPreview={onRadiusPreview}
        />
      )}

      <Collapse in={filtersOpen}>
        <Box sx={{ display: "flex", gap: 1, pt: 1 }}>
          {mode === "name" && (
            <TextField
              label="Country"
              placeholder="AT"
              value={country}
              onChange={(e) => filters.setCountry(e.target.value)}
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
          )}
          <DifficultySelect
            minDiff={minDiff}
            maxDiff={maxDiff}
            onMinChange={filters.setMinDiff}
            onMaxChange={filters.setMaxDiff}
          />
        </Box>
      </Collapse>
    </Box>
  );
}
