/**
 * The languages a name or description can be written in.
 *
 * The codes have to be bundled: no browser API enumerates languages
 * (`Intl.supportedValuesOf` covers calendars, currencies and time zones, but
 * not languages). Unlike a curated list this is the complete ISO 639-1 set, so
 * it is a data table rather than a judgement about which languages matter.
 * Display names come from `Intl.DisplayNames`, so nothing here needs
 * translating by hand.
 */

const ISO_639_1_CODES: readonly string[] = [
  "aa",
  "ab",
  "ae",
  "af",
  "ak",
  "am",
  "an",
  "ar",
  "as",
  "av",
  "ay",
  "az",
  "ba",
  "be",
  "bg",
  "bi",
  "bm",
  "bn",
  "bo",
  "br",
  "bs",
  "ca",
  "ce",
  "ch",
  "co",
  "cr",
  "cs",
  "cu",
  "cv",
  "cy",
  "da",
  "de",
  "dv",
  "dz",
  "ee",
  "el",
  "en",
  "eo",
  "es",
  "et",
  "eu",
  "fa",
  "ff",
  "fi",
  "fj",
  "fo",
  "fr",
  "fy",
  "ga",
  "gd",
  "gl",
  "gn",
  "gu",
  "gv",
  "ha",
  "he",
  "hi",
  "ho",
  "hr",
  "ht",
  "hu",
  "hy",
  "hz",
  "ia",
  "id",
  "ie",
  "ig",
  "ii",
  "ik",
  "io",
  "is",
  "it",
  "iu",
  "ja",
  "jv",
  "ka",
  "kg",
  "ki",
  "kj",
  "kk",
  "kl",
  "km",
  "kn",
  "ko",
  "kr",
  "ks",
  "ku",
  "kv",
  "kw",
  "ky",
  "la",
  "lb",
  "lg",
  "li",
  "ln",
  "lo",
  "lt",
  "lu",
  "lv",
  "mg",
  "mh",
  "mi",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "mt",
  "my",
  "na",
  "nb",
  "nd",
  "ne",
  "ng",
  "nl",
  "nn",
  "no",
  "nr",
  "nv",
  "ny",
  "oc",
  "oj",
  "om",
  "or",
  "os",
  "pa",
  "pi",
  "pl",
  "ps",
  "pt",
  "qu",
  "rm",
  "rn",
  "ro",
  "ru",
  "rw",
  "sa",
  "sc",
  "sd",
  "se",
  "sg",
  "si",
  "sk",
  "sl",
  "sm",
  "sn",
  "so",
  "sq",
  "sr",
  "ss",
  "st",
  "su",
  "sv",
  "sw",
  "ta",
  "te",
  "tg",
  "th",
  "ti",
  "tk",
  "tl",
  "tn",
  "to",
  "tr",
  "ts",
  "tt",
  "tw",
  "ty",
  "ug",
  "uk",
  "ur",
  "uz",
  "ve",
  "vi",
  "vo",
  "wa",
  "wo",
  "xh",
  "yi",
  "yo",
  "za",
  "zh",
  "zu",
];

/**
 * Languages a paddler on this platform is most likely to need, shown above the
 * full list. Not a restriction - every language above stays selectable.
 */
const SUGGESTED_CODES: readonly string[] = [
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

export interface LanguageOption {
  code: string;
  /** The language named in itself, e.g. "Deutsch". */
  native: string;
  /** What the picker shows, e.g. "Deutsch (de)". */
  label: string;
  /** Lowercased haystack so both "deutsch" and "german" find German. */
  search: string;
  /** True while the option belongs in the suggested group. */
  suggested: boolean;
}

function displayName(code: string, inLanguage: string): string | undefined {
  try {
    const names = new Intl.DisplayNames([inLanguage], {
      type: "language",
      fallback: "code",
    });
    const name = names.of(code);
    // "of" returns the code itself when the runtime has no data for it.
    return name && name !== code ? name : undefined;
  } catch {
    // Intl throws a RangeError on a structurally invalid tag.
    return undefined;
  }
}

function buildOption(
  code: string,
  displayLanguage: string,
  suggested: boolean,
): LanguageOption {
  const native = displayName(code, code);
  const inDisplayLanguage = displayName(code, displayLanguage);
  const name = native ?? inDisplayLanguage ?? code;
  return {
    code,
    native: name,
    label: name === code ? code : `${name} (${code})`,
    search: [name, inDisplayLanguage, code]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    suggested,
  };
}

// Building ~180 Intl.DisplayNames instances is not free, so do it on first use
// rather than at import, and keep the result per display language.
const cache = new Map<string, LanguageOption[]>();

/** Every selectable language, suggested ones first, each group sorted by name. */
export function languageOptions(displayLanguage: string): LanguageOption[] {
  const cached = cache.get(displayLanguage);
  if (cached) return cached;

  const suggested = new Set(SUGGESTED_CODES);
  const collator = new Intl.Collator(displayLanguage, { sensitivity: "base" });
  const byName = (a: LanguageOption, b: LanguageOption) =>
    collator.compare(a.native, b.native);

  const options = [
    ...ISO_639_1_CODES.filter((c) => suggested.has(c))
      .map((c) => buildOption(c, displayLanguage, true))
      .sort(byName),
    ...ISO_639_1_CODES.filter((c) => !suggested.has(c))
      .map((c) => buildOption(c, displayLanguage, false))
      .sort(byName),
  ];

  cache.set(displayLanguage, options);
  return options;
}

/**
 * A single option for a code that may not be in the list, so that a value
 * already stored - a regional tag, or one written before this list existed -
 * still renders with a name instead of disappearing from the picker.
 */
export function languageOption(
  code: string,
  displayLanguage: string,
): LanguageOption {
  return (
    languageOptions(displayLanguage).find((o) => o.code === code) ??
    buildOption(code, displayLanguage, false)
  );
}

/** Whether a code is one this app knows how to offer. */
export function isKnownLanguage(code: string): boolean {
  return ISO_639_1_CODES.includes(code);
}
