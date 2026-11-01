import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useEffect, useRef } from "react";
import BottomSheet from "@/components/BottomSheet";
import FilterGroup from "@/components/filters/FilterGroup";
import FilterSheetFrame from "@/components/filters/FilterSheetFrame";
import { plural } from "@/lib/text/format";
import { theme } from "@/lib/theme/theme";
import type { WaterLevel } from "@/lib/water/waterLevel";
import DifficultySelect from "./DifficultySelect";
import FilterChip from "./FilterChip";
import type { WaterwaySearchFilters } from "./useWaterwaySearchFilters";

const WATER_LEVELS: { level: WaterLevel; label: string }[] = [
  { level: "low", label: "Low" },
  { level: "medium", label: "Medium" },
  { level: "high", label: "High" },
];

/** The filter a chip was tapped for; the sheet scrolls to its field. */
export type FilterField = "grade" | "country" | "water";

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
    <FilterSheetFrame
      dialogPad
      canReset={hasAny}
      onReset={() => {
        filters.setMinDiff("");
        filters.setMaxDiff("");
        filters.setCountry("");
        filters.clearWater();
      }}
      onClose={onClose}
      resultLabel={plural(total, "result")}
    >
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
        <FilterGroup label="Water now" columns={3}>
          {WATER_LEVELS.map(({ level, label }) => (
            <FilterChip
              key={level}
              label={label}
              set={filters.water.includes(level)}
              onClick={() => filters.toggleWater(level)}
              plain
            />
          ))}
        </FilterGroup>
      </Box>
    </FilterSheetFrame>
  );
}

/** The one Filters sheet: a bottom sheet on a phone, a dialog beside the
 * map on a desktop. */
export default function FiltersSheet({
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
