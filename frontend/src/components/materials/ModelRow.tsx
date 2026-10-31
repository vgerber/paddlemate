import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import { listRowSx } from "@/components/canvas/flatRow";
import { trailSlotSx } from "@/components/phone/phoneGrid";
import type { MaterialModel } from "@/lib/api";
import {
  CATEGORY_LABELS,
  enumLabel,
  modelFigures,
  modelTitle,
  sinceLabel,
} from "@/lib/materials/materials";
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
  selected,
  compareDisabled,
  showCategory,
  onOpen,
  onToggleCompare,
}: {
  model: MaterialModel;
  /** True while a size of the model is held in the comparison. */
  selected: boolean;
  /** The comparison is full and no size of this model is in it. */
  compareDisabled: boolean;
  /** Dropped when the list is already narrowed to one category. */
  showCategory: boolean;
  onOpen: () => void;
  onToggleCompare: () => void;
}) {
  const [units] = useUnits();
  const kind = [
    showCategory && CATEGORY_LABELS[model.category],
    model.discipline && enumLabel(model.discipline),
    model.construction && enumLabel(model.construction),
    sinceLabel(model),
  ]
    .filter(Boolean)
    .join(" · ");
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
        ...listRowSx,
        display: "flex",
        alignItems: "center",
        listStyle: "none",
      }}
    >
      <ButtonBase
        onClick={onOpen}
        sx={{
          flex: 1,
          minWidth: 0,
          alignSelf: "stretch",
          justifyContent: "flex-start",
          textAlign: "left",
          // Hangs out over the row's padding so the whole row opens it.
          my: -1,
          py: 1.75,
          ml: `-${tokens.phone.inner}px`,
          pl: `${tokens.phone.inner}px`,
          borderRadius: `${tokens.radii.md}px`,
          "&.Mui-focusVisible": {
            outline: `2px solid ${tokens.primary}`,
            outlineOffset: -2,
          },
        }}
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
          {kind && <Typography sx={metaSx}>{kind}</Typography>}
          {figures && (
            <Typography sx={{ ...metaSx, fontVariantNumeric: "tabular-nums" }}>
              {figures}
            </Typography>
          )}
          {sizes && (
            <Typography data-testid="model-sizes" sx={metaSx}>
              {sizes}
            </Typography>
          )}
        </Box>
      </ButtonBase>
      <Box sx={trailSlotSx}>
        <Checkbox
          checked={selected}
          disabled={compareDisabled}
          onChange={onToggleCompare}
          slotProps={{
            input: { "aria-label": `Compare ${modelTitle(model)}` },
          }}
          sx={{ width: tokens.touch.min, height: tokens.touch.min, p: 0 }}
        />
      </Box>
    </Box>
  );
}
