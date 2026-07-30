import { describe, expect, test } from "bun:test";
import { searchKey } from "./text";

/**
 * These pairs are the contract shared with the SQL side: the same inputs and
 * expected keys live in api/tests/sql/search_key_assertions.sql, which CI runs
 * against a real database. If a case changes on one side it must change on the
 * other, or names typed in the browser stop matching the rows they are stored
 * as.
 */
const CASES: [string, string][] = [
  // diacritics stripped
  ["Ötztaler Ache", "otztaler ache"],
  ["Soča", "soca"],
  ["Isère", "isere"],
  // single code points that NFD leaves whole
  ["Weißenbach", "weisenbach"],
  ["Wisła", "wisla"],
  ["Ægir", "agir"],
  ["Þjórsá", "thjorsa"],
  ["Đakovo", "dakovo"],
  // digraph spellings fold onto the same key as the diacritic spelling
  ["Oetztaler", "otztaler"],
  ["Muenster", "munster"],
  ["Weissenbach", "weisenbach"],
  // non-Latin scripts are lower-cased only, never stripped
  ["Ока", "ока"],
  // punctuation and spacing are left alone
  ["Saint-Jean", "saint-jean"],
];

describe("searchKey agrees with SQL search_key", () => {
  for (const [input, expected] of CASES) {
    test(`${input} -> ${expected}`, () => {
      expect(searchKey(input)).toBe(expected);
    });
  }
});

test("both spellings of a name share one key", () => {
  expect(searchKey("Weißenbach")).toBe(searchKey("Weissenbach"));
  expect(searchKey("Ötztaler")).toBe(searchKey("Oetztaler"));
});
