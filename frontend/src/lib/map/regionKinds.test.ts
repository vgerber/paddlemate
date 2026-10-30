import { describe, expect, test } from "bun:test";
import { hiddenKindsLabel, kindForSpan, regionKindLabel } from "./regionKinds";

describe("hiddenKindsLabel", () => {
  test("names one or two kinds", () => {
    expect(hiddenKindsLabel(["district"])).toBe("districts");
    expect(hiddenKindsLabel(["valley", "district"])).toBe(
      "valleys and districts",
    );
  });
  test("lists three with commas", () => {
    expect(hiddenKindsLabel(["valley", "district", "range"])).toBe(
      "valleys, districts, and mountain ranges",
    );
  });
  test("says regions when every kind is hidden", () => {
    expect(hiddenKindsLabel(["valley", "district", "range", "state"])).toBe(
      "regions",
    );
  });
});

describe("regionKindLabel", () => {
  test("names a browsed kind and no other", () => {
    expect(regionKindLabel("range")).toBe("Mountain ranges");
    expect(regionKindLabel("country")).toBeUndefined();
  });
});

describe("kindForSpan", () => {
  test("follows the zoom: states, districts, then valleys", () => {
    expect(kindForSpan(8)).toBe("state");
    expect(kindForSpan(2)).toBe("district");
    expect(kindForSpan(0.5)).toBe("valley");
  });
  test("never defaults to ranges", () => {
    for (const span of [0.1, 0.8, 1.5, 3.9, 4, 12]) {
      expect(kindForSpan(span)).not.toBe("range");
    }
  });
});
