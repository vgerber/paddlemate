/**
 * Pick the right localized text for the user's browser language, falling
 * back to the entity's default text. Sections and features both carry
 * `names`/`descriptions` arrays with `lang_code` entries.
 */

interface LocalizedNameEntry {
  lang_code: string;
  name: string;
}

interface LocalizedDescriptionEntry {
  lang_code: string;
  description: string;
}

/** Languages offered for localized names/descriptions across the app. */
export const LANGUAGE_CODES = [
  "en",
  "de",
  "fr",
  "cs",
  "sk",
  "pl",
  "sl",
  "hr",
  "it",
  "es",
  "pt",
];

// Computed once — called per list item during rendering
const browserLanguage = (navigator.language || "en").slice(0, 2).toLowerCase();

/** Two-letter language code the browser prefers, e.g. "de". */
export function preferredLanguage(): string {
  return browserLanguage;
}

export function localizedName(
  fallback: string,
  names?: LocalizedNameEntry[] | null,
): string {
  const match = names?.find((n) => n.lang_code === preferredLanguage());
  return match?.name ?? fallback;
}

export function localizedDescription(
  fallback: string | null | undefined,
  descriptions?: LocalizedDescriptionEntry[] | null,
): string | null {
  const match = descriptions?.find((d) => d.lang_code === preferredLanguage());
  return match?.description ?? fallback ?? null;
}
