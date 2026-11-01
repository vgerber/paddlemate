import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import BottomSheet from "@/components/BottomSheet";
import ChoiceChips from "@/components/filters/ChoiceChips";
import FilterGroup from "@/components/filters/FilterGroup";
import FilterSheetFrame from "@/components/filters/FilterSheetFrame";
import type { MaterialSort } from "@/lib/api";
import { AVAILABILITY_LABELS } from "@/lib/materials/availability";
import {
  activeFilterCount,
  FILTER_AVAILABILITIES,
  MAX_FITS_KG,
  type MaterialWikiSearch,
  SORT_LABELS,
  SORTS,
} from "@/lib/materials/search";
import { CONSTRUCTIONS } from "@/lib/materials/specs";
import {
  parseInput,
  toInputText,
  unitLabel,
  useUnits,
} from "@/lib/prefs/units";
import { humanize, plural, sentenceCase } from "@/lib/text/format";
/** What Reset clears: the filters and the sort, never the tree path. */
export const RESET_PATCH: Partial<MaterialWikiSearch> = {
  construction: undefined,
  availability: undefined,
  fits: undefined,
  sort: undefined,
};

/** Whether Reset has anything to clear. */
export const canResetFilters = (search: MaterialWikiSearch) =>
  activeFilterCount(search) > 0 || search.sort != null;

/** The filters that are not the tree's levels: construction, availability,
 * the paddler's weight and the sort. The desktop sidebar shows them under the
 * tree, lighter; the phone's sheet at full size. */
export function FilterFields({
  search,
  onChange,
  sidebar = false,
}: {
  search: MaterialWikiSearch;
  onChange: (patch: Partial<MaterialWikiSearch>) => void;
  /** The quiet look for the desktop sidebar. */
  sidebar?: boolean;
}) {
  const [units] = useUnits();
  const label = `Fits paddler (${unitLabel("weight", units)})`;
  const weight =
    search.fits == null ? "" : toInputText("weight", search.fits, units);
  const setWeight = (text: string) => {
    const kg = parseInput("weight", text, units, 4);
    onChange({
      fits: kg != null && kg > 0 && kg <= MAX_FITS_KG ? kg : undefined,
    });
  };
  return (
    <Box sx={{ display: "grid", gap: sidebar ? 1 : 2 }}>
      <FilterGroup label="Construction" compact={sidebar}>
        <ChoiceChips
          options={CONSTRUCTIONS}
          value={search.construction}
          onChange={(construction) => onChange({ construction })}
          labelOf={(value) => sentenceCase(humanize(value))}
          compact={sidebar}
        />
      </FilterGroup>
      <FilterGroup label="Availability" compact={sidebar}>
        <ChoiceChips
          options={FILTER_AVAILABILITIES}
          value={search.availability}
          onChange={(availability) => onChange({ availability })}
          labelOf={(value) => AVAILABILITY_LABELS[value]}
          compact={sidebar}
        />
      </FilterGroup>
      {sidebar ? (
        <FilterGroup label="Paddler weight" compact>
          <TextField
            hiddenLabel
            size="small"
            placeholder={unitLabel("weight", units)}
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            slotProps={{
              htmlInput: {
                "aria-label": label,
                inputMode: "decimal",
                maxLength: 5,
              },
            }}
            sx={{ width: 120, mt: 0.5 }}
          />
        </FilterGroup>
      ) : (
        <TextField
          label={label}
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
          helperText="Boats built for your body weight"
          slotProps={{ htmlInput: { inputMode: "decimal", maxLength: 5 } }}
        />
      )}
      <FilterGroup label="Sort by" compact={sidebar}>
        <ChoiceChips<MaterialSort>
          options={SORTS}
          value={search.sort ?? "name"}
          // Name is the default, so it stays out of the URL.
          onChange={(sort) =>
            onChange({ sort: sort === "name" ? undefined : sort })
          }
          labelOf={(value) => SORT_LABELS[value]}
          compact={sidebar}
        />
      </FilterGroup>
    </Box>
  );
}

/** Every way the phone's wiki list can be narrowed beyond the tree or
 * ordered: a bottom sheet. */
export default function MaterialFiltersSheet({
  open,
  onClose,
  search,
  total,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  search: MaterialWikiSearch;
  total: number;
  onChange: (patch: Partial<MaterialWikiSearch>) => void;
}) {
  return (
    <BottomSheet
      state={open ? "open" : "closed"}
      onStateChange={(s) => s === "open" || onClose()}
      label="Filters"
    >
      <FilterSheetFrame
        canReset={canResetFilters(search)}
        onReset={() => onChange(RESET_PATCH)}
        onClose={onClose}
        resultLabel={plural(total, "result")}
      >
        <FilterFields search={search} onChange={onChange} />
      </FilterSheetFrame>
    </BottomSheet>
  );
}
