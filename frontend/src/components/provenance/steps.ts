import type { HistoryChange, HistoryStep } from "@/lib/api";
import { humanize } from "@/lib/format";

/** The label of a changed field: "feature_type" reads "Feature type". */
export function fieldLabel(field: string): string {
  const words = FIELD_WORDS[field] ?? humanize(field);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const FIELD_WORDS: Record<string, string> = {
  location: "Position",
};

/** Geometry changes carry no values; the line says the position moved. */
export function isGeometryChange(change: HistoryChange): boolean {
  return change.before == null && change.after == null;
}

/** What a step says happened, before the who and when. */
export function stepHeadline(step: HistoryStep): string {
  switch (step.kind) {
    case "imported":
      return `Imported from ${step.source?.short_name || step.source?.name || "a public source"}`;
    case "created":
      return step.actor ? `Added by ${step.actor.username}` : "Added";
    case "proposal_accepted":
      return step.actor ? `Changed by ${step.actor.username}` : "Changed";
    case "edited":
      return step.actor ? `Changed by ${step.actor.username}` : "Changed";
    case "deleted":
      return step.actor ? `Deleted by ${step.actor.username}` : "Deleted";
  }
}

/** The second line: who approved the proposal behind the step, a deletion
included. */
export function stepByline(step: HistoryStep): string | null {
  if (step.proposal_id != null && step.reviewer) {
    return `approved by ${step.reviewer.username}`;
  }
  return null;
}

/** Steps oldest first, as the API sends them; a re-sort guards a page that
 * arrives merged from two requests. */
export function inOrder(steps: HistoryStep[]): HistoryStep[] {
  return [...steps].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id,
  );
}
