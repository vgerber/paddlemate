import { expect, test } from "bun:test";
import { parseWaterLevels } from "./waterParam";

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
