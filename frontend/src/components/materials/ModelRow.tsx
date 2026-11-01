import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { cardRowSx, listRowSx } from "@/components/canvas/flatRow";
import { trailSlotSx } from "@/components/phone/phoneGrid";
import { ActionMenu, type RowAction } from "@/components/RowMenu";
import RowOpenTarget from "@/components/RowOpenTarget";
import type { MaterialModel } from "@/lib/api";
import { MAX_COMPARE } from "@/lib/materials/compare";
import { modelFigures, modelTitle, sinceLabel } from "@/lib/materials/facts";
import { CATEGORY_LABELS } from "@/lib/materials/specs";
import { useUnits } from "@/lib/prefs/units";
import { humanize, sentenceCase } from "@/lib/text/format";
import { cardTitleSx, theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** Side of the thumbnail, px. */
const THUMB = 44;

const metaSx = {
  fontSize: "0.8125rem",
  lineHeight: "18px",
  color: "text.secondary",
  overflowWrap: "anywhere",
} as const;

const valueSx = {
  ...metaSx,
  fontVariantNumeric: "tabular-nums",
  // Wraps below the name rather than squeezing it, in a narrow card.
  flex: "0 0 auto",
  ml: "auto",
} as const;

/** One model in the wiki list, two lines: its name with the figures across
 * its sizes at the right, then what it is with the sizes at the right. A
 * photo shows only when there is one. The checkbox at the right puts the
 * model in the comparison (its first size, or the sizes already picked); it
 * shows on hover and focus, and stays while anything is being compared. */
export default function ModelRow({
  model,
  card = false,
  selected,
  pickedIds,
  compareDisabled,
  showCategory,
  onOpen,
  onToggleCompare,
  onToggleSize,
}: {
  model: MaterialModel;
  /** A card of its own, for the desktop grid, rather than a row of a list. */
  card?: boolean;
  /** True while a size of the model is held in the comparison. */
  selected: boolean;
  /** The ids held in the comparison, for the size choice. */
  pickedIds: number[];
  /** The comparison is full and no size of this model is in it. */
  compareDisabled: boolean;
  /** Dropped when the list is already narrowed to one category. */
  showCategory: boolean;
  onOpen: () => void;
  /** Ticks a model of one size, or clears a model held. */
  onToggleCompare: () => void;
  /** Picks or drops one size of the model. */
  onToggleSize: (id: number) => void;
}) {
  const [units] = useUnits();
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  const kind = [
    showCategory && CATEGORY_LABELS[model.category],
    model.discipline && sentenceCase(humanize(model.discipline)),
    sinceLabel(model),
  ]
    .filter(Boolean)
    .join(" · ");
  // One size ticks at once; several ask which, so no size is picked unseen.
  const askSize = !selected && model.sizes.length > 1;
  const full = pickedIds.length >= MAX_COMPARE;
  const figures = modelFigures(model, units, false);
  const sizes = model.sizes
    .map((size) => size.size)
    .filter(Boolean)
    .join(" · ");
  const sizeActions: RowAction[] = model.sizes.map((size) => {
    const held = pickedIds.includes(size.id);
    return {
      label: size.size ?? "-",
      checked: held,
      disabled: full && !held,
      onClick: () => onToggleSize(size.id),
    };
  });
  const comparing = pickedIds.length > 0;

  return (
    // The open target and the checkbox are siblings: a checkbox inside a
    // button is not reachable on its own.
    <Box
      component="li"
      data-testid="material-row"
      sx={{
        ...(card
          ? { ...cardRowSx, mb: 0, px: `${tokens.phone.inner}px` }
          : listRowSx),
        display: "flex",
        alignItems: "center",
        listStyle: "none",
        // Out of the way until the row is reached, or while comparing; a
        // touch screen has no hover, so it always shows there.
        "@media (hover: hover)": {
          "& .compare-box": { opacity: comparing ? 1 : 0 },
          "&:hover .compare-box, &:focus-within .compare-box": { opacity: 1 },
        },
      }}
    >
      <RowOpenTarget hang onClick={onOpen} sx={{ alignItems: "center" }}>
        {model.thumb_url && (
          <Box
            data-testid="material-thumb"
            sx={{
              flexShrink: 0,
              width: THUMB,
              height: THUMB,
              mr: 1.5,
              borderRadius: `${tokens.radii.sm}px`,
              bgcolor: tokens.surfaceHigh,
              overflow: "hidden",
            }}
          >
            <Box
              component="img"
              src={model.thumb_url}
              alt=""
              loading="lazy"
              decoding="async"
              sx={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1.5 }}>
            <Typography
              sx={{
                ...cardTitleSx,
                flex: "1 1 auto",
                minWidth: 0,
                overflowWrap: "anywhere",
              }}
            >
              {modelTitle(model)}
            </Typography>
            {figures && <Typography sx={valueSx}>{figures}</Typography>}
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1.5 }}>
            {kind && (
              <Typography sx={{ ...metaSx, flex: "1 1 auto", minWidth: 0 }}>
                {kind}
              </Typography>
            )}
            {sizes && (
              <Typography data-testid="model-sizes" sx={valueSx}>
                {sizes}
              </Typography>
            )}
          </Box>
        </Box>
      </RowOpenTarget>
      <Box sx={trailSlotSx}>
        <Checkbox
          className="compare-box"
          checked={selected}
          disabled={compareDisabled}
          onChange={(event) =>
            askSize ? setMenuAt(event.currentTarget) : onToggleCompare()
          }
          slotProps={{
            input: { "aria-label": `Compare ${modelTitle(model)}` },
          }}
          sx={{ width: tokens.touch.min, height: tokens.touch.min, p: 0 }}
        />
        <ActionMenu
          actions={sizeActions}
          anchor={menuAt}
          onClose={() => setMenuAt(null)}
          label={`Sizes of ${modelTitle(model)}`}
        />
      </Box>
    </Box>
  );
}
