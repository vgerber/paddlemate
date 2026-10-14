import { expect, test } from "bun:test";
import { formatWaterLevels, parseWaterLevels } from "./waterParam";

test("keeps filterable levels in a fixed order", () => {
  expect(parseWaterLevels(["high", "low"])).toEqual(["low", "high"]);
});

test("accepts a single bare level", () => {
  expect(parseWaterLevels("medium")).toEqual(["medium"]);
});

test("drops empty, unknown and duplicate values", () => {
  expect(parseWaterLevels(["empty", "bogus", "high", "high"])).toEqual([
    "high",
  ]);
  expect(parseWaterLevels(["empty"])).toBeUndefined();
  expect(parseWaterLevels(undefined)).toBeUndefined();
  expect(parseWaterLevels(42)).toBeUndefined();
});

test("reads the comma form", () => {
  expect(parseWaterLevels("high,low")).toEqual(["low", "high"]);
  expect(parseWaterLevels("low, bogus")).toEqual(["low"]);
});

test("writes one comma form in a fixed order", () => {
  expect(formatWaterLevels(["high", "low"])).toBe("low,high");
  expect(formatWaterLevels([])).toBeUndefined();
});
