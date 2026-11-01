import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import ChipRow from "@/components/ChipRow";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import FilterChip from "@/components/search/FilterChip";
import QueryStates from "@/components/states/QueryStates";
import type { MaterialModel } from "@/lib/api";
import { useMaterialComparison } from "@/lib/hooks/useMaterials";
import { MaterialIcon } from "@/lib/icons";
import { MAX_COMPARE, modelPicked } from "@/lib/materials/compare";
import { materialTitle } from "@/lib/materials/facts";
import { theme } from "@/lib/theme/theme";
import ModelRow from "./ModelRow";

const { tokens } = theme;

const actionSx = { minHeight: tokens.touch.min, ml: 0.5 } as const;

/** The picked entries, at the foot of the list pane below the scroller: how
 * many, each one by name and size with a way to drop it, and the way into the
 * comparison (two are the least that compare). On a phone the add button
 * steps aside while it shows. */
export function CompareBar({
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
        flexShrink: 0,
        mt: 1,
        mb: { xs: 1, md: 0 },
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
      <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1 }}>
        <Button onClick={onClear} sx={actionSx}>
          Clear
        </Button>
        <Button disabled={ids.length < 2} onClick={onCompare} sx={actionSx}>
          Compare
        </Button>
      </Box>
    </Box>
  );
}

/** The model list, a column of rows on a phone and a grid of cards on a
 * desktop, with a Show more button while the server has more. */
export function ModelResults({
  query,
  items,
  compareIds,
  showCategory,
  grid,
  onOpen,
  onToggleCompare,
  onToggleSize,
}: {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
  items: MaterialModel[];
  compareIds: number[];
  showCategory: boolean;
  /** Cards in as many columns as the width allows. */
  grid: boolean;
  onOpen: (id: number) => void;
  onToggleCompare: (model: MaterialModel) => void;
  onToggleSize: (id: number) => void;
}) {
  // Cards of one grid keep the same blocks; the tag row's room is kept only
  // when some card has tags.
  const tagRow = items.some(
    (model) =>
      model.availability === "discontinued" ||
      model.sizes.some((size) => size.size),
  );
  return (
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
        data-testid="material-list"
        sx={{
          m: 0,
          p: 0,
          ...(grid
            ? {
                display: "grid",
                gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN}px, 1fr))`,
                gap: 1,
              }
            : {
                bgcolor: { md: tokens.surface },
                borderRadius: { md: `${tokens.radii.md}px` },
                boxShadow: { md: tokens.elevation.e1 },
                overflow: { md: "hidden" },
              }),
        }}
      >
        {items.map((model) => (
          <ModelRow
            key={`${model.category}-${model.brand}-${model.model}-${model.variant ?? ""}`}
            model={model}
            card={grid}
            tagRow={tagRow}
            selected={modelPicked(compareIds, model)}
            pickedIds={compareIds}
            compareDisabled={
              compareIds.length >= MAX_COMPARE &&
              !modelPicked(compareIds, model)
            }
            showCategory={showCategory}
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
  );
}

/** Narrowest a card of the desktop grid gets, in px. */
const CARD_MIN = 248;
