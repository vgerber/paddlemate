import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import { useState } from "react";
import { cardRowSx, listRowSx } from "@/components/canvas/flatRow";
import { trailSlotSx } from "@/components/phone/phoneGrid";
import { ActionMenu, type RowAction } from "@/components/RowMenu";
import RowOpenTarget from "@/components/RowOpenTarget";
import type { MaterialModel } from "@/lib/api";
import { modelCardFacts } from "@/lib/materials/card";
import { MAX_COMPARE } from "@/lib/materials/compare";
import { modelTitle } from "@/lib/materials/facts";
import { useUnits } from "@/lib/prefs/units";
import { withAlpha } from "@/lib/theme/alpha";
import { theme } from "@/lib/theme/theme";
import ModelCardBody from "./ModelCardBody";
import ModelRowBody from "./ModelRowBody";

const { tokens } = theme;

/** One model in the wiki list: a card of the desktop grid (`card`) or a row
 * of the phone list, both with the same content in the same order (photo,
 * brand, name, what it is, key figures, tags). The checkbox puts the model in
 * the comparison (its first size, or the sizes already picked); it sits in
 * one corner of the card, or at the end of the row, shows on hover and focus
 * and stays while anything is being compared. A touch screen always shows
 * it. */
export default function ModelRow({
  model,
  card = false,
  tagRow = false,
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
  /** A card keeps room for tags, as other cards of its grid have some. */
  tagRow?: boolean;
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
  const facts = modelCardFacts(model, units, showCategory);
  // One size ticks at once; several ask which, so no size is picked unseen.
  const askSize = !selected && model.sizes.length > 1;
  const full = pickedIds.length >= MAX_COMPARE;
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

  const checkbox = (
    <>
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
        sx={{
          width: tokens.touch.min,
          height: tokens.touch.min,
          p: 0,
          ...(card && {
            position: "absolute",
            top: 8,
            right: 8,
            bgcolor: withAlpha(tokens.surface, "scrim"),
            "&:hover": { bgcolor: tokens.surface },
          }),
        }}
      />
      <ActionMenu
        actions={sizeActions}
        anchor={menuAt}
        onClose={() => setMenuAt(null)}
        label={`Sizes of ${modelTitle(model)}`}
      />
    </>
  );

  return (
    // The open target and the checkbox are siblings: a checkbox inside a
    // button is not reachable on its own.
    <Box
      component="li"
      data-testid="material-row"
      sx={{
        ...(card
          ? {
              ...cardRowSx,
              mb: 0,
              p: 1,
              position: "relative",
              display: "flex",
            }
          : { ...listRowSx, display: "flex", alignItems: "center" }),
        listStyle: "none",
        // Out of the way until the row is reached, or while comparing; a
        // touch screen has no hover, so it always shows there.
        "@media (hover: hover)": {
          "& .compare-box": { opacity: comparing ? 1 : 0 },
          "&:hover .compare-box, &:focus-within .compare-box": { opacity: 1 },
        },
      }}
    >
      {card ? (
        <>
          <RowOpenTarget
            onClick={onOpen}
            sx={{
              flex: 1,
              minWidth: 0,
              flexDirection: "column",
              alignItems: "stretch",
              justifyContent: "flex-start",
              borderRadius: `${tokens.radii.md}px`,
            }}
          >
            <ModelCardBody model={model} facts={facts} tagRow={tagRow} />
          </RowOpenTarget>
          {checkbox}
        </>
      ) : (
        <>
          <RowOpenTarget hang onClick={onOpen} sx={{ alignItems: "center" }}>
            <ModelRowBody model={model} facts={facts} />
          </RowOpenTarget>
          <Box sx={trailSlotSx}>{checkbox}</Box>
        </>
      )}
    </Box>
  );
}
