import { describe, expect, test } from "bun:test";
import { hiddenKindsLabel, regionKindLabel } from "./regionKinds";

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
