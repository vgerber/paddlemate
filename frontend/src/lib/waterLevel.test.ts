import { describe, expect, test } from "bun:test";
import { isCalibrated, LEVEL_ORDER, levelConfig, maxLevel } from "./waterLevel";

type Range = Parameters<typeof isCalibrated>[0];

describe("maxLevel", () => {
  test("returns the most severe level", () => {
    expect(maxLevel(["low", "high", "medium"])).toBe("high");
    expect(maxLevel(["empty", "low"])).toBe("low");
  });

  test("empty input is empty", () => {
    expect(maxLevel([])).toBe("empty");
  });
});

describe("levelConfig", () => {
  test("covers every level in order", () => {
    for (const level of LEVEL_ORDER) {
      expect(levelConfig[level].label).toBeTruthy();
      expect(levelConfig[level].color).toBeTruthy();
    }
  });
});

describe("isCalibrated", () => {
  const range = (overrides: Partial<Range>): Range =>
    ({
      range_low: null,
      range_medium: null,
      range_high: null,
      ...overrides,
    }) as Range;

  test("true with any threshold set", () => {
    expect(isCalibrated(range({ range_low: 10 }))).toBe(true);
    expect(isCalibrated(range({ range_medium: 20 }))).toBe(true);
    expect(isCalibrated(range({ range_high: 30 }))).toBe(true);
  });

  test("false with no thresholds", () => {
    expect(isCalibrated(range({}))).toBe(false);
  });
});
