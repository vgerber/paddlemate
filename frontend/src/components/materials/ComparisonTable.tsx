import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { phoneCardSx } from "@/components/canvas/flatRow";
import { withAlpha } from "@/lib/alpha";
import type { Material } from "@/lib/api";
import { CloseIcon } from "@/lib/icons";
import {
  CATEGORY_LABELS,
  enumLabel,
  formatSpec,
  MATERIAL_SPECS,
  materialTitle,
  SPEC_GROUP_LABELS,
  specSpread,
  specValue,
  yearsLabel,
} from "@/lib/materials";
import { cardTitleSx, sectionHeadingSx, theme } from "@/lib/theme";
import { useUnits } from "@/lib/units";

const { tokens } = theme;

const COLUMN_WIDTH = 160;
const LABEL_WIDTH = 112;

const cellSx = {
  px: 1.5,
  py: 1,
  minWidth: COLUMN_WIDTH,
  fontVariantNumeric: "tabular-nums",
  textAlign: "left",
  verticalAlign: "top",
  borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
} as const;

/** The first column stays while the entries scroll past it. */
const labelCellSx = {
  ...cellSx,
  minWidth: LABEL_WIDTH,
  maxWidth: LABEL_WIDTH,
  position: "sticky",
  left: 0,
  zIndex: 1,
  bgcolor: tokens.surface,
  fontWeight: 400,
} as const;

/** The stated facts that are not measurements. They head the table because
 * they say whether two entries are comparable at all. */
const DESCRIBE_ROWS: { label: string; value: (m: Material) => string }[] = [
  { label: "Category", value: (m) => CATEGORY_LABELS[m.category] },
  {
    label: "Discipline",
    value: (m) => (m.discipline ? enumLabel(m.discipline) : "-"),
  },
  {
    label: "Construction",
    value: (m) => (m.construction ? enumLabel(m.construction) : "-"),
  },
  { label: "Built", value: (m) => yearsLabel(m) || "-" },
];

function GroupRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <Box
        component="th"
        scope="colgroup"
        colSpan={span}
        sx={{
          ...cellSx,
          ...sectionHeadingSx,
          color: tokens.onSurfaceVariant,
          bgcolor: tokens.surfaceLow,
          position: "sticky",
          left: 0,
        }}
      >
        {label}
      </Box>
    </tr>
  );
}

/** Entries side by side, one column each, one row per property. A row where
 * the entries differ carries the accent, so the eye lands on what sets them
 * apart; a row nobody states is left out. */
export default function ComparisonTable({
  materials,
  onRemove,
}: {
  materials: Material[];
  onRemove: (id: number) => void;
}) {
  const [units] = useUnits();
  const span = materials.length + 1;
  return (
    // The table is wider than a phone; it scrolls inside this box rather
    // than dragging the page sideways.
    <Box
      role="region"
      aria-label="Comparison table"
      tabIndex={0}
      sx={{
        ...phoneCardSx,
        overflowX: "auto",
        "&:focus-visible": {
          outline: `2px solid ${tokens.primary}`,
          outlineOffset: 2,
        },
      }}
    >
      <Box component="table" sx={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <Box component="td" sx={labelCellSx} />
            {materials.map((material) => (
              <Box component="th" scope="col" key={material.id} sx={cellSx}>
                <Box sx={{ display: "flex", alignItems: "flex-start" }}>
                  <Link
                    to="/materials/$materialId"
                    params={{ materialId: String(material.id) }}
                    search={{ edit: false }}
                    style={{ textDecoration: "none", flex: 1, minWidth: 0 }}
                  >
                    <Typography
                      sx={{
                        ...cardTitleSx,
                        color: "text.primary",
                        overflowWrap: "anywhere",
                        py: "12px",
                      }}
                    >
                      {materialTitle(material)}
                    </Typography>
                  </Link>
                  <IconButton
                    onClick={() => onRemove(material.id)}
                    aria-label={`Remove ${materialTitle(material)} from the comparison`}
                    sx={{
                      width: tokens.touch.min,
                      height: tokens.touch.min,
                      mr: -1.5,
                      flexShrink: 0,
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          <GroupRow label="Overview" span={span} />
          {DESCRIBE_ROWS.map((row) => (
            <tr key={row.label}>
              <Box component="th" scope="row" sx={labelCellSx}>
                <Typography variant="body2" color="textSecondary">
                  {row.label}
                </Typography>
              </Box>
              {materials.map((material) => (
                <Box component="td" key={material.id} sx={cellSx}>
                  <Typography variant="body2">{row.value(material)}</Typography>
                </Box>
              ))}
            </tr>
          ))}
          {(["hull", "cockpit", "paddler"] as const).map((group) => {
            const specs = MATERIAL_SPECS.filter(
              (spec) =>
                spec.group === group &&
                !specSpread(materials.map((m) => specValue(m, spec.key))).empty,
            );
            if (specs.length === 0) return null;
            return (
              <Fragment key={group}>
                <GroupRow label={SPEC_GROUP_LABELS[group]} span={span} />
                {specs.map((spec) => {
                  const values = materials.map((m) => specValue(m, spec.key));
                  const { varies } = specSpread(values);
                  return (
                    <tr key={spec.key}>
                      <Box component="th" scope="row" sx={labelCellSx}>
                        <Typography variant="body2" color="textSecondary">
                          {spec.label}
                        </Typography>
                      </Box>
                      {materials.map((material, index) => (
                        <Box component="td" key={material.id} sx={cellSx}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: varies ? 600 : 400,
                              color: varies ? tokens.primary : "text.primary",
                            }}
                          >
                            {formatSpec(values[index], spec, units)}
                          </Typography>
                        </Box>
                      ))}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}
