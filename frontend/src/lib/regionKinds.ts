import type { components } from "@/lib/api/schema";

/** The kinds a map view or a search can browse, smallest first: what a
 * paddler names a place by. A country is the ground they all sit in. */
export type BrowseKind = Exclude<
  components["schemas"]["RegionKind"],
  "country"
>;

export const REGION_KINDS: readonly {
  kind: BrowseKind;
  /** Heading of the kind: "Valleys". */
  label: string;
  /** The kind in running text: "mountain ranges". */
  word: string;
  /** One of the kind, for a hint or a tag: "mountain range". */
  singular: string;
  /** The segment label, short enough for four across a 320 px phone. */
  short: string;
}[] = [
  {
    kind: "valley",
    label: "Valleys",
    word: "valleys",
    singular: "valley",
    short: "Valleys",
  },
  {
    kind: "district",
    label: "Districts",
    word: "districts",
    singular: "district",
    short: "Districts",
  },
  {
    kind: "range",
    label: "Mountain ranges",
    word: "mountain ranges",
    singular: "mountain range",
    short: "Ranges",
  },
  {
    kind: "state",
    label: "States",
    word: "states",
    singular: "state",
    short: "States",
  },
];

/** The kind the map draws while nobody has chosen one: states from a country
 * view, districts for a region, valleys from river level. `span` is the
 * longer side of the view in degrees, as the API measures it. Ranges hold
 * each other, so they are asked for, never a default. */
export function kindForSpan(span: number): BrowseKind {
  if (span >= 4) return "state";
  if (span >= 0.8) return "district";
  return "valley";
}

/** A kind in running text, singular: "district". */
export function regionKindSingular(kind: string): string {
  return REGION_KINDS.find((k) => k.kind === kind)?.singular ?? kind;
}

export const ALL_REGION_KINDS: BrowseKind[] = REGION_KINDS.map((k) => k.kind);

/** The heading of a kind ("Valleys"), or undefined for one the map does not
 * browse. */
export function regionKindLabel(kind: string): string | undefined {
  return REGION_KINDS.find((k) => k.kind === kind)?.label;
}

/** What the map says when the view is too wide for some region kinds:
 * "districts", "valleys and districts", or "regions" when every kind is
 * hidden. */
export function hiddenKindsLabel(kinds: string[]): string {
  if (ALL_REGION_KINDS.every((k) => kinds.includes(k))) return "regions";
  const words = kinds.map(
    (k) => REGION_KINDS.find((r) => r.kind === k)?.word ?? k,
  );
  return new Intl.ListFormat("en", { type: "conjunction" }).format(words);
}
