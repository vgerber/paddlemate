import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { Fragment } from "react";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import type { Material } from "@/lib/api";
import { CompareIcon } from "@/lib/icons";
import { serializeCompareIds } from "@/lib/materials/compare";
import { sizeTableRows } from "@/lib/materials/specRows";
import { useUnits } from "@/lib/prefs/units";
import { withAlpha } from "@/lib/theme/alpha";
import { focusRingSx } from "@/lib/theme/focusRing";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

const cellSx = {
  px: `${tokens.phone.inner}px`,
  py: 1,
  textAlign: "left",
  verticalAlign: "top",
  whiteSpace: "nowrap",
  fontSize: "0.875rem",
  fontVariantNumeric: "tabular-nums",
  borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
} as const;

/** Every size of a model side by side, the only place its per-size specs
 * are listed. A size's column heading picks it (the URL holds the entry), and
 * the picked column is washed. Scrolls inside its own box. */
export default function AllSizesTable({
  materials,
  pickedId,
  onPick,
}: {
  materials: Material[];
  pickedId: number;
  onPick: (id: number) => void;
}) {
  const [units] = useUnits();
  const navigate = useNavigate();
  const rows = sizeTableRows(materials, units);
  const grouped = new Set(rows.map((row) => row.group)).size > 1;
  const picked = (id: number) => id === pickedId;
  const wash = (id: number) =>
    picked(id) ? { bgcolor: withAlpha(tokens.primary, "wash") } : undefined;
  return (
    <Box>
      <Box
        role="region"
        aria-label="All sizes"
        tabIndex={0}
        sx={{
          ...phoneCardSx,
          overflowX: "auto",
          ...focusRingSx(),
        }}
      >
        <Box
          component="table"
          data-testid="all-sizes"
          sx={{
            borderCollapse: "collapse",
            width: { xs: "100%", md: "max-content" },
            minWidth: { md: 420 },
            maxWidth: "100%",
          }}
        >
          <thead>
            <tr>
              <Box component="td" sx={cellSx}>
                <Typography variant="body2" color="textSecondary">
                  Size
                </Typography>
              </Box>
              {materials.map((material) => (
                <Box
                  component="th"
                  scope="col"
                  key={material.id}
                  aria-current={picked(material.id) ? "true" : undefined}
                  sx={{ ...cellSx, p: 0, ...wash(material.id) }}
                >
                  <ButtonBase
                    onClick={() => onPick(material.id)}
                    aria-label={`Size ${material.size ?? "-"}`}
                    aria-pressed={picked(material.id)}
                    sx={{
                      width: "100%",
                      minWidth: tokens.touch.min,
                      minHeight: tokens.touch.min,
                      justifyContent: "flex-start",
                      px: `${tokens.phone.inner}px`,
                      font: "inherit",
                      fontWeight: 600,
                      color: picked(material.id) ? tokens.primary : "inherit",
                      ...focusRingSx(),
                    }}
                  >
                    {material.size ?? "-"}
                  </ButtonBase>
                </Box>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <Fragment key={`${row.group}|${row.label}`}>
                {grouped && row.group !== rows[index - 1]?.group && (
                  <tr>
                    <Box
                      component="th"
                      scope="rowgroup"
                      colSpan={materials.length + 1}
                      sx={{ ...cellSx, pt: 2, border: 0 }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600 }}
                        component="span"
                      >
                        {row.group}
                      </Typography>
                    </Box>
                  </tr>
                )}
                <tr>
                  <Box component="th" scope="row" sx={cellSx}>
                    <Typography variant="body2" color="textSecondary">
                      {row.label}
                    </Typography>
                  </Box>
                  {row.values.map((value, column) => (
                    <Box
                      component="td"
                      key={materials[column].id}
                      sx={{ ...cellSx, ...wash(materials[column].id) }}
                    >
                      {value || "-"}
                    </Box>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </Box>
      </Box>
      <Button
        onClick={() =>
          navigate({
            to: "/materials/compare",
            search: { ids: serializeCompareIds(materials.map((m) => m.id)) },
          })
        }
        startIcon={<CompareIcon />}
        sx={{ minHeight: tokens.touch.min, mt: 0.5 }}
      >
        Compare sizes
      </Button>
    </Box>
  );
}
