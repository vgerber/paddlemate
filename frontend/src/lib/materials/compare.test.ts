import { describe, expect, test } from "bun:test";
import type { Material, MaterialModel } from "@/lib/api";
import { IMPERIAL, METRIC } from "@/lib/prefs/units";
import {
  barRatios,
  buildComparison,
  MAX_COMPARE,
  modelPicked,
  parseCompareIds,
  specSpread,
  toggleCompareId,
  toggleModelCompare,
} from "./compare";

function material(fields: Partial<Material> = {}): Material {
  return {
    id: 1,
    category: "kayak",
    brand: "Testflow",
    colors: [],
    siblings: [],
    year_approximate: false,
    availability: "unknown",
    images: [],
    model: "Cascade",
    created_by: "u1",
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...fields,
  };
}

const row = (c: ReturnType<typeof buildComparison>, key: string) =>
  c.rows.find((r) => r.key === key);

describe("buildComparison", () => {
  const a = material({
    id: 1,
    length_cm: 259,
    width_cm: 63,
    discipline: "creek",
  });
  const b = material({
    id: 2,
    length_cm: 279,
    width_cm: 63,
    discipline: "creek",
  });

  test("equal values move to the alike strip", () => {
    const c = buildComparison([a, b], METRIC);
    expect(c.alike).toContain("Creek");
    expect(c.alike).toContain("Width 63 cm");
    expect(row(c, "width")).toBeUndefined();
    expect(row(c, "discipline")).toBeUndefined();
    expect(row(c, "length")?.cells).toEqual(["259", "279"]);
  });

  test("units sit in the label, cells are bare numbers", () => {
    expect(row(buildComparison([a, b], METRIC), "length")?.label).toBe(
      "Length (cm)",
    );
    const imperial = row(buildComparison([a, b], IMPERIAL), "length");
    expect(imperial?.label).toBe("Length (in)");
    expect(imperial?.cells[0]).toBe("102");
  });

  test("a row stated by one entry only is left out", () => {
    const c = buildComparison(
      [a, material({ id: 2, height_cm: 30, length_cm: 270 })],
      METRIC,
    );
    expect(row(c, "height")).toBeUndefined();
    expect(row(c, "length")).toBeDefined();
  });

  test("a row all entries state equally but one is missing stays a row", () => {
    const c = buildComparison([a, b, material({ id: 3 })], METRIC);
    expect(row(c, "width")?.cells).toEqual(["63", "63", undefined]);
  });

  test("a kayak and a paddle share only what both state", () => {
    const paddle = material({
      id: 3,
      category: "paddle",
      blade_area_cm2: 700,
      weight_kg: 1.077,
    });
    const c = buildComparison([material({ weight_kg: 20 }), paddle], METRIC);
    expect(c.mixed).toBe(true);
    expect(row(c, "blade_area")).toBeUndefined();
    expect(row(c, "weight")?.label).toBe("Weight (kg)");
    expect(row(c, "category")?.cells).toEqual(["Kayak", "Paddle"]);
  });

  test("paddle weight reads in grams, and ounces in imperial", () => {
    const p1 = material({ id: 1, category: "paddle", weight_kg: 1.077 });
    const p2 = material({ id: 2, category: "paddle", weight_kg: 1.148 });
    const metric = row(buildComparison([p1, p2], METRIC), "weight");
    expect(metric?.label).toBe("Weight (g)");
    expect(metric?.cells).toEqual(["1077", "1148"]);
    expect(row(buildComparison([p1, p2], IMPERIAL), "weight")?.label).toBe(
      "Weight (oz)",
    );
  });

  test("paddle rows appear for paddles", () => {
    const p1 = material({
      id: 1,
      category: "paddle",
      blade_area_cm2: 710,
      pieces: 1,
      lengths_cm: [191, 194],
    });
    const p2 = material({
      id: 2,
      category: "paddle",
      blade_area_cm2: 660,
      pieces: 1,
      lengths_cm: [191, 200],
    });
    const c = buildComparison([p1, p2], METRIC);
    expect(row(c, "blade_area")?.label).toBe("Blade area (cm²)");
    expect(row(c, "lengths")?.cells).toEqual(["191, 194", "191, 200"]);
    expect(c.alike).toContain("1 piece");
  });

  test("paddler weight and cockpit are one row each", () => {
    const c = buildComparison(
      [
        material({
          cockpit_length_cm: 95,
          cockpit_width_cm: 49,
          paddler_weight_min_kg: 65,
          paddler_weight_max_kg: 90,
        }),
        material({
          id: 2,
          cockpit_length_cm: 91,
          cockpit_width_cm: 52.5,
          paddler_weight_min_kg: 80,
          paddler_weight_max_kg: 115,
        }),
      ],
      METRIC,
    );
    expect(row(c, "cockpit")?.cells).toEqual(["95 x 49", "91 x 52.5"]);
    expect(row(c, "paddler")?.label).toBe("Paddler weight (kg)");
    expect(row(c, "paddler")?.cells).toEqual(["65-90", "80-115"]);
  });

  test("a single entry shows every stated row and no strip", () => {
    const c = buildComparison([a], METRIC);
    expect(c.alike).toEqual([]);
    expect(row(c, "length")).toBeDefined();
  });

  test("built reads since and about", () => {
    const c = buildComparison(
      [
        material({ year_from: 2021 }),
        material({ id: 2, year_from: 2010, year_approximate: true }),
      ],
      METRIC,
    );
    expect(row(c, "built")?.cells).toEqual(["since 2021", "about 2010"]);
  });
});

