import { describe, expect, test } from "bun:test";
import type { Material } from "@/lib/api";
import { IMPERIAL, METRIC } from "../prefs/units";
import {
  enumLabel,
  formatSpec,
  MATERIAL_SPECS,
  MAX_COMPARE,
  materialFormToBody,
  materialTitle,
  materialToForm,
  paddlerRangeLabel,
  parseCompareIds,
  parseMaterialSearch,
  searchText,
  specSpread,
  toggleCompareId,
  yearsLabel,
} from "./materials";

function material(fields: Partial<Material> = {}): Material {
  return {
    id: 1,
    category: "kayak",
    brand: "Testflow",
    model: "Cascade",
    created_by: "u1",
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...fields,
  };
}

describe("materialTitle", () => {
  test("joins brand, model and variant", () => {
    expect(materialTitle(material({ variant: "M" }))).toBe(
      "Testflow Cascade M",
    );
  });

  test("leaves out a variant the model does not have", () => {
    expect(materialTitle(material())).toBe("Testflow Cascade");
  });
});

describe("yearsLabel", () => {
  test("leaves a boat still in production open", () => {
    expect(yearsLabel(material({ year_from: 2022 }))).toBe("2022-");
  });

  test("closes a discontinued run", () => {
    expect(yearsLabel(material({ year_from: 2019, year_to: 2024 }))).toBe(
      "2019-2024",
    );
  });

  test("collapses a single year", () => {
    expect(yearsLabel(material({ year_from: 2020, year_to: 2020 }))).toBe(
      "2020",
    );
  });

  test("is empty when no year is stated", () => {
    expect(yearsLabel(material())).toBe("");
  });
});

describe("paddlerRangeLabel", () => {
  test("reads as a window", () => {
    expect(
      paddlerRangeLabel(
        material({ paddler_weight_min_kg: 70, paddler_weight_max_kg: 110 }),
        METRIC,
      ),
    ).toBe("70-110 kg");
  });

  test("stays open at the end that is not stated", () => {
    expect(
      paddlerRangeLabel(material({ paddler_weight_min_kg: 70 }), METRIC),
    ).toBe("from 70 kg");
    expect(
      paddlerRangeLabel(material({ paddler_weight_max_kg: 110 }), METRIC),
    ).toBe("up to 110 kg");
  });
});

describe("formatSpec", () => {
  const weight = MATERIAL_SPECS.find((spec) => spec.key === "weight_kg");
  if (!weight) throw new Error("weight is a spec");

  test("appends the unit and trims trailing zeros", () => {
    expect(formatSpec(22, weight, METRIC)).toBe("22 kg");
    expect(formatSpec(20.5, weight, METRIC)).toBe("20.5 kg");
  });

  test("converts to the chosen units", () => {
    expect(formatSpec(22, weight, IMPERIAL)).toBe("48.5 lb");
  });

  test("shows a dash for a measurement nobody stated", () => {
    expect(formatSpec(undefined, weight, METRIC)).toBe("-");
  });
});

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

describe("enumLabel", () => {
  test("reads a snake_case value as a sentence", () => {
    expect(enumLabel("river_runner")).toBe("River runner");
    expect(enumLabel("sup")).toBe("Sup");
  });
});

describe("searchText", () => {
  test("a number read from the URL is the text it was typed as", () => {
    expect(searchText(2000)).toBe("2000");
    expect(parseMaterialSearch({ q: 9853, compare: 9853 })).toMatchObject({
      q: "9853",
      compare: "9853",
    });
    expect(searchText("  ")).toBeUndefined();
  });
});
