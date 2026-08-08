import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
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

/** Panel header: title row, name/area mode toggle and the filter inputs. */
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
  return (
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
            filters.setMode(v);
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
            <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
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
              <DifficultySelect
                minDiff={minDiff}
                maxDiff={maxDiff}
                onMinChange={filters.setMinDiff}
                onMaxChange={filters.setMaxDiff}
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
              onMinChange={filters.setMinDiff}
              onMaxChange={filters.setMaxDiff}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
