import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { fieldLabel } from "@/components/provenance/steps";
import { diffObjects, shortValue } from "@/lib/proposals";
import { labelSx, theme } from "@/lib/theme";
import { DIFF_HIDDEN_KEYS } from "./status";

const { tokens } = theme;

/** An update as rows: the field, what it was, what it becomes. Renders
 * nothing when the visible fields are unchanged. */
export default function ProposalDiffTable({
  original,
  proposed,
}: {
  original: Record<string, unknown>;
  proposed: Record<string, unknown>;
}) {
  const diffs = diffObjects(original, proposed).filter(
    ({ key }) => !DIFF_HIDDEN_KEYS.has(key),
  );
  if (diffs.length === 0) return null;

  return (
    <Box
      sx={{
        bgcolor: tokens.surfaceHigh,
        borderRadius: `${tokens.radii.sm}px`,
        px: 1.5,
        py: 0.5,
      }}
    >
      {diffs.map(({ key, from, to }) => (
        <Box
          key={key}
          data-testid="diff-row"
          sx={{
            py: 1,
            "&:not(:last-of-type)": {
              borderBottom: "1px solid",
              borderColor: `${tokens.outlineVariant}55`,
            },
          }}
        >
          <Typography sx={labelSx}>{fieldLabel(key)}</Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              columnGap: 1,
            }}
          >
            <Typography
              data-testid="diff-before"
              variant="body2"
              sx={{
                color: "text.disabled",
                textDecoration: "line-through",
                overflowWrap: "anywhere",
              }}
            >
              {shortValue(key, from)}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "text.disabled" }}
              aria-hidden
            >
              to
            </Typography>
            <Typography
              data-testid="diff-after"
              variant="body2"
              sx={{ overflowWrap: "anywhere" }}
            >
              {shortValue(key, to)}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
