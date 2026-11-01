import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { cardRowSx, listRowSx } from "@/components/canvas/flatRow";
import { trailSlotSx } from "@/components/phone/phoneGrid";
import RowOpenTarget from "@/components/RowOpenTarget";
import type { MaterialModel } from "@/lib/api";
import { MAX_COMPARE } from "@/lib/materials/compare";
import { modelFigures, modelTitle, sinceLabel } from "@/lib/materials/facts";
import { CATEGORY_LABELS, disciplineLabel } from "@/lib/materials/specs";
import { useUnits } from "@/lib/prefs/units";
import { cardTitleSx, theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** Side of the thumbnail box, px. */
const THUMB = 56;

const metaSx = {
  fontSize: "0.8125rem",
  lineHeight: "18px",
  color: "text.secondary",
} as const;

/** One model in the wiki list: its name, what it is, the figures across its
 * sizes, the sizes themselves, and a checkbox at the right that puts it in the
 * comparison (its first size, or the sizes already picked). */
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
    model.discipline && disciplineLabel(model.discipline, model.category),
    sinceLabel(model),
  ]
    .filter(Boolean)
    .join(" · ");
  // One size ticks at once; several ask which, so no size is picked unseen.
  const askSize = !selected && model.sizes.length > 1;
  const full = pickedIds.length >= MAX_COMPARE;
  const figures = modelFigures(model, units);
  const sizes = model.sizes
    .map((size) => size.size)
    .filter(Boolean)
    .join(" · ");
  const thumb = model.thumb_url;

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
        alignItems: card ? "flex-start" : "center",
        listStyle: "none",
      }}
    >
      <RowOpenTarget
        hang
        onClick={onOpen}
        sx={{ alignItems: card ? "flex-start" : "center" }}
      >
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
          {thumb && (
            <Box
              component="img"
              src={thumb}
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
          )}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ ...cardTitleSx, overflowWrap: "anywhere" }}>
            {modelTitle(model)}
          </Typography>
          {kind && (
            <Typography sx={{ ...metaSx, overflowWrap: "anywhere" }}>
              {kind}
            </Typography>
          )}
          <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1 }}>
            {figures && (
              <Typography
                sx={{
                  ...metaSx,
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 0,
                  overflowWrap: "anywhere",
                }}
              >
                {figures}
              </Typography>
            )}
            {sizes && (
              <Typography
                data-testid="model-sizes"
                sx={{ ...metaSx, overflowWrap: "anywhere" }}
              >
                {sizes}
              </Typography>
            )}
          </Box>
        </Box>
      </RowOpenTarget>
      <Box sx={trailSlotSx}>
        <Checkbox
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
        <Menu
          open={menuAt != null}
          anchorEl={menuAt}
          onClose={() => setMenuAt(null)}
          slotProps={{
            list: { "aria-label": `Sizes of ${modelTitle(model)}` },
          }}
        >
          {model.sizes.map((size) => {
            const held = pickedIds.includes(size.id);
            return (
              <MenuItem
                key={size.id}
                role="menuitemcheckbox"
                aria-checked={held}
                disabled={full && !held}
                onClick={() => onToggleSize(size.id)}
                sx={{ minHeight: tokens.touch.min }}
              >
                <Checkbox
                  edge="start"
                  checked={held}
                  tabIndex={-1}
                  disableRipple
                  aria-hidden
                />
                <ListItemText primary={size.size ?? "-"} />
              </MenuItem>
            );
          })}
        </Menu>
      </Box>
    </Box>
  );
}
