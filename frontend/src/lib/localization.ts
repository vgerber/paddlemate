/**
 * Pick the right localized text for the language the user reads, falling back
 * to the entity's own text. Sections and features both carry
 * `names`/`descriptions` arrays with `lang_code` entries.
 */

import { preferredLanguage } from "./languagePreference";

interface LocalizedNameEntry {
  lang_code: string;
  name: string;
}

interface LocalizedDescriptionEntry {
  lang_code: string;
  description: string;
}

/**
 * Exact match first, then a regional variant of the same language, so a "de-AT"
 * translation still serves a reader who chose German.
 *
 * There is deliberately no "try English" or "take the first translation" step:
 * the fallback the caller passes is the name the section was created with,
 * usually the local name of the river, which is more useful than an arbitrary
 * translation - and the stored order of translations is not defined.
 */
function pickLocalized<T extends { lang_code: string }>(
  entries: T[] | null | undefined,
): T | undefined {
  if (!entries?.length) return undefined;
  const preferred = preferredLanguage();

  const exact = entries.find(
    (entry) => entry.lang_code.toLowerCase() === preferred,
  );
  if (exact) return exact;

  return entries.find(
    (entry) => entry.lang_code.toLowerCase().split("-")[0] === preferred,
  );
}

export function localizedName(
  fallback: string,
  names?: LocalizedNameEntry[] | null,
): string {
  return pickLocalized(names)?.name ?? fallback;
}

export function localizedDescription(
  fallback: string | null | undefined,
  descriptions?: LocalizedDescriptionEntry[] | null,
): string | null {
  return pickLocalized(descriptions)?.description ?? fallback ?? null;
}
