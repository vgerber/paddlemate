import { describe, expect, test } from "bun:test";
import { FEATURE_ICON_PATHS } from "@/components/FeatureTypeIcon";
import { FEATURE_TYPES } from "@/lib/featureTypes";

describe("feature type icons", () => {
  test("every feature type has a drawing", () => {
    for (const type of FEATURE_TYPES) {
      expect(FEATURE_ICON_PATHS[type]?.length, type).toBeGreaterThan(0);
    }
  });

  test("there is no drawing for an unknown type", () => {
    expect(Object.keys(FEATURE_ICON_PATHS).sort()).toEqual(
      [...FEATURE_TYPES].sort(),
    );
  });

  test("every path starts with a move", () => {
    for (const [type, paths] of Object.entries(FEATURE_ICON_PATHS)) {
      for (const d of paths) expect(d.startsWith("M"), type).toBe(true);
    }
  });
});
