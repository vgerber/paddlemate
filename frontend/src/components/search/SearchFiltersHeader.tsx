import FilterListIcon from "@mui/icons-material/FilterList";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import SearchIcon from "@mui/icons-material/Search";
import TerrainIcon from "@mui/icons-material/Terrain";
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
import RegionSelect from "./RegionSelect";
import type { WaterwaySearchFilters } from "./useWaterwaySearchFilters";

/** The input the active mode searches with: a name field, the area circle's
 * radius controls, or the region picker. */
function SearchInput({
  filters,
  areaCircle,
  areaLocked,
  onAreaCircleChange,
  onAreaLockedChange,
  onRadiusPreview,
}: {
  filters: WaterwaySearchFilters;
  areaCircle: AreaCircle | null;
  areaLocked: boolean;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  onAreaLockedChange?: (locked: boolean) => void;
  onRadiusPreview?: (radiusKm: number) => void;
}) {
  if (filters.mode === "region") {
    return (
      <RegionSelect region={filters.region} onChange={filters.setRegion} />
    );
  }
  if (filters.mode === "area") {
    return (
      <AreaControls
        areaCircle={areaCircle}
        locked={areaLocked}
        onLockedChange={(v) => onAreaLockedChange?.(v)}
        onRadiusChange={(r) =>
          areaCircle && onAreaCircleChange?.({ ...areaCircle, radiusKm: r })
        }
        onRadiusPreview={onRadiusPreview}
      />
    );
  }
  return (
    <TextField
      fullWidth
      placeholder="Search rivers or sections…"
      value={filters.name}
      onChange={(e) => filters.setName(e.target.value)}
      size="small"
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" sx={{ color: "text.disabled" }} />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

interface SearchFiltersHeaderProps {
  filters: WaterwaySearchFilters;
  total: number;
  isLoading: boolean;
  onClose?: () => void;
  onMapModeActivate?: () => void;
  areaCircle?: AreaCircle | null;
  areaLocked?: boolean;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  onAreaLockedChange?: (locked: boolean) => void;
  onRadiusPreview?: (radiusKm: number) => void;
}

/** Panel header: title row, name/area/region mode toggle and the search
 * input of the active mode.
 * Optional filters (country, difficulty) stay collapsed behind the filter
 * button; a badge dot marks active filters while they are hidden. */
export default function SearchFiltersHeader({
  filters,
  total,
  isLoading,
  onClose,
  onMapModeActivate,
  areaCircle,
  areaLocked,
  onAreaCircleChange,
  onAreaLockedChange,
  onRadiusPreview,
}: SearchFiltersHeaderProps) {
  const { mode, country, minDiff, maxDiff } = filters;
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
        {/* The title takes the slack so the buttons sit at the right edge.
            The count carried that job through an ml:auto, but it is hidden
            on a phone - where the tabs below give the counts - and a hidden
            element pushes nothing. */}
        <Typography
          variant="subtitle2"
          sx={{ color: "text.secondary", letterSpacing: "0.12em", flex: 1 }}
        >
          RIVERS
        </Typography>
        {!isLoading && (
          <Typography
            variant="caption"
            sx={{
              color: "text.disabled",
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
            // Area and region are both picked on the map, so on mobile
            // the panel gets out of the way when either is chosen.
            if (v !== "name") onMapModeActivate?.();
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
        <ToggleButton value="region">
          <TerrainIcon sx={{ fontSize: 14, mr: 0.5 }} /> Region
        </ToggleButton>
      </ToggleButtonGroup>

      <SearchInput
        filters={filters}
        areaCircle={areaCircle ?? null}
        areaLocked={areaLocked ?? false}
        onAreaCircleChange={onAreaCircleChange}
        onAreaLockedChange={onAreaLockedChange}
        onRadiusPreview={onRadiusPreview}
      />

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
