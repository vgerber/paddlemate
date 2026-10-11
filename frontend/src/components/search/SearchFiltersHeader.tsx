import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import ChipRow from "@/components/ChipRow";
import PanelHeader from "@/components/PanelHeader";
import type { AreaCircle } from "@/lib/geo";
import { theme } from "@/lib/theme";
import type { WaterLevel } from "@/lib/waterLevel";
import AreaControls from "./AreaControls";
import DifficultySelect from "./DifficultySelect";
import { gradeSummary } from "./gradeSummary";
import type {
  SearchMode,
  WaterwaySearchFilters,
} from "./useWaterwaySearchFilters";

const { tokens } = theme;

const WATER_LEVELS: { level: WaterLevel; label: string }[] = [
  { level: "low", label: "Low" },
  { level: "medium", label: "Medium" },
  { level: "high", label: "High" },
];

const MODES: { value: SearchMode; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "area", label: "Area" },
  { value: "region", label: "Region" },
];

interface SearchFiltersHeaderProps {
  filters: WaterwaySearchFilters;
  /** Swipe state from `useSwipeTabs`, so the underline follows a drag. */
  swipe: {
    progress: number;
    dragging: boolean;
    gestureProps: React.HTMLAttributes<HTMLElement>;
  };
  onClose?: () => void;
}

/** The panel header: the title and the underlined Name, Area and Region
 * tabs. The mode itself lives in the URL, see `useWaterwaySearchFilters`. */
export default function SearchFiltersHeader({
  filters,
  swipe,
  onClose,
}: SearchFiltersHeaderProps) {
  // The design sets the title at panel-title size, larger than the title
  // PanelHeader draws, so the title row is drawn here and PanelHeader keeps
  // the tab bar.
  return (
    <Box sx={{ flexShrink: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          minHeight: 56,
        }}
      >
        <Typography variant="h3" component="h1" noWrap sx={{ flex: 1 }}>
          Search
        </Typography>
        {onClose && (
          <IconButton
            onClick={onClose}
            aria-label="Map"
            sx={{
              display: { xs: "flex", md: "none" },
              width: tokens.touch.min,
              height: tokens.touch.min,
              mr: -0.75,
              color: tokens.onSurfaceVariant,
            }}
          >
            <MapOutlinedIcon />
          </IconButton>
        )}
      </Box>
      <PanelHeader
        tabs={{
          value: filters.mode,
          onChange: filters.setMode,
          options: MODES,
          progress: swipe.progress,
          dragging: swipe.dragging,
          gesture: swipe.gestureProps,
        }}
      />
    </Box>
  );
}

/** One field, 52px: the name search or the region search. */
function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <TextField
      fullWidth
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{
        input: {
          sx: { height: 52, pr: 0.5 },
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: tokens.onSurfaceVariant }} />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <IconButton
              aria-label="Clear"
              onClick={() => onChange("")}
              sx={{ width: tokens.touch.min, height: tokens.touch.min }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          ) : undefined,
        },
      }}
    />
  );
}

function FilterChip({
  label,
  set,
  onClick,
  onDelete,
  plain = false,
}: {
  label: string;
  set: boolean;
  onClick: () => void;
  onDelete?: () => void;
  /** No chevron: the chip toggles instead of opening something. */
  plain?: boolean;
}) {
  return (
    <Chip
      variant="outlined"
      clickable
      onClick={onClick}
      onDelete={onDelete}
      aria-pressed={plain ? set : undefined}
      color={set ? "primary" : "default"}
      label={
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          {label}
          {!onDelete && !plain && (
            <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
          )}
        </Box>
      }
    />
  );
}

interface FiltersSheetProps {
  open: boolean;
  onClose: () => void;
  filters: WaterwaySearchFilters;
  total: number;
}

