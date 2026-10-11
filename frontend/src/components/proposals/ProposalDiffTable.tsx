import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { fieldLabel } from "@/components/provenance/steps";
import { diffObjects, isEmptyValue, shortValue } from "@/lib/proposals";
import { DIFF_HIDDEN_KEYS } from "./status";

const rowSx = { fontSize: "0.8125rem", lineHeight: "18px" } as const;

/** An update as rows, one per field: the field, the old value struck
 * through and the new one after an arrow. A value that was not there reads
 * "added", one that is gone "removed". Renders nothing when the visible
 * fields are unchanged. */
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
        display: "grid",
        gridTemplateColumns: "76px minmax(0, 1fr)",
        columnGap: 1.5,
        rowGap: 1,
      }}
    >
      {diffs.map(({ key, from, to }) => {
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
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                columnGap: 1,
              }}
            >
              {!added && (
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
              {!added && !removed && (
                <Typography
                  sx={{ ...rowSx, color: "text.secondary" }}
                  aria-hidden
                >
                  →
                </Typography>
              )}
              {!removed && (
                <Typography
                  data-testid="diff-after"
                  sx={{ ...rowSx, overflowWrap: "anywhere" }}
                >
                  {shortValue(key, to)}
                </Typography>
              )}
              {(added || removed) && (
                <Typography
                  data-testid="diff-note"
                  sx={{ ...rowSx, color: "text.secondary" }}
                >
                  {added ? "added" : "removed"}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
