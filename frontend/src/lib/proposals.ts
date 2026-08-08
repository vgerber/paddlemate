import type { Proposal, ProposalStatus } from "@/lib/api";
import { humanize } from "@/lib/format";

export const STATUS_COLOR: Record<
  ProposalStatus,
  "default" | "warning" | "success" | "error"
> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
};

export const OP_LABEL: Record<string, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
};

export const ENTITY_LABEL: Record<string, string> = {
  waterway: "River",
  water_section: "Section",
  feature: "Feature",
};

export const HIDDEN_KEYS = new Set(["geometry", "water_ranges", "location"]);

/** Additionally hidden on create cards: internal ids, the name (it is the
 * card title already) and per-entity plumbing fields. */
export const CREATE_HIDDEN_KEYS = new Set([
  ...HIDDEN_KEYS,
  "name",
  "waterway_id",
  "section_id",
  "feature_id",
  "lang_code",
]);

/** Skip values that would render as noise ("-", "{}", "[]"). */
export function isDisplayable(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

export function diffObjects(
  original: Record<string, unknown>,
  proposed: Record<string, unknown>,
): Array<{ key: string; from: unknown; to: unknown }> {
  const keys = new Set([...Object.keys(original), ...Object.keys(proposed)]);
  const diffs: Array<{ key: string; from: unknown; to: unknown }> = [];
  for (const key of keys) {
    if (JSON.stringify(original[key]) !== JSON.stringify(proposed[key])) {
      diffs.push({ key, from: original[key], to: proposed[key] });
    }
  }
  return diffs;
}

export function shortValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "-";
  // Features bundled with a new-section proposal: summarize instead of JSON
  if (key === "features" && Array.isArray(v)) {
    return v
      .map((f) => {
        const feature = f as {
          feature_type?: string;
          name?: string | null;
          metadata?: { difficulty?: string };
        };
        const type = humanize(feature.feature_type ?? "feature");
        const extra = feature.name || feature.metadata?.difficulty;
        return extra ? `${type} (${extra})` : type;
      })
      .join(", ");
  }
  // Localized names/descriptions: list the languages, not the JSON
  if (key === "translations" && Array.isArray(v)) {
    return v
      .map((t) =>
        ((t as { lang_code?: string }).lang_code ?? "?").toUpperCase(),
      )
      .join(", ");
  }
  // Feature metadata: show simple entries like "difficulty III+"
  if (key === "metadata" && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, value]) => typeof value !== "object")
      .map(([k, value]) => `${humanize(k)} ${String(value)}`);
    if (entries.length > 0) return entries.join(", ");
  }
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  return JSON.stringify(v).slice(0, 80);
}

/** Best human-readable headline for a proposal. */
export function proposalTitle(proposal: Proposal): string {
  const proposed = (proposal.proposed_data ?? {}) as Record<string, unknown>;
  const original = (proposal.original_data ?? {}) as Record<string, unknown>;
  const name = (proposed.name ?? original.name) as string | undefined;
  if (name) return name;
  const featureType = (proposed.feature_type ?? original.feature_type) as
    | string
    | undefined;
  if (featureType) return humanize(featureType);
  return ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type;
}
