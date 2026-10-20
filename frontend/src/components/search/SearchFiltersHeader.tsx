import CloseIcon from "@mui/icons-material/Close";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useEffect, useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import ChipRow from "@/components/ChipRow";
import PanelHeader from "@/components/PanelHeader";
import { plural } from "@/lib/format";
import type { AreaCircle } from "@/lib/geo";
import type { SwipeTrack } from "@/lib/hooks/useSwipeTabs";
import { theme } from "@/lib/theme";
import type { WaterLevel } from "@/lib/waterLevel";
import AreaControls from "./AreaControls";
import DifficultySelect from "./DifficultySelect";
import { gradeSummary } from "./gradeSummary";
import RegionBrowse, { type RegionBrowseProps } from "./RegionBrowse";
import { isListingRegions, RegionHint } from "./RegionSelect";
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
    track: SwipeTrack;
    gestureProps: React.HTMLAttributes<HTMLElement>;
  };
  onClose?: () => void;
  /** In the phone's peek sheet: the tabs only, the sheet's handle is the title. */
  sheet?: boolean;
}

/** The panel header: the title and the underlined Name, Area and Region
 * tabs. The mode itself lives in the URL, see `useWaterwaySearchFilters`. */
export default function SearchFiltersHeader({
  filters,
  swipe,
  onClose,
  sheet = false,
}: SearchFiltersHeaderProps) {
  // The design sets the title at panel-title size, larger than the title
  // PanelHeader draws, so the title row is drawn here and PanelHeader keeps
  // the tab bar.
  return (
    <Box
      sx={{
        flexShrink: 0,
        bgcolor: tokens.surface,
        // One shadow under the title and the tabs together, on the grey
        // ground of a phone; the desktop card is white already.
        boxShadow: { xs: tokens.elevation.e1, md: "none" },
        position: "relative",
        zIndex: 1,
        "& > *:last-child": { boxShadow: "none" },
      }}
    >
      <Box
        sx={{
          // The desktop card draws the title in its own header.
          display: sheet ? "none" : { xs: "flex", md: "none" },
          alignItems: "center",
          gap: 1,
          px: 2,
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
              mr: -1.25,
              color: tokens.onSurfaceVariant,
            }}
          >
            <MapOutlinedIcon />
          </IconButton>
        )}
      </Box>
      {/* The handle row holds 44px and keeps them (it stacks above); the tabs
          slide up under its foot so the labels start about 20px below the
          bar, the panel's 8/16/24 rhythm, not 30. */}
      <Box sx={{ mt: sheet ? "-18px" : 0 }}>
        <PanelHeader
          tabs={{
            value: filters.mode,
            onChange: filters.setMode,
            options: MODES,
            track: swipe.track,
            gesture: swipe.gestureProps,
          }}
        />
      </Box>
    </Box>
  );
}

