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
import {
  useMaterialComparison,
  useMaterialModels,
} from "@/lib/hooks/useMaterials";
import { CloseIcon, MaterialIcon, SearchIcon } from "@/lib/icons";
import {
  activeFilterCount,
  CATEGORY_LABELS,
  enumLabel,
  MAX_COMPARE,
  type MaterialWikiSearch,
  materialTitle,
  modelPicked,
  toMaterialFilters,
} from "@/lib/materials/materials";
import { formatQuantity, useUnits } from "@/lib/prefs/units";
import { BOTTOM_NAV_SPACE, theme } from "@/lib/theme/theme";
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

/** The picked entries, pinned to the foot of the list: how many, each one by
 * name and size with a way to drop it, and the way into the comparison (two
 * are the least that compare). It sits above the bottom nav and the add
 * button on a phone. */
function CompareBar({
  ids,
  onRemove,
  onClear,
  onCompare,
}: {
  ids: number[];
  onRemove: (id: number) => void;
  onClear: () => void;
  onCompare: () => void;
}) {
  const picked = useMaterialComparison(ids, true);
  const names = new Map(
    (picked.data ?? []).map((m) => [m.id, materialTitle(m)]),
  );
  return (
    <Box
      data-testid="compare-bar"
      sx={{
        ...phoneCardSx,
        position: "sticky",
        bottom: { xs: `calc(${BOTTOM_NAV_SPACE} + 80px)`, md: 12 },
        zIndex: 2,
        mt: 1,
        py: 1,
        boxShadow: tokens.elevation.e2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          px: `${tokens.phone.inner}px`,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }} aria-live="polite">
          {ids.length} picked
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {MAX_COMPARE} at most
        </Typography>
      </Box>
      <Box sx={{ px: `${tokens.phone.inner}px`, py: 0.5 }}>
        <ChipRow>
          {ids.map((id) => {
            const name = names.get(id) ?? "Entry";
            return (
              <FilterChip
                key={id}
                label={name}
                set
                onDelete={() => onRemove(id)}
                deleteLabel={`Remove ${name}`}
              />
            );
          })}
        </ChipRow>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", px: 0.5 }}>
        <Button onClick={onClear} sx={{ minHeight: tokens.touch.min }}>
          Clear
        </Button>
        <Button
          disabled={ids.length < 2}
          onClick={onCompare}
          sx={{ minHeight: tokens.touch.min }}
        >
          Compare
        </Button>
      </Box>
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
  onToggleSize,
  onClearCompare,
  onCompare,
}: {
  search: MaterialWikiSearch;
  compareIds: number[];
  onChange: (patch: Partial<MaterialWikiSearch>) => void;
  onOpen: (id: number) => void;
  onAdd: () => void;
  onToggleCompare: (model: MaterialModel) => void;
  onToggleSize: (id: number) => void;
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
                pickedIds={compareIds}
                compareDisabled={
                  compareIds.length >= MAX_COMPARE &&
                  !modelPicked(compareIds, model)
                }
                showCategory={search.category == null}
                onOpen={() => onOpen(model.sizes[0].id)}
                onToggleCompare={() => onToggleCompare(model)}
                onToggleSize={onToggleSize}
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
        {compareIds.length > 0 && (
          <CompareBar
            ids={compareIds}
            onRemove={(id) => onToggleSize(id)}
            onClear={onClearCompare}
            onCompare={onCompare}
          />
        )}
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
