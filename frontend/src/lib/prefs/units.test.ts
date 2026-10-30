import { describe, expect, test } from "bun:test";
import {
  defaultUnits,
  formatDistanceKm,
  formatQuantity,
  fromDisplay,
  IMPERIAL,
  METRIC,
  parseInput,
  resolveUnits,
  toDisplay,
  toInputText,
  unitLabel,
} from "./units";

describe("defaultUnits", () => {
  test("US English is imperial", () => {
    expect(defaultUnits("en-US")).toEqual(IMPERIAL);
  });
  test("everyone else is metric", () => {
    for (const tag of ["en-GB", "de-DE", "en", "fr", "", "x_x"]) {
      expect(defaultUnits(tag)).toEqual(METRIC);
    }
    expect(defaultUnits(undefined)).toEqual(METRIC);
  });
});

describe("resolveUnits", () => {
  test("nothing stored follows the device", () => {
    expect(resolveUnits(null, "en-US")).toEqual(IMPERIAL);
    expect(resolveUnits(null, "de-DE")).toEqual(METRIC);
  });
  test("a stored choice wins, field by field", () => {
    expect(resolveUnits('{"weight":"kg"}', "en-US")).toEqual({
      weight: "kg",
      distance: "mi",
      length: "in",
    });
  });
  test("junk is ignored", () => {
    expect(resolveUnits("{", "en-US")).toEqual(IMPERIAL);
    expect(resolveUnits('{"weight":"stone"}', "de")).toEqual(METRIC);
  });
});

describe("conversion", () => {
  test("each quantity", () => {
    expect(toDisplay("weight", 1, IMPERIAL)).toBeCloseTo(2.20462, 4);
    expect(toDisplay("distance", 1.609344, IMPERIAL)).toBeCloseTo(1, 6);
    expect(toDisplay("length", 254, IMPERIAL)).toBeCloseTo(100, 6);
    expect(toDisplay("volume", 3.785411784, IMPERIAL)).toBeCloseTo(1, 6);
    expect(toDisplay("volume", 80, METRIC)).toBe(80);
  });
  test("volume follows length", () => {
    expect(unitLabel("volume", { ...METRIC, length: "in" })).toBe("gal");
    expect(unitLabel("volume", { ...IMPERIAL, length: "cm" })).toBe("l");
  });
  test("round trip through a text field keeps the stored value", () => {
    for (const metric of [264, 22, 74.5, 61.2]) {
      const text = toInputText("length", metric, IMPERIAL);
      expect(parseInput("length", text, IMPERIAL)).toBeCloseTo(metric, 1);
    }
    expect(parseInput("weight", "150", IMPERIAL)).toBe(68.04);
    expect(toInputText("weight", 68.04, IMPERIAL)).toBe("150");
  });
});

describe("parseInput", () => {
  test("blank and junk are absent", () => {
    expect(parseInput("weight", "  ", METRIC)).toBeUndefined();
    expect(parseInput("weight", "abc", METRIC)).toBeUndefined();
  });
  test("comma decimal", () => {
    expect(parseInput("weight", "20,5", METRIC)).toBe(20.5);
  });
  test("metric is unchanged", () => {
    expect(fromDisplay("length", 264, METRIC)).toBe(264);
  });
});

describe("formatting", () => {
  test("quantities", () => {
    expect(formatQuantity("length", 264, METRIC)).toBe("264 cm");
    expect(formatQuantity("length", 264, IMPERIAL)).toBe("103.9 in");
    expect(formatQuantity("weight", 20.5, METRIC)).toBe("20.5 kg");
    expect(formatQuantity("weight", 22, IMPERIAL)).toBe("48.5 lb");
    expect(formatQuantity("volume", 80, IMPERIAL)).toBe("21.1 gal");
  });
  test("distance keeps one decimal", () => {
    expect(formatDistanceKm(0.3, METRIC)).toBe("0.3 km");
    expect(formatDistanceKm(5.8, IMPERIAL)).toBe("3.6 mi");
  });
});
