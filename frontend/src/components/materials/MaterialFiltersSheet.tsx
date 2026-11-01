import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import BottomSheet from "@/components/BottomSheet";
import FilterChip from "@/components/search/FilterChip";
import type { MaterialSort } from "@/lib/api";
import { CloseIcon } from "@/lib/icons";
import {
  activeFilterCount,
  CONSTRUCTIONS,
  enumLabel,
  MAX_FITS_KG,
  type MaterialWikiSearch,
  SORT_LABELS,
  SORTS,
} from "@/lib/materials/materials";
import {
  parseInput,
  toInputText,
  unitLabel,
  useUnits,
} from "@/lib/prefs/units";
import { plural } from "@/lib/text/format";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography
        variant="body2"
        component="span"
        sx={{ display: "block", mb: 0.75, fontWeight: 600 }}
        color="textSecondary"
      >
        {label}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>{children}</Box>
    </Box>
  );
}

/** One choice out of several as chips; tapping the chosen one clears it. */
function Choice<T extends string>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: readonly T[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  labelOf: (value: T) => string;
}) {
  return options.map((option) => (
    <FilterChip
      key={option}
      plain
      label={labelOf(option)}
      set={value === option}
      onClick={() => onChange(value === option ? undefined : option)}
    />
  ));
}

/** The filters that are not the tree's levels: construction, the paddler's
 * weight and, on a phone, the sort. The desktop sidebar shows them under the
 * tree and puts the sort in the page header. */
export function FilterFields({
  search,
  onChange,
  withSort,
}: {
  search: MaterialWikiSearch;
  onChange: (patch: Partial<MaterialWikiSearch>) => void;
  withSort: boolean;
}) {
  const [units] = useUnits();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Group label="Construction">
        <Choice
          options={CONSTRUCTIONS}
          value={search.construction}
          onChange={(construction) => onChange({ construction })}
          labelOf={enumLabel}
        />
      </Group>
      <TextField
        label={`Fits paddler (${unitLabel("weight", units)})`}
        value={
          search.fits == null ? "" : toInputText("weight", search.fits, units)
        }
        onChange={(event) => {
          const kg = parseInput("weight", event.target.value, units, 4);
          onChange({
            fits: kg != null && kg > 0 && kg <= MAX_FITS_KG ? kg : undefined,
          });
        }}
        helperText="Boats built for your body weight"
        slotProps={{ htmlInput: { inputMode: "decimal", maxLength: 5 } }}
      />
      {withSort && (
        <Group label="Sort by">
          <Choice<MaterialSort>
            options={SORTS}
            value={search.sort ?? "name"}
            // Name is the default, so it stays out of the URL.
            onChange={(sort) =>
              onChange({ sort: sort === "name" ? undefined : sort })
            }
            labelOf={(value) => SORT_LABELS[value]}
          />
        </Group>
      )}
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
  const count = activeFilterCount(search);
  return (
    <BottomSheet
      state={open ? "open" : "closed"}
      onStateChange={(s) => s === "open" || onClose()}
      label="Filters"
    >
      <Box
        sx={{
          display: "grid",
          gap: 2,
          px: `${tokens.phone.line}px`,
          pb: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="h4" component="h2" sx={{ lineHeight: "24px" }}>
            Filters
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Button
              disabled={count === 0 && search.sort == null}
              onClick={() =>
                onChange({
                  construction: undefined,
                  fits: undefined,
                  sort: undefined,
                })
              }
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
        <FilterFields search={search} onChange={onChange} withSort />
        <Button
          variant="contained"
          onClick={onClose}
          sx={{ height: 52, borderRadius: `${tokens.radii.md}px` }}
        >
          {plural(total, "result")}
        </Button>
      </Box>
    </BottomSheet>
  );
}
