import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { CompareRow } from "@/lib/materials/compare";
import ComparisonBar from "./ComparisonBar";
import { labelCellSx, rowSx, ruleSx } from "./comparisonLayout";

/** One row of the table: its label and a value per entry, with a bar under
 * the numbers that differ. */
export default function ComparisonRow({
  row,
  columns,
}: {
  row: CompareRow;
  columns: string;
}) {
  return (
    <Box
      role="row"
      data-testid="compare-row"
      data-row={row.key}
      sx={{ ...rowSx(columns), borderBottom: ruleSx }}
    >
      <Box role="rowheader" sx={labelCellSx}>
        <Typography variant="body2" color="textSecondary">
          {row.label}
        </Typography>
      </Box>
      {row.cells.map((cell, index) => (
        <Box
          key={index}
          role="cell"
          sx={{ minWidth: 0, pt: { xs: 0, md: 1.25 }, pb: 1.25 }}
        >
          <Typography
            sx={{
              fontSize: "0.9375rem",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              overflowWrap: "anywhere",
            }}
          >
            {cell ?? "-"}
          </Typography>
          {row.bars?.[index] != null && (
            <ComparisonBar ratio={row.bars[index]} />
          )}
        </Box>
      ))}
    </Box>
  );
}