/** One filled field with a magnifier and the label as placeholder: the name search or the region search. */
function SearchField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <TextField
      fullWidth
      hiddenLabel
      placeholder={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{
        htmlInput: { "aria-label": label },
        input: {
          sx: { pr: 0.5, minHeight: 56, "& input": { py: 1.75 } },
          startAdornment: (
            <SearchIcon
              sx={{ mr: 1, color: tokens.onSurfaceVariant }}
              fontSize="small"
            />
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
  testId,
}: {
  testId?: string;
  label: string;
  set: boolean;
  /** Absent for a chip that only shows a value and can be removed. */
  onClick?: () => void;
  onDelete?: () => void;
  /** A toggle inside the sheet rather than a summary chip. */
  plain?: boolean;
}) {
  return (
    <Chip
      data-testid={testId}
      variant="outlined"
      clickable={onClick != null}
      onClick={onClick}
      onDelete={onDelete}
      aria-pressed={plain ? set : undefined}
      color={set ? "primary" : "default"}
      // A toggle in the sheet is the thing being tapped: full touch height.
      sx={{
        height: tokens.touch.min,
        // The X is a touch target of its own.
        "& .MuiChip-deleteIcon": {
          position: "relative",
          zIndex: 1,
          m: 0,
          mr: 0.5,
          p: 1.25,
          boxSizing: "content-box",
        },
        ...(!set &&
          !plain && {
            bgcolor: tokens.surface,
            borderColor: "transparent",
            boxShadow: tokens.elevation.e1,
          }),
      }}
      label={label}
    />
  );
}

/** The filter a chip was tapped for; the sheet scrolls to its field. */
type FilterField = "grade" | "country" | "water";

interface FiltersSheetProps {
  open: boolean;
  field: FilterField | null;
  onClose: () => void;
  filters: WaterwaySearchFilters;
  total: number;
}

function FiltersBody({
  filters,
  total,
  onClose,
  field,
}: Omit<FiltersSheetProps, "open">) {
  const refs = useRef<Partial<Record<FilterField, HTMLElement | null>>>({});
  const slot = (name: FilterField) => (el: HTMLElement | null) => {
    refs.current[name] = el;
  };
  useEffect(() => {
    if (field) refs.current[field]?.scrollIntoView({ block: "nearest" });
  }, [field]);
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
        <Typography
          variant="h6"
          component="h2"
          sx={{ fontWeight: 700, fontSize: "1.125rem" }}
        >
          Filters
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center" }}>
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
          <IconButton
            aria-label="Close"
            onClick={onClose}
            sx={{
              width: tokens.touch.min,
              height: tokens.touch.min,
              mr: -1,
              color: tokens.onSurfaceVariant,
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>
      <Box ref={slot("grade")}>
        <DifficultySelect
          minDiff={minDiff}
          maxDiff={maxDiff}
          onMinChange={filters.setMinDiff}
          onMaxChange={filters.setMaxDiff}
        />
      </Box>
      {mode !== "region" && (
        <TextField
          ref={slot("country")}
          label="Country"
          placeholder="AT"
          value={country}
          onChange={(e) => filters.setCountry(e.target.value.toUpperCase())}
          slotProps={{ htmlInput: { maxLength: 2 } }}
        />
      )}
      <Box ref={slot("water")}>
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
        {plural(total, "result")}
      </Button>
    </Box>
  );
}

/** The one Filters sheet: a bottom sheet on a phone, a dialog beside the
 * map on a desktop. */
function FiltersSheet({
  open,
  onClose,
  filters,
  total,
  field,
}: FiltersSheetProps) {
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
          <FiltersBody
            filters={filters}
            total={total}
            onClose={onClose}
            field={open ? field : null}
          />
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
      <FiltersBody
        filters={filters}
        total={total}
        onClose={onClose}
        field={open ? field : null}
      />
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
  /** Regions are being listed, so the facets step aside. */
  listingRegions: boolean;
  /** The map's regions, for the level chips and "Part of". */
  regionBrowse?: RegionBrowseProps;
}

/** What the active mode searches with - the name field, the radius, or the
 * region field - and under it the chips that summarize the
 * filters. A chip opens the Filters sheet. */
export function SearchControls({
  filters,
  total,
  areaCircle,
  areaLocked,
  onAreaCircleChange,
  onAreaLockedChange,
  onRadiusPreview,
  listingRegions,
  regionBrowse,
}: SearchControlsProps) {
  const { mode, country, minDiff, maxDiff, region } = filters;
  const [sheetField, setSheetField] = useState<FilterField | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const grade = gradeSummary(minDiff, maxDiff);
  const open = (field: FilterField) => () => {
    setSheetField(field);
    setSheetOpen(true);
  };
  const waterLabel =
    filters.water.length > 0
      ? `Water ${filters.water.join(", ")}`
      : "Water now";

  return (
    // Spacing: 16px gutter, 12px above the controls, 6px between the field
    // and the chips (plus the chip row's own 6px), 6px below.
    <Box
      sx={{
        px: 2,
        pt: 1.5,
        pb: 0.75,
        flexShrink: 0,
        display: "grid",
        gap: 0.75,
      }}
    >
      {mode === "name" && (
        <SearchField
          value={filters.name}
          onChange={filters.setName}
          label="Name"
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
        />
      )}
      {mode === "region" && (
        <>
          <SearchField
            value={filters.regionQuery}
            onChange={filters.setRegionQuery}
            label="Search regions…"
          />
          {regionBrowse && !isListingRegions(filters.regionQuery) ? (
            <RegionBrowse {...regionBrowse} />
          ) : (
            <RegionHint />
          )}
        </>
      )}
      {!listingRegions && (mode !== "region" || region) && (
        <ChipRow>
          {mode === "region" && region && (
            <FilterChip
              label={region.name}
              testId="region-chip"
              set
              onDelete={() => filters.setRegion(null)}
            />
          )}
          <FilterChip
            label={grade ? `Grade ${grade}` : "Grade"}
            set={grade !== ""}
            onClick={open("grade")}
            onDelete={
              grade !== ""
                ? () => {
                    filters.setMinDiff("");
                    filters.setMaxDiff("");
                  }
                : undefined
            }
          />
          {mode !== "region" && (
            <FilterChip
              label={country || "Country"}
              set={country !== ""}
              onClick={open("country")}
              onDelete={
                country !== "" ? () => filters.setCountry("") : undefined
              }
            />
          )}
          <FilterChip
            label={waterLabel}
            set={filters.water.length > 0}
            onClick={open("water")}
            onDelete={filters.water.length > 0 ? filters.clearWater : undefined}
          />
        </ChipRow>
      )}
      <FiltersSheet
        open={sheetOpen}
        field={sheetField}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        total={total}
      />
    </Box>
  );
}
