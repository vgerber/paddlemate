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

/** Two-letter language code the browser prefers, e.g. "de". */
export function preferredLanguage(): string {
  return (navigator.language || "en").slice(0, 2).toLowerCase();
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
  const match = descriptions?.find(
    (d) => d.lang_code === preferredLanguage(),
  );
  return match?.description ?? fallback ?? null;
}
