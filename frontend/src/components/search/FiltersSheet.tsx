import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useEffect, useRef } from "react";
import BottomSheet from "@/components/BottomSheet";
import { plural } from "@/lib/format";
import { theme } from "@/lib/theme";
import type { WaterLevel } from "@/lib/waterLevel";
import DifficultySelect from "./DifficultySelect";
import FilterChip from "./FilterChip";
import type { WaterwaySearchFilters } from "./useWaterwaySearchFilters";

const { tokens } = theme;

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
