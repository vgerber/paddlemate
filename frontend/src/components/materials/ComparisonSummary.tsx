import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import { labelSx } from "@/lib/theme/theme";
import { ruleSx } from "./comparisonLayout";

/** What all the picked entries share, and a note when kinds are mixed, in a
 * card of their own. Nothing when there is neither. */
export default function ComparisonSummary({
  alike,
  count,
  mixed,
}: {
  alike: string[];
  count: number;
  mixed: boolean;
}) {
  if (alike.length === 0 && !mixed) return null;
  return (
    <Box sx={{ ...phoneCardSx, mb: 1, overflow: "hidden" }}>
      {alike.length > 0 && (
        <Box
          data-testid="compare-alike"
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 0.75,
            px: 1.5,
            py: 1.25,
            borderBottom: ruleSx,
          }}
        >
          <Typography sx={{ ...labelSx, mr: 0.5 }}>
            Alike in all {count}
          </Typography>
          {alike.map((chip) => (
            <Chip key={chip} label={chip} />
          ))}
        </Box>
      )}
      {mixed && (
        <Typography
          data-testid="compare-mixed-note"
          variant="body2"
          color="textSecondary"
          sx={{ px: 1.5, py: 1.25 }}
        >
          Different kinds are picked, so only rows shared by two or more entries
          are compared.
        </Typography>
      )}
    </Box>
  );
}
