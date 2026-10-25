import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import { type ReactNode, useRef, useState } from "react";
import ChipRow from "@/components/ChipRow";
import { usePanelEnter } from "@/components/usePanelEnter";
import type { AreaCircle } from "@/lib/geo";
import { CloseIcon, SearchIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import AreaControls from "./AreaControls";
import FilterChip from "./FilterChip";
import FiltersSheet, { type FilterField } from "./FiltersSheet";
import { gradeSummary } from "./gradeSummary";
import RegionBrowse, { type RegionBrowseProps } from "./RegionBrowse";
import { isListingRegions, RegionHint } from "./RegionSelect";
import type { WaterwaySearchFilters } from "./useWaterwaySearchFilters";

const { tokens } = theme;

/** The picked region's name rises into the bar. */
function RegionChipEnter({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  usePanelEnter(ref, "in", { from: { y: 8 }, onMount: true });
  return (
    <Box ref={ref} component="span" sx={{ display: "inline-flex" }}>
      {children}
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
export default function SearchControls({
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
        px: { xs: `${tokens.phone.line}px`, md: 2 },
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
            <RegionChipEnter key={region.name}>
              <FilterChip
                label={region.name}
                testId="region-chip"
                set
                onDelete={() => filters.setRegion(null)}
              />
            </RegionChipEnter>
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
