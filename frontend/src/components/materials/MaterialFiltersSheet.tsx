import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { ReactNode } from "react";
import BottomSheet from "@/components/BottomSheet";
import FilterChip from "@/components/search/FilterChip";
import type { MaterialDiscipline, MaterialSort } from "@/lib/api";
import { useMaterialBrands } from "@/lib/hooks/useMaterials";
import { CloseIcon } from "@/lib/icons";
import {
  activeFilterCount,
  CATEGORIES,
  CATEGORY_LABELS,
  CONSTRUCTIONS,
  disciplinesFor,
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

function SheetBody({
  search,
  total,
  onChange,
  onClose,
}: {
  search: MaterialWikiSearch;
  total: number;
  onChange: (patch: Partial<MaterialWikiSearch>) => void;
  onClose: () => void;
}) {
  const [units] = useUnits();
  const { data: brands } = useMaterialBrands(search.category);
  const count = activeFilterCount(search);
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        px: { xs: `${tokens.phone.line}px`, md: 2 },
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
                category: undefined,
                discipline: undefined,
                construction: undefined,
                brand: undefined,
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

      <Group label="Category">
        <Choice
          options={CATEGORIES}
          value={search.category}
          // A brand of the old category may not exist in the new one.
          onChange={(category) =>
            onChange({
              category,
              brand: undefined,
              discipline: disciplinesFor(category).includes(
                search.discipline as MaterialDiscipline,
              )
                ? search.discipline
                : undefined,
            })
          }
          labelOf={(value) => CATEGORY_LABELS[value]}
        />
      </Group>
      <Group label="Discipline">
        <Choice
          options={disciplinesFor(search.category)}
          value={search.discipline}
          onChange={(discipline) => onChange({ discipline })}
          labelOf={enumLabel}
        />
      </Group>
      <Group label="Construction">
        <Choice
          options={CONSTRUCTIONS}
          value={search.construction}
          onChange={(construction) => onChange({ construction })}
          labelOf={enumLabel}
        />
      </Group>

      <TextField
        select
        label="Brand"
        value={search.brand ?? ""}
        onChange={(event) =>
          onChange({ brand: event.target.value || undefined })
        }
      >
        <MenuItem value="">Any brand</MenuItem>
        {(brands ?? []).map((entry) => (
          <MenuItem key={entry.brand} value={entry.brand}>
            {entry.brand} ({entry.count})
          </MenuItem>
        ))}
      </TextField>
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

/** Every way the wiki list can be narrowed or ordered: a bottom sheet on a
 * phone, a dialog on a desktop. */
export default function MaterialFiltersSheet({
  open,
  onClose,
  ...body
}: {
  open: boolean;
  onClose: () => void;
  search: MaterialWikiSearch;
  total: number;
  onChange: (patch: Partial<MaterialWikiSearch>) => void;
}) {
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
          <SheetBody {...body} onClose={onClose} />
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
      <SheetBody {...body} onClose={onClose} />
    </BottomSheet>
  );
}
