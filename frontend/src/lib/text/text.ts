/**
 * Normalize a name the same way the database does, so client-side ordering
 * agrees with what the server matched.
 *
 * Mirrors `public.search_key` in migration 00023: strip diacritics, lower
 * case, then fold the German digraphs so "oetztaler" and "otztaler" agree.
 * The server stays authoritative - exact parity with Postgres's unaccent
 * rules is not achievable in the browser, and is not needed because this is
 * only ever used to sort or to filter data the server never saw.
 */

/**
 * Letters NFD leaves alone, because they are single code points rather than a
 * base letter plus a combining mark. Postgres strips these through
 * unaccent.rules; the browser needs to be told.
 */
const SINGLE_CODE_POINT_LETTERS: Record<string, string> = {
  ß: "ss",
  ł: "l",
  đ: "d",
  ø: "o",
  æ: "ae",
  œ: "oe",
  þ: "th",
  ð: "d",
  ı: "i",
};

const SPECIAL_LETTERS = new RegExp(
  `[${Object.keys(SINGLE_CODE_POINT_LETTERS).join("")}]`,
  "g",
);

const COMBINING_MARKS = /[̀-ͯ]/g;

/** German digraphs, folded so that "oetztaler" and "otztaler" agree. Order
 * matters: "ss" runs first so the expansions above fold too. */
const DIGRAPHS: [RegExp, string][] = [
  [/ss/g, "s"],
  [/oe/g, "o"],
  [/ue/g, "u"],
  [/ae/g, "a"],
];

export function searchKey(str: string): string {
  const stripped = str
    .toLowerCase()
    .replace(SPECIAL_LETTERS, (c) => SINGLE_CODE_POINT_LETTERS[c] ?? c)
    .normalize("NFD")
    .replace(COMBINING_MARKS, "");

  return DIGRAPHS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    stripped,
  );
}
