import Box from "@mui/material/Box";
import Fact from "@/components/Fact";
import { humanize, sentenceCase } from "@/lib/format";
import { CREATE_HIDDEN_KEYS, isDisplayable, shortValue } from "@/lib/proposals";

/** Fields whose value names a kind and reads as a word ("Rapid"). */
const KIND_KEYS = new Set(["feature_type"]);

/** The displayable proposed fields of a create proposal as labelled facts.
 * Metadata is flattened into one fact per entry ("Difficulty III"). The
 * description is the detail pane's own row, so it is not repeated here. */
export default function ProposalCreateSummary({
  proposed,
}: {
  proposed: Record<string, unknown>;
}) {
  const facts: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(proposed)) {
    if (CREATE_HIDDEN_KEYS.has(k) || k === "description" || !isDisplayable(v)) {
      continue;
    }
    if (k === "metadata" && typeof v === "object" && !Array.isArray(v)) {
      for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) {
        if (isDisplayable(mv) && typeof mv !== "object") {
          facts.push({ label: humanize(mk), value: String(mv) });
        }
      }
      continue;
    }
    const text = shortValue(k, v);
    facts.push({
      label: humanize(k),
      value: KIND_KEYS.has(k) ? humanize(text) : text,
    });
  }
  if (facts.length === 0) return null;

  return (
    <Box
      data-testid="create-facts"
      sx={{ display: "flex", flexWrap: "wrap", columnGap: 3, rowGap: 1.5 }}
    >
      {facts.map(({ label, value }) => (
        <Fact
          key={label}
          label={sentenceCase(label)}
          value={sentenceCase(value)}
        />
      ))}
    </Box>
  );
}
