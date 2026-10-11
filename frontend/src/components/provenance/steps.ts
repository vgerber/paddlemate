import type { HistoryChange, HistoryStep } from "@/lib/api";
import { humanize } from "@/lib/format";

/** The label of a changed field: "feature_type" reads "Type". */
export function fieldLabel(field: string): string {
  const words = FIELD_WORDS[field] ?? humanize(field);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const FIELD_WORDS: Record<string, string> = {
  location: "Position",
  feature_type: "Type",
};

/** Geometry changes carry no values; the line says the position moved. */
export function isGeometryChange(change: HistoryChange): boolean {
  return change.before == null && change.after == null;
}

export const ORIGIN_UNKNOWN = "Origin not recorded";

/** What a step says happened; who did it is the by-line's business. An
 * origin step that records no source says so. */
export function stepHeadline(step: HistoryStep): string {
  switch (step.kind) {
    case "imported": {
      const from = step.source?.short_name || step.source?.name;
      return from ? `Imported from ${from}` : ORIGIN_UNKNOWN;
    }
    case "created":
      return step.actor ? "Added" : ORIGIN_UNKNOWN;
    case "proposal_accepted":
    case "edited":
      return "Changed";
    case "deleted":
      return "Deleted";
  }
}

/** A piece of a by-line; names are set apart from the words around them. */
export interface BylinePart {
  text: string;
  name?: boolean;
}

/** Who did it, the way a reader says it: "Proposed by vincent, approved by
 * anna" for a proposal, "by vincent" for a direct edit, nothing for an
 * import. */
export function stepByline(step: HistoryStep): BylinePart[] {
  const actor = step.actor?.username;
  const reviewer = step.reviewer?.username;
  if (step.proposal_id != null && actor) {
    const parts: BylinePart[] = [
      { text: "Proposed by " },
      { text: actor, name: true },
    ];
    if (reviewer) {
      parts.push({ text: ", approved by " }, { text: reviewer, name: true });
    }
    return parts;
  }
  if (step.proposal_id != null && reviewer) {
    return [{ text: "Approved by " }, { text: reviewer, name: true }];
  }
  if (actor) return [{ text: "by " }, { text: actor, name: true }];
  return [];
}

/** Fields whose values are enum names ("rapid"), shown as words. */
const ENUM_FIELDS = new Set(["feature_type"]);

/** A change value as a reader says it: "rapid" reads "Rapid". */
export function changeValue(field: string, value: string): string {
  if (!ENUM_FIELDS.has(field)) return value;
  const words = humanize(value);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Steps oldest first, as the API sends them; a re-sort guards a page that
 * arrives merged from two requests. */
export function inOrder(steps: HistoryStep[]): HistoryStep[] {
  return [...steps].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id,
  );
}
