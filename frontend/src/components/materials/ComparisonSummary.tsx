import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import { AddIcon } from "@/lib/icons";
import { MAX_COMPARE } from "@/lib/materials/compare";
import { labelSx, theme } from "@/lib/theme/theme";
import { ruleSx } from "./comparisonLayout";

const { tokens } = theme;

/** The picked entries in a card of their own: what all of them share, the way
 * to add more, and a note when kinds are mixed. */
export default function ComparisonSummary({
  alike,
  count,
  mixed,
  onAdd,
}: {
  alike: string[];
  count: number;
  mixed: boolean;
  onAdd: () => void;
}) {
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
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 0.5,
        }}
      >
        <Button
          startIcon={<AddIcon />}
          disabled={count >= MAX_COMPARE}
          onClick={onAdd}
          sx={{ minHeight: tokens.touch.min }}
        >
          Add to comparison
        </Button>
        <Typography
          variant="body2"
          color="textSecondary"
          sx={{ pr: 1.5, fontWeight: 600 }}
        >
          {count} of {MAX_COMPARE}
        </Typography>
      </Box>
      {mixed && (
        <Typography
          data-testid="compare-mixed-note"
          variant="body2"
          color="textSecondary"
          sx={{ px: 1.5, pb: 1.25 }}
        >
          Different kinds are picked, so only rows shared by two or more entries
          are compared.
        </Typography>
      )}
    </Box>
  );
}
