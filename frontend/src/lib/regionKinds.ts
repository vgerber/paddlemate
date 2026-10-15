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
}[] = [
  { kind: "valley", label: "Valleys", word: "valleys" },
  { kind: "district", label: "Districts", word: "districts" },
  { kind: "range", label: "Mountain ranges", word: "mountain ranges" },
  { kind: "state", label: "States", word: "states" },
];

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
