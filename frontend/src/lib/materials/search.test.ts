import { describe, expect, test } from "bun:test";
import {
  activeFilterCount,
  parseMaterialSearch,
  SORT_LABELS,
  SORTS,
  searchText,
  toMaterialFilters,
} from "./search";
import { treeFilters } from "./tree";

describe("searchText", () => {
  test("a number read from the URL is the text it was typed as", () => {
    expect(searchText(2000)).toBe("2000");
    expect(parseMaterialSearch({ q: 9853, compare: 9853 })).toMatchObject({
      q: "9853",
      compare: "9853",
    });
    expect(searchText("  ")).toBeUndefined();
  });
});

describe("the URL and the API parameters", () => {
  test("every filter the URL holds reaches the API under its own name", () => {
    const search = parseMaterialSearch({
      q: "storm",
      category: "kayak",
      discipline: "creek",
      construction: "plastic",
      brand: "Pyranha",
      sort: "newest",
      fits: "82.5",
      compare: "1,2",
    });
    expect(toMaterialFilters(search)).toEqual({
      q: "storm",
      category: "kayak",
      discipline: "creek",
      construction: "plastic",
      brand: "Pyranha",
      sort: "newest",
      fits_paddler_kg: 82.5,
    });
  });

  test("unknown or hand-edited values read as no filter", () => {
    const search = parseMaterialSearch({
      category: "boat",
      discipline: "nope",
      construction: "stone",
      sort: "bogus",
      fits: "-3",
      q: "  ",
    });
    expect(toMaterialFilters(search)).toEqual({
      q: undefined,
      category: undefined,
      discipline: undefined,
      construction: undefined,
      brand: undefined,
      sort: undefined,
      fits_paddler_kg: undefined,
    });
    expect(parseMaterialSearch({ fits: "501" }).fits).toBeUndefined();
    expect(parseMaterialSearch({ fits: "abc" }).fits).toBeUndefined();
  });

  test("every sort is offered, labelled and accepted from the URL", () => {
    for (const sort of SORTS) {
      expect(SORT_LABELS[sort].length).toBeGreaterThan(0);
      expect(parseMaterialSearch({ sort }).sort).toBe(sort);
    }
    expect(SORTS).toContain("added");
    expect(SORT_LABELS.newest).not.toBe(SORT_LABELS.added);
  });

  test("the tree gets the same narrowing as the list, minus its own levels", () => {
    const search = parseMaterialSearch({
      q: "storm",
      category: "kayak",
      brand: "Pyranha",
      sort: "weight",
      construction: "plastic",
      fits: "80",
    });
    expect(treeFilters(search)).toEqual({
      q: "storm",
      construction: "plastic",
      fits_paddler_kg: 80,
    });
  });

  test("the filter badge counts construction and fits only", () => {
    expect(
      activeFilterCount({
        construction: "wood",
        fits: 70,
        q: "x",
        sort: "name",
      }),
    ).toBe(2);
    expect(activeFilterCount({ category: "kayak", brand: "Dagger" })).toBe(0);
  });
});
