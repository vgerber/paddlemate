import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import type { Material } from "@/lib/api";
import { CompareIcon } from "@/lib/icons";
import { serializeCompareIds } from "@/lib/materials/compare";
import { paddlerRangeLabel } from "@/lib/materials/facts";
import { formatSpec, MATERIAL_SPECS, specValue } from "@/lib/materials/specs";
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
  borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
} as const;

const TABLE_KEYS: readonly string[] = ["length_cm", "volume_l", "weight_kg"];

/** Every size of a model side by side, the picked one marked, with the way
 * into the full comparison of them. Scrolls inside its own box. */
export default function AllSizesTable({
  materials,
  pickedId,
}: {
  materials: Material[];
  pickedId: number;
}) {
  const [units] = useUnits();
  const navigate = useNavigate();
  const rows = MATERIAL_SPECS.filter(
    (spec) =>
      TABLE_KEYS.includes(spec.key) &&
      materials.some((material) => specValue(material, spec.key) != null),
  );
  const paddler = materials.map((material) =>
    paddlerRangeLabel(material, units),
  );
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
          sx={{ borderCollapse: "collapse", width: "100%" }}
        >
          <thead>
            <tr>
              <Box component="td" sx={cellSx}>
                <Typography variant="body2" color="textSecondary">
                  Measure
                </Typography>
              </Box>
              {materials.map((material) => (
                <Box
                  component="th"
                  scope="col"
                  key={material.id}
                  aria-current={material.id === pickedId ? "true" : undefined}
                  sx={{
                    ...cellSx,
                    fontWeight: 600,
                    color:
                      material.id === pickedId ? tokens.primary : undefined,
                  }}
                >
                  {material.size ?? "-"}
                </Box>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <Box component="th" scope="row" sx={cellSx}>
                  <Typography variant="body2" color="textSecondary">
                    {row.label}
                  </Typography>
                </Box>
                {materials.map((material) => (
                  <Box component="td" key={material.id} sx={cellSx}>
                    {formatSpec(specValue(material, row.key), row, units)}
                  </Box>
                ))}
              </tr>
            ))}
            {paddler.some(Boolean) && (
              <tr>
                <Box component="th" scope="row" sx={cellSx}>
                  <Typography variant="body2" color="textSecondary">
                    Paddler
                  </Typography>
                </Box>
                {paddler.map((label, index) => (
                  <Box component="td" key={materials[index].id} sx={cellSx}>
                    {label || "-"}
                  </Box>
                ))}
              </tr>
            )}
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
