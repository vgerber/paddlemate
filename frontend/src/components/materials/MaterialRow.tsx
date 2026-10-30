import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import { listRowSx, trailSlotSx } from "@/components/canvas/flatRow";
import type { Material } from "@/lib/api";
import {
  CATEGORY_LABELS,
  enumLabel,
  formatSpec,
  MATERIAL_SPECS,
  materialTitle,
  specValue,
  yearsLabel,
} from "@/lib/materials/materials";
import { useUnits } from "@/lib/prefs/units";
import { cardTitleSx, theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The measurements a row carries: the three that tell boats apart at a
 * glance. The rest live in the detail view and the comparison. */
const ROW_SPEC_KEYS = ["length_cm", "volume_l", "weight_kg"] as const;

const metaSx = {
  fontSize: "0.8125rem",
  lineHeight: "18px",
  color: "text.secondary",
} as const;

/** One entry in the wiki list: its name, what it is, the three figures that
 * matter, and a checkbox at the right that puts it in the comparison. */
export default function MaterialRow({
  material,
  selected,
  compareDisabled,
  showCategory,
  onOpen,
  onToggleCompare,
}: {
  material: Material;
  /** True while the entry is held in the comparison. */
  selected: boolean;
  /** The comparison is full and this entry is not in it. */
  compareDisabled: boolean;
  /** Dropped when the list is already narrowed to one category. */
  showCategory: boolean;
  onOpen: () => void;
  onToggleCompare: () => void;
}) {
  const kind = [
    showCategory && CATEGORY_LABELS[material.category],
    material.discipline && enumLabel(material.discipline),
    material.construction && enumLabel(material.construction),
    yearsLabel(material),
  ]
    .filter(Boolean)
    .join(" · ");
  const [units] = useUnits();
  const figures = MATERIAL_SPECS.filter((spec) =>
    (ROW_SPEC_KEYS as readonly string[]).includes(spec.key),
  )
    .map((spec) => ({ spec, value: specValue(material, spec.key) }))
    .filter(({ value }) => value != null)
    .map(({ spec, value }) => `${spec.label} ${formatSpec(value, spec, units)}`)
    .join("  ·  ");

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
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ ...cardTitleSx, overflowWrap: "anywhere" }}>
            {materialTitle(material)}
          </Typography>
          {kind && <Typography sx={metaSx}>{kind}</Typography>}
          {figures && (
            <Typography sx={{ ...metaSx, fontVariantNumeric: "tabular-nums" }}>
              {figures}
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
            input: { "aria-label": `Compare ${materialTitle(material)}` },
          }}
          sx={{ width: tokens.touch.min, height: tokens.touch.min, p: 0 }}
        />
      </Box>
    </Box>
  );
}
