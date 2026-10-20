import type { Feature, FeatureType, Proposal, ProposalStatus } from "@/lib/api";
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

/** A value in words, never JSON: lists as a comma list, objects as
 * "Label value" pairs, an empty value as "none". */
function plainValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "none";
  if (Array.isArray(v)) {
    return v.length === 0 ? "none" : v.map(plainValue).join(", ");
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return "none";
    return entries
      .map(([k, value]) => `${humanize(k)} ${plainValue(value)}`)
      .join(", ");
  }
  return String(v);
}

/** Nothing there: null, an empty string, list or object. */
export function isEmptyValue(v: unknown): boolean {
  return !isDisplayable(v);
}

export function shortValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "none";
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
  const text = plainValue(v);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
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

type Geometry = Feature["location"];

/** A feature as a proposal carries it: bundled in a section proposal, or the
 * proposal's own fields on a feature proposal. */
export interface ProposedFeatureData {
  feature_type: FeatureType;
  metadata?: Record<string, unknown> | null;
  location: Geometry;
  name?: string | null;
  description?: string | null;
  lang_code?: string | null;
  water_ranges?: Array<{ series_id: number }> | null;
}

export interface ProposedTranslation {
  lang_code: string;
  name?: string | null;
  description?: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isGeometry(v: unknown): v is Geometry {
  return isRecord(v) && typeof v.type === "string" && "coordinates" in v;
}

function isFeatureData(v: unknown): v is ProposedFeatureData {
  return (
    isRecord(v) && typeof v.feature_type === "string" && isGeometry(v.location)
  );
}

/** The untyped JSON of a proposal, as a record. */
export function proposalRecord(data: unknown): Record<string, unknown> {
  return isRecord(data) ? data : {};
}

/** The place a proposal puts something, if it carries one. */
export function proposedLocation(
  data: Record<string, unknown>,
): Geometry | undefined {
  return isGeometry(data.location) ? data.location : undefined;
}

/** Everything a proposal says about the features it adds: those bundled in a
 * section proposal, or the proposal's own fields when it is one feature. */
export function proposedFeatures(
  proposal: Pick<Proposal, "entity_type" | "proposed_data">,
): ProposedFeatureData[] {
  const data = proposalRecord(proposal.proposed_data);
  const bundled = Array.isArray(data.features)
    ? data.features.filter(isFeatureData)
    : [];
  const location = proposedLocation(data);
  if (proposal.entity_type !== "feature" || !location) return bundled;
  if (typeof data.feature_type !== "string") return bundled;
  const own: ProposedFeatureData = {
    feature_type: data.feature_type as FeatureType,
    metadata: isRecord(data.metadata) ? data.metadata : null,
    location,
    name: typeof data.name === "string" ? data.name : null,
    lang_code: typeof data.lang_code === "string" ? data.lang_code : null,
    water_ranges: Array.isArray(data.water_ranges)
      ? (data.water_ranges as ProposedFeatureData["water_ranges"])
      : null,
  };
  return [...bundled, own];
}

export function proposedTranslations(
  data: Record<string, unknown>,
): ProposedTranslation[] {
  if (!Array.isArray(data.translations)) return [];
  return data.translations.filter(
    (t): t is ProposedTranslation =>
      isRecord(t) && typeof t.lang_code === "string",
  );
}
