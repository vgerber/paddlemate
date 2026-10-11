import { describe, expect, test } from "bun:test";
import { modeSheetClearance, modeSheetMode, modeSheetPeek } from "./modeSheet";

const base = {
  isMobile: true,
  isAreaMode: false,
  isRegionMode: false,
  selectedWaterwayId: undefined,
  suggestMode: null,
};

describe("modeSheetMode", () => {
  test("name search keeps the overlay", () => {
    expect(modeSheetMode(base)).toBeNull();
  });

  test("area and region take the sheet on a phone", () => {
    expect(modeSheetMode({ ...base, isAreaMode: true })).toBe("area");
    expect(modeSheetMode({ ...base, isRegionMode: true })).toBe("region");
  });

  test("a wide screen never uses it", () => {
    expect(modeSheetMode({ ...base, isMobile: false, isAreaMode: true })).toBe(
      null,
    );
  });

  test("an open river or a suggest flow takes the screen back", () => {
    expect(
      modeSheetMode({ ...base, isAreaMode: true, selectedWaterwayId: 3 }),
    ).toBeNull();
    expect(
      modeSheetMode({ ...base, isRegionMode: true, suggestMode: "waterway" }),
    ).toBeNull();
  });
});

describe("peek", () => {
  test("controls clear the peek, and the region peek is taller", () => {
    expect(modeSheetClearance("area")).toBeGreaterThan(modeSheetPeek("area"));
    expect(modeSheetPeek("region")).toBeGreaterThan(modeSheetPeek("area"));
  });
});
