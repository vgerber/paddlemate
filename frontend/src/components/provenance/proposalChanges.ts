import type { HistoryChange, Proposal } from "@/lib/api";
import { diffObjects, shortValue } from "@/lib/proposals";
import { DIFF_HIDDEN_KEYS } from "../proposals/status";

const GEOMETRY_KEYS = new Set(["geometry", "location"]);

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** What a proposal would change, in the same shape as a stored step: field
 * values as short strings, a moved geometry as a valueless position change. */
export function proposalChanges(proposal: Proposal): HistoryChange[] {
  if (proposal.operation !== "update") return [];
  const diffs = diffObjects(
    asRecord(proposal.original_data),
    asRecord(proposal.proposed_data),
  );
  const changes: HistoryChange[] = [];
  let moved = false;
  for (const { key, from, to } of diffs) {
    if (GEOMETRY_KEYS.has(key)) {
      moved = true;
    } else if (!DIFF_HIDDEN_KEYS.has(key)) {
      changes.push({
        field: key,
        before: from == null ? null : shortValue(key, from),
        after: to == null ? null : shortValue(key, to),
      });
    }
  }
  if (moved) changes.push({ field: "location", before: null, after: null });
  return changes;
}