function FiltersBody({
  filters,
  total,
  onClose,
}: Omit<FiltersSheetProps, "open">) {
  const { mode, country, minDiff, maxDiff } = filters;
  const hasAny =
    country !== "" ||
    minDiff !== "" ||
    maxDiff !== "" ||
    filters.water.length > 0;
  return (
    <Box sx={{ display: "grid", gap: 2, px: 2, pb: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          Filters
        </Typography>
        <Button
          onClick={() => {
            filters.setMinDiff("");
            filters.setMaxDiff("");
            filters.setCountry("");
            filters.clearWater();
          }}
          disabled={!hasAny}
        >
          Reset
        </Button>
      </Box>
      <DifficultySelect
        minDiff={minDiff}
        maxDiff={maxDiff}
        onMinChange={filters.setMinDiff}
        onMaxChange={filters.setMaxDiff}
      />
      {mode === "name" && (
        <TextField
          label="Country"
          placeholder="AT"
          value={country}
          onChange={(e) => filters.setCountry(e.target.value.toUpperCase())}
          slotProps={{ htmlInput: { maxLength: 2 } }}
        />
      )}
      <Box>
        <Typography
          variant="body2"
          component="span"
          sx={{ display: "block", mb: 0.75, fontWeight: 600 }}
          color="textSecondary"
        >
          Water now
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
          }}
        >
          {WATER_LEVELS.map(({ level, label }) => (
            <FilterChip
              key={level}
              label={label}
              set={filters.water.includes(level)}
              onClick={() => filters.toggleWater(level)}
              plain
            />
          ))}
        </Box>
      </Box>
      <Button
        variant="contained"
        onClick={onClose}
        sx={{ height: 52, borderRadius: `${tokens.radii.md}px` }}
      >
        {total === 1 ? "1 result" : `${total} results`}
      </Button>
    </Box>
  );
}

/** The one Filters sheet: a bottom sheet on a phone, a dialog beside the
 * map on a desktop. */
function FiltersSheet({ open, onClose, filters, total }: FiltersSheetProps) {
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  if (desktop) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { "aria-label": "Filters" } }}
      >
        <Box sx={{ pt: 2 }}>
          <FiltersBody filters={filters} total={total} onClose={onClose} />
        </Box>
      </Dialog>
    );
  }
  return (
    <BottomSheet
      state={open ? "open" : "closed"}
      onStateChange={(s) => s === "open" || onClose()}
      label="Filters"
    >
      <FiltersBody filters={filters} total={total} onClose={onClose} />
    </BottomSheet>
  );
}

interface SearchControlsProps {
  filters: WaterwaySearchFilters;
  total: number;
  areaCircle?: AreaCircle | null;
  areaLocked?: boolean;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  onAreaLockedChange?: (locked: boolean) => void;
  onRadiusPreview?: (radiusKm: number) => void;
  /** Phone only: leave the panel for the map behind it. */
  onShowMap?: () => void;
  /** Regions are being listed, so the facets step aside. */
  listingRegions: boolean;
}

/** What the active mode searches with - the name field, the map card with
 * its radius, or the region field - and under it the chips that summarize the
 * filters. A chip opens the Filters sheet. */
export function SearchControls({
  filters,
  total,
  areaCircle,
  areaLocked,
  onAreaCircleChange,
  onAreaLockedChange,
  onRadiusPreview,
  onShowMap,
  listingRegions,
}: SearchControlsProps) {
  const { mode, country, minDiff, maxDiff, region } = filters;
  const [sheetOpen, setSheetOpen] = useState(false);
  const grade = gradeSummary(minDiff, maxDiff);
  const open = () => setSheetOpen(true);

  return (
    <Box sx={{ px: 2, pt: 1.5, pb: 0.5, flexShrink: 0 }}>
      {mode === "name" && (
        <SearchField
          value={filters.name}
          onChange={filters.setName}
          placeholder="Search rivers or sections…"
        />
      )}
      {mode === "area" && (
        <AreaControls
          areaCircle={areaCircle ?? null}
          locked={areaLocked ?? false}
          onLockedChange={(v) => onAreaLockedChange?.(v)}
          onRadiusChange={(r) =>
            areaCircle && onAreaCircleChange?.({ ...areaCircle, radiusKm: r })
          }
          onRadiusPreview={onRadiusPreview}
          onShowMap={onShowMap}
        />
      )}
      {mode === "region" && (
        <SearchField
          value={filters.regionQuery}
          onChange={filters.setRegionQuery}
          placeholder="Search regions…"
        />
      )}
      {!listingRegions && (mode !== "region" || region) && (
        <ChipRow>
          {mode === "region" && region && (
            <FilterChip
              label={region.name}
              set
              onClick={() => filters.setRegionQuery(region.name)}
              onDelete={() => filters.setRegion(null)}
            />
          )}
          <FilterChip
            label={grade ? `Grade ${grade}` : "Grade"}
            set={grade !== ""}
            onClick={open}
          />
          {mode === "name" && (
            <FilterChip
              label={country || "Country"}
              set={country !== ""}
              onClick={open}
            />
          )}
          <FilterChip
            label="Water now"
            set={filters.water.length > 0}
            onClick={open}
          />
        </ChipRow>
      )}
      <FiltersSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        total={total}
      />
    </Box>
  );
}
