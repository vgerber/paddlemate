import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { fieldLabel } from "@/components/provenance/steps";
import { diffObjects, isEmptyValue, shortValue } from "@/lib/proposals";
import { labelSx, theme } from "@/lib/theme";
import { DIFF_HIDDEN_KEYS } from "./status";

const { tokens } = theme;

const rowSx = { fontSize: "0.8125rem", lineHeight: "18px" } as const;
const headSx = { ...labelSx, color: "text.secondary" } as const;

/** An update as a Before / After table, one row per field: the old value
 * struck through, the new one in the accent. A value that was not there reads
 * "none" before ("not recorded" when the snapshot lacks the field), one that is gone "removed" after. Renders nothing when the
 * visible fields are unchanged. */
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
      data-testid="diff-table"
      sx={{
        display: "grid",
        gridTemplateColumns: "76px minmax(0, 1fr) minmax(0, 1fr)",
        columnGap: 1.5,
        rowGap: 1,
      }}
    >
      <Box sx={{ display: "contents" }}>
        <span />
        <Typography sx={headSx}>Before</Typography>
        <Typography sx={headSx}>After</Typography>
      </Box>
      {diffs.map(({ key, from, to, known }) => {
        const added = isEmptyValue(from);
        const removed = isEmptyValue(to);
        return (
          <Box key={key} data-testid="diff-row" sx={{ display: "contents" }}>
            <Typography
              data-testid="diff-key"
              sx={{
                ...rowSx,
                color: "text.secondary",
                overflowWrap: "anywhere",
              }}
            >
              {fieldLabel(key)}
            </Typography>
            {added ? (
              <Typography
                data-testid="diff-note"
                sx={{ ...rowSx, color: "text.secondary" }}
              >
                {known ? "none" : "not recorded"}
              </Typography>
            ) : (
              <Typography
                data-testid="diff-before"
                sx={{
                  ...rowSx,
                  color: "text.secondary",
                  textDecoration: "line-through",
                  overflowWrap: "anywhere",
                }}
              >
                {shortValue(key, from)}
              </Typography>
            )}
            {removed ? (
              <Typography
                data-testid="diff-note"
                sx={{ ...rowSx, color: "text.secondary" }}
              >
                removed
              </Typography>
            ) : (
              <Typography
                data-testid="diff-after"
                sx={{
                  ...rowSx,
                  color: tokens.primary,
                  fontWeight: 600,
                  overflowWrap: "anywhere",
                }}
              >
                {shortValue(key, to)}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
