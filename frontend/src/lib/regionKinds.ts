const KIND_WORDS: Record<string, string> = {
  valley: "valleys",
  district: "districts",
  range: "mountain ranges",
  state: "states",
};

const ALL_KINDS = Object.keys(KIND_WORDS);

/** What the map says when the view is too wide for some region kinds:
 * "districts", "valleys and districts", or "regions" when every kind is
 * hidden. */
export function hiddenKindsLabel(kinds: string[]): string {
  if (ALL_KINDS.every((k) => kinds.includes(k))) return "regions";
  const words = kinds.map((k) => KIND_WORDS[k] ?? k);
  return new Intl.ListFormat("en", { type: "conjunction" }).format(words);
}
