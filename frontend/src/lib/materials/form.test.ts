import { describe, expect, test } from "bun:test";
import type { Material, MaterialBody } from "@/lib/api";
import { IMPERIAL, METRIC } from "@/lib/prefs/units";
import {
  canSaveMaterial,
  emptyMaterialForm,
  materialFormToBody,
  materialToForm,
} from "./form";

function material(fields: Partial<Material> = {}): Material {
  return {
    id: 1,
    category: "kayak",
    disciplines: ["creek"],
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

describe("form units", () => {
  const stated = material({ length_cm: 264, weight_kg: 22 });

  test("shows the entry in the chosen units", () => {
    const form = materialToForm(stated, IMPERIAL);
    expect(form.length_cm).toBe("103.94");
    expect(form.weight_kg).toBe("48.5");
  });

  test("an untouched form saves the stored values back", () => {
    const body = materialFormToBody(materialToForm(stated, IMPERIAL), IMPERIAL);
    expect(body.length_cm).toBeCloseTo(264, 1);
    expect(body.weight_kg).toBeCloseTo(22, 1);
  });

  test("imperial input is saved as metric", () => {
    const form = { ...materialToForm(stated, IMPERIAL), length_cm: "100" };
    expect(materialFormToBody(form, IMPERIAL).length_cm).toBe(254);
  });
});

/** Every field of the request body, so a field added to the API fails here
 * until the round trip covers it. */
const FULL_PADDLE: Required<MaterialBody> = {
  category: "paddle",
  brand: "Aqua Bound",
  model: "Aerial",
  variant: "Major",
  size: "M",
  disciplines: ["river_runner", "creek"],
  construction: "composite",
  description: "A paddle.",
  product_url: "https://example.com/aerial",
  year_from: 2023,
  year_to: 2025,
  year_approximate: true,
  availability: "discontinued",
  availability_source: "https://example.com/archive",
  availability_checked: "2026-11-01",
  notes: "Weak year.",
  colors: ["Red", "Blue"],
  length_cm: 12.3,
  width_cm: 4.56,
  height_cm: 7.89,
  volume_l: 295,
  weight_kg: 0.87,
  cockpit_length_cm: 84.4,
  cockpit_width_cm: 49.1,
  paddler_weight_min_kg: 45.5,
  paddler_weight_max_kg: 97.7,
  blade_area_cm2: 645.3,
  blade_length_cm: 47.7,
  blade_width_cm: 17.3,
  length_min_cm: 191,
  length_max_cm: 205,
  lengths_cm: [191, 194, 197.5],
  pieces: 2,
  shaft: "bent",
  shaft_material: "carbon",
  blade_material: "Nylon",
  feather_deg: [0, 30, 45],
  shaft_diameter: "29.5 mm",
};

describe("an edit that changes nothing", () => {
  const stored = material({
    ...FULL_PADDLE,
    id: 5,
    colors: FULL_PADDLE.colors,
  } as Partial<Material>);

  for (const [name, units] of [
    ["metric", METRIC],
    ["imperial", IMPERIAL],
  ] as const) {
    test(`sends every field it loaded, ${name}`, () => {
      const body = materialFormToBody(
        materialToForm(stored, units),
        units,
        stored,
      );
      expect(body).toEqual(FULL_PADDLE);
    });
  }

  test("a boat never sends paddle fields", () => {
    const form = {
      ...materialToForm(stored, METRIC),
      category: "kayak" as const,
    };
    const body = materialFormToBody(form, METRIC, stored);
    expect(body.blade_area_cm2).toBeUndefined();
    expect(body.lengths_cm).toBeUndefined();
    expect(body.shaft).toBeUndefined();
  });

  test("a touched field is converted, an untouched one keeps its stored value", () => {
    const form = {
      ...materialToForm(stored, IMPERIAL),
      blade_width_cm: "10",
    };
    const body = materialFormToBody(form, IMPERIAL, stored);
    expect(body.blade_width_cm).toBe(25.4);
    expect(body.volume_l).toBe(295);
  });

  test("colours and sizes are read from their text", () => {
    const form = {
      ...materialToForm(stored, METRIC),
      colors: " Green,,Red ",
      lengths_cm: "190 195",
    };
    const body = materialFormToBody(form, METRIC, stored);
    expect(body.colors).toEqual(["Green", "Red"]);
    expect(body.lengths_cm).toEqual([190, 195]);
  });
});

describe("the groups of an entry", () => {
  test("they round-trip in order", () => {
    const m = material({ disciplines: ["river_runner", "creek"] });
    const form = materialToForm(m, METRIC);
    expect(form.disciplines).toEqual(["river_runner", "creek"]);
    expect(materialFormToBody(form, METRIC).disciplines).toEqual([
      "river_runner",
      "creek",
    ]);
  });

  test("an entry cannot be saved without one", () => {
    const form = { ...emptyMaterialForm(), brand: "Pyranha", model: "Jed" };
    expect(canSaveMaterial(form)).toBe(false);
    expect(canSaveMaterial({ ...form, disciplines: ["creek"] })).toBe(true);
  });
});
