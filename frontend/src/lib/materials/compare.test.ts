import { describe, expect, test } from "bun:test";
import type { Material } from "@/lib/api";
import { IMPERIAL, METRIC } from "@/lib/prefs/units";
import { barRatios, buildComparison } from "./compare";

function material(fields: Partial<Material> = {}): Material {
  return {
    id: 1,
    category: "kayak",
    brand: "Testflow",
    colors: [],
    siblings: [],
    year_approximate: false,
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
