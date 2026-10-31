import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import ChipRow from "@/components/ChipRow";
import DockedAction from "@/components/DockedAction";
import ListPaneHeader from "@/components/ListPaneHeader";
import { fabRoom } from "@/components/PaneFab";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import FilterChip from "@/components/search/FilterChip";
import QueryStates from "@/components/states/QueryStates";
import type { MaterialModel } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/ui/useDebouncedValue";
import { useMaterialModels } from "@/lib/hooks/useMaterials";
import { CloseIcon, MaterialIcon, SearchIcon } from "@/lib/icons";
import {
  activeFilterCount,
  CATEGORY_LABELS,
  enumLabel,
  MAX_COMPARE,
  type MaterialWikiSearch,
  modelPicked,
  toMaterialFilters,
} from "@/lib/materials/materials";
import { formatQuantity, useUnits } from "@/lib/prefs/units";
import { theme } from "@/lib/theme/theme";
import MaterialFiltersSheet from "./MaterialFiltersSheet";
import ModelRow from "./ModelRow";

const { tokens } = theme;

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      fullWidth
      hiddenLabel
      placeholder="Brand or model"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        htmlInput: { "aria-label": "Brand or model", maxLength: 100 },
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

/** The picked entries as a bar above the list: how many, a way to empty it
 * and the way into the comparison (two are the least that compare). */
function CompareBar({
  count,
  onClear,
  onCompare,
}: {
  count: number;
  onClear: () => void;
  onCompare: () => void;
}) {
  return (
    <Box
      data-testid="compare-bar"
      sx={{
        ...phoneCardSx,
        display: "flex",
        alignItems: "center",
        gap: 1,
        mb: 0.75,
        pl: `${tokens.phone.inner}px`,
        pr: 0.5,
        minHeight: 52,
      }}
    >
      <Typography
        variant="body2"
        sx={{ fontWeight: 500, flex: 1 }}
        aria-live="polite"
      >
        {count} of {MAX_COMPARE} picked
      </Typography>
      <Button onClick={onClear} sx={{ minHeight: tokens.touch.min }}>
        Clear
      </Button>
      <Button
        disabled={count < 2}
        onClick={onCompare}
        sx={{ minHeight: tokens.touch.min }}
      >
        Compare
      </Button>
    </Box>
  );
}

/** The wiki list: a name search, the filters as chips, the entries, and the
 * comparison tray once something is picked. */
export default function MaterialsView({
  search,
  compareIds,
  onChange,
  onOpen,
  onAdd,
  onToggleCompare,
  onClearCompare,
  onCompare,
}: {
  search: MaterialWikiSearch;
  compareIds: number[];
  onChange: (patch: Partial<MaterialWikiSearch>) => void;
  onOpen: (id: number) => void;
  onAdd: () => void;
  onToggleCompare: (model: MaterialModel) => void;
  onClearCompare: () => void;
  onCompare: () => void;
}) {
  const [units] = useUnits();
  const [sheetOpen, setSheetOpen] = useState(false);
  const filterCount = activeFilterCount(search);

  // The field types faster than the URL should change, so the query reaches
  // the search state only once typing stops.
  const [text, setText] = useState(search.q ?? "");
  const debouncedText = useDebouncedValue(text);
  useEffect(() => {
    const next = debouncedText.trim() || undefined;
    if (next !== search.q) onChange({ q: next });
  }, [debouncedText, search.q, onChange]);

  const query = useMaterialModels(toMaterialFilters(search));
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total;

  const chips: {
    key: string;
    label: string;
    clear: Partial<MaterialWikiSearch>;
  }[] = [];
  if (search.category) {
    chips.push({
      key: "category",
      label: CATEGORY_LABELS[search.category],
      clear: { category: undefined, brand: undefined },
    });
  }
  if (search.discipline) {
    chips.push({
      key: "discipline",
      label: enumLabel(search.discipline),
      clear: { discipline: undefined },
    });
  }
  if (search.construction) {
    chips.push({
      key: "construction",
      label: enumLabel(search.construction),
      clear: { construction: undefined },
    });
  }
  if (search.brand) {
    chips.push({
      key: "brand",
      label: search.brand,
      clear: { brand: undefined },
    });
  }
  if (search.fits != null) {
    chips.push({
      key: "fits",
      label: `Fits ${formatQuantity("weight", search.fits, units)}`,
      clear: { fits: undefined },
    });
  }

  return (
    <Box>
      <Box
        sx={{
          px: { xs: `${tokens.phone.line}px`, md: 2 },
          pt: 1.5,
          pb: 0.75,
          display: "grid",
          gap: 0.75,
        }}
      >
        <SearchField value={text} onChange={setText} />
        <ChipRow>
          <FilterChip
            testId="filters-chip"
            label={filterCount > 0 ? `Filters · ${filterCount}` : "Filters"}
            set={filterCount > 0}
            onClick={() => setSheetOpen(true)}
          />
          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              set
              onClick={() => setSheetOpen(true)}
              onDelete={() => onChange(chip.clear)}
            />
          ))}
        </ChipRow>
      </Box>

      <ListPaneHeader count={total} noun="model" loading={query.isLoading} />

      <Box
        sx={{
          mx: { xs: `${tokens.phone.edge}px`, md: 0 },
          pb: fabRoom,
        }}
      >
        {compareIds.length > 0 && (
          <CompareBar
            count={compareIds.length}
            onClear={onClearCompare}
            onCompare={onCompare}
          />
        )}
        <QueryStates
          query={query}
          count={items.length}
          errorFallback="Could not load the wiki."
          empty={{
            icon: <MaterialIcon />,
            title: "Nothing in the wiki matches that.",
            caption: "Add the boat you are looking for.",
          }}
        >
          <Box
            component="ul"
            sx={{
              m: 0,
              p: 0,
              bgcolor: { md: tokens.surface },
              borderRadius: { md: `${tokens.radii.md}px` },
              boxShadow: { md: tokens.elevation.e1 },
              overflow: { md: "hidden" },
            }}
          >
            {items.map((model) => (
              <ModelRow
                key={`${model.category}-${model.brand}-${model.model}-${model.variant ?? ""}`}
                model={model}
                selected={modelPicked(compareIds, model)}
                compareDisabled={
                  compareIds.length >= MAX_COMPARE &&
                  !modelPicked(compareIds, model)
                }
                showCategory={search.category == null}
                onOpen={() => onOpen(model.sizes[0].id)}
                onToggleCompare={() => onToggleCompare(model)}
              />
            ))}
          </Box>
          {query.hasNextPage && (
            <Button
              fullWidth
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
              sx={{ minHeight: tokens.touch.min, mt: 1 }}
            >
              Show more
            </Button>
          )}
        </QueryStates>
        <DockedAction label="Add entry" onClick={onAdd} inset={0} />
      </Box>

      <MaterialFiltersSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        search={search}
        total={total ?? 0}
        onChange={onChange}
      />
    </Box>
  );
}
