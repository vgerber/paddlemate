/**
 * Which part of a section matched a search term.
 *
 * The search endpoint returns waterways, not sections, so the section list
 * works this out locally. Shared so that the ordering in the search panel and
 * the reason shown on each row can never disagree.
 */

import type { SectionWithFeatures } from "@/lib/api";
import { localizedName } from "@/lib/localization";
import { searchKey } from "@/lib/text";

/** Name of the first rapid in the section whose name matches, if any. */
export function matchedFeatureName(
  section: SectionWithFeatures,
  query: string,
): string | undefined {
  const q = searchKey(query.trim());
  if (!q) return undefined;

  for (const feature of section.features ?? []) {
    const matched = (feature.names ?? []).find((n) =>
      searchKey(n.name).includes(q),
    );
    if (matched) {
      // Show the name in the reader's language, even though a translation in
      // another language is what matched.
      return localizedName(matched.name, feature.names);
    }
  }
  return undefined;
}

/** Whether anything about the section matches - its name, a translation of it,
 * the river it belongs to, or one of its rapids. */
export function sectionMatches(
  section: SectionWithFeatures,
  query: string,
  waterwayName?: string,
): boolean {
  const q = searchKey(query.trim());
  if (!q) return false;

  const names = [
    section.name,
    ...(section.names ?? []).map((n) => n.name),
    waterwayName ?? "",
  ];
  return (
    names.some((name) => name && searchKey(name).includes(q)) ||
    matchedFeatureName(section, query) !== undefined
  );
}