describe("barRatios", () => {
  test("zero based, longest is full", () => {
    expect(barRatios([20, 10])).toEqual([1, 0.5]);
  });
  test("under 5 percent apart draws nothing", () => {
    expect(barRatios([100, 96])).toBeUndefined();
    expect(barRatios([100, 95])).toBeDefined();
  });
  test("one stated number draws nothing", () => {
    expect(barRatios([20, undefined])).toBeUndefined();
  });
});

const SCORCH: MaterialModel = {
  category: "kayak",
  brand: "Pyranha",
  model: "Scorch",
  year_from: 2021,
  year_approximate: false,
  availability: "unknown",
  sizes: [
    { id: 11, size: "S", length_cm: 259, volume_l: 265, weight_kg: 21 },
    { id: 12, size: "M", length_cm: 267, volume_l: 310, weight_kg: 23 },
    { id: 13, size: "L", length_cm: 279, volume_l: 340, weight_kg: 24.5 },
  ],
};

describe("specSpread", () => {
  test("reports the range and that the entries disagree", () => {
    expect(specSpread([264, 254, 274])).toEqual({
      min: 254,
      max: 274,
      varies: true,
      empty: false,
    });
  });

  test("entries that agree do not vary", () => {
    expect(specSpread([66, 66])).toEqual({
      min: 66,
      max: 66,
      varies: false,
      empty: false,
    });
  });

  test("ignores the entries that state nothing", () => {
    expect(specSpread([undefined, 20])).toEqual({
      min: 20,
      max: 20,
      varies: false,
      empty: false,
    });
  });

  test("a row nobody stated is empty", () => {
    expect(specSpread([undefined, undefined])).toEqual({
      varies: false,
      empty: true,
    });
  });
});

describe("parseCompareIds", () => {
  test("keeps the order and drops what is not an id", () => {
    expect(parseCompareIds("3, 1,x,2")).toEqual([3, 1, 2]);
  });

  test("collapses duplicates", () => {
    expect(parseCompareIds("1,1,2")).toEqual([1, 2]);
  });

  test("caps the comparison", () => {
    const many = Array.from({ length: MAX_COMPARE + 3 }, (_, i) => i + 1);
    expect(parseCompareIds(many.join(","))).toHaveLength(MAX_COMPARE);
  });

  test("an absent parameter compares nothing", () => {
    expect(parseCompareIds(undefined)).toEqual([]);
  });
});

describe("toggleCompareId", () => {
  test("adds at the end and removes in place", () => {
    expect(toggleCompareId([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleCompareId([1, 2, 3], 2)).toEqual([1, 3]);
  });

  test("a full comparison keeps what was already picked", () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, i) => i + 1);
    expect(toggleCompareId(full, 99)).toEqual(full);
  });
});

describe("ticking a model", () => {
  test("a model of several sizes never picks one silently", () => {
    expect(SCORCH.sizes.length).toBeGreaterThan(1);
    expect(toggleModelCompare([5], SCORCH)).toEqual([5]);
  });

  test("a model of one size picks it, and removes every size held", () => {
    const single = { sizes: [{ id: 21 }] } as typeof SCORCH;
    expect(toggleModelCompare([5], single)).toEqual([5, 21]);
    expect(modelPicked([5, 12], SCORCH)).toBe(true);
    expect(toggleModelCompare([5, 12, 13], SCORCH)).toEqual([5]);
  });

  test("a full comparison takes no further model", () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, i) => 100 + i);
    expect(toggleModelCompare(full, SCORCH)).toEqual(full);
  });
});
