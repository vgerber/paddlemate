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
  language: string,
): T | undefined {
  if (!entries?.length) return undefined;

  const exact = entries.find(
    (entry) => entry.lang_code.toLowerCase() === language,
  );
  if (exact) return exact;

  return entries.find(
    (entry) => entry.lang_code.toLowerCase().split("-")[0] === language,
  );
}

/**
 * Pass `language` when the result is cached - in a memo, or in a module that
 * builds map data - so the cache has something to key on. Callers that render
 * directly can leave it out and take the current preference.
 */
export function localizedName(
  fallback: string,
  names?: LocalizedNameEntry[] | null,
  language: string = preferredLanguage(),
): string {
  return pickLocalized(names, language)?.name ?? fallback;
}

export function localizedDescription(
  fallback: string | null | undefined,
  descriptions?: LocalizedDescriptionEntry[] | null,
  language: string = preferredLanguage(),
): string | null {
  return pickLocalized(descriptions, language)?.description ?? fallback ?? null;
}
