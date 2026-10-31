import { describe, expect, test } from "bun:test";
import type { Material, MaterialBody, MaterialModel } from "@/lib/api";
import { IMPERIAL, METRIC } from "../prefs/units";
import {
  enumLabel,
  formatSpec,
  MATERIAL_SPECS,
  MAX_COMPARE,
  materialFormToBody,
  materialTitle,
  materialToForm,
  modelFigures,
  modelPicked,
  modelSizes,
  modelTitle,
  paddleFacts,
  paddleLengthLabel,
  paddlerRangeLabel,
  parseCompareIds,
  parseMaterialSearch,
  searchText,
  sinceLabel,
  sourceLinks,
  specSpread,
  toggleCompareId,
  toggleModelCompare,
  yearsLabel,
} from "./materials";

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

/** Every field of the request body, so a field added to the API fails here
 * until the round trip covers it. */
const FULL_PADDLE: Required<MaterialBody> = {
  category: "paddle",
  brand: "Aqua Bound",
  model: "Aerial",
  variant: "Major",
  size: "M",
  discipline: "river_runner",
  construction: "composite",
  description: "A paddle.",
  product_url: "https://example.com/aerial",
  year_from: 2023,
  year_to: 2025,
  year_approximate: true,
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

describe("approximate years", () => {
  test("read as about", () => {
    const approx = material({ year_from: 2022, year_approximate: true });
    expect(yearsLabel(approx)).toBe("about 2022-");
    expect(yearsLabel({ ...approx, year_from: null, year_to: 2024 })).toBe(
      "until about 2024",
    );
  });
});

describe("paddle facts", () => {
  const paddle = material({
    category: "paddle",
    blade_area_cm2: 645,
    length_min_cm: 191,
    length_max_cm: 205,
    pieces: 2,
    shaft: "bent",
    feather_deg: [0, 30],
    weight_kg: 0.9,
  });

  test("shows the stated values in metric", () => {
    const facts = Object.fromEntries(
      paddleFacts(paddle, METRIC).map((f) => [f.label, f.value]),
    );
    expect(facts["Blade area"]).toBe("645 cm\u00b2");
    expect(facts.Length).toBe("191-205 cm");
    expect(facts.Pieces).toBe("2");
    expect(facts.Shaft).toBe("Bent");
    expect(facts.Feather).toBe("0, 30\u00b0");
    expect(facts.Weight).toBe("0.9 kg");
  });

  test("converts to the chosen units", () => {
    const facts = Object.fromEntries(
      paddleFacts(paddle, IMPERIAL).map((f) => [f.label, f.value]),
    );
    expect(facts["Blade area"]).toBe("100 in\u00b2");
    expect(facts.Length).toBe("75.2-80.7 in");
  });

  test("sizes win over the range", () => {
    expect(
      paddleLengthLabel({ ...paddle, lengths_cm: [191, 194] }, METRIC),
    ).toBe("191, 194 cm");
  });

  test("a kayak yields no paddle facts", () => {
    expect(
      paddleFacts(material({ category: "kayak", weight_kg: 20 }), METRIC),
    ).toEqual([]);
  });

  test("states nothing for a bare entry", () => {
    expect(paddleFacts(material({ category: "paddle" }), METRIC)).toEqual([]);
  });
});

describe("sourceLinks", () => {
  test("groups the fields by page and ignores non-links", () => {
    const links = sourceLinks({
      weight_kg: "https://www.example.com/a",
      length_cm: "https://www.example.com/a",
      year_from: "javascript:alert(1)",
      colors: "https://other.test/b",
    });
    expect(links).toEqual([
      {
        url: "https://www.example.com/a",
        host: "example.com",
        fields: ["weight", "length"],
      },
      { url: "https://other.test/b", host: "other.test", fields: ["colors"] },
    ]);
  });

  test("no sources is no links", () => {
    expect(sourceLinks(null)).toEqual([]);
    expect(sourceLinks("x")).toEqual([]);
  });
});

const SCORCH: MaterialModel = {
  category: "kayak",
  brand: "Pyranha",
  model: "Scorch",
  year_from: 2021,
  year_approximate: false,
  sizes: [
    { id: 11, size: "S", length_cm: 259, volume_l: 265, weight_kg: 21 },
    { id: 12, size: "M", length_cm: 267, volume_l: 310, weight_kg: 23 },
    { id: 13, size: "L", length_cm: 279, volume_l: 340, weight_kg: 24.5 },
  ],
};

describe("model rows", () => {
  test("the title leaves the size out, an entry's title keeps it", () => {
    expect(modelTitle(SCORCH)).toBe("Pyranha Scorch");
    expect(materialTitle(material({ model: "Scorch", size: "M" }))).toBe(
      "Testflow Scorch M",
    );
  });

  test("figures span the sizes in the chosen unit", () => {
    expect(modelFigures(SCORCH, METRIC)).toBe(
      "Length 259-279 cm  ·  Volume 265-340 l  ·  Weight 21-24.5 kg",
    );
    expect(modelFigures(SCORCH, IMPERIAL)).toContain("Weight 46.3-54 lb");
  });

  test("one size reads as a single value, a paddle drops volume", () => {
    const one: MaterialModel = {
      ...SCORCH,
      category: "paddle",
      sizes: [{ id: 1, lengths_cm: [191, 194], weight_kg: 0.87 }],
    };
    expect(modelFigures(one, METRIC)).toBe(
      "Length 191, 194 cm  ·  Weight 0.9 kg",
    );
  });

  test("a model still built reads Since", () => {
    expect(sinceLabel(SCORCH)).toBe("Since 2021");
    expect(sinceLabel({ ...SCORCH, year_approximate: true })).toBe(
      "Since about 2021",
    );
    expect(sinceLabel({ ...SCORCH, year_to: 2024 })).toBe("2021-2024");
  });
});

describe("sizes of an entry's model", () => {
  const entry = material({
    id: 12,
    size: "M",
    siblings: [
      { id: 13, size: "L" },
      { id: 11, size: "S" },
    ],
  });

  test("the entry joins its siblings in size order", () => {
    expect(modelSizes(entry).map((s) => s.size)).toEqual(["S", "M", "L"]);
  });

  test("numbers follow the letters, a single entry has no picker", () => {
    const numeric = material({
      id: 2,
      size: "65",
      siblings: [
        { id: 3, size: "XL" },
        { id: 4, size: "8.5" },
      ],
    });
    expect(modelSizes(numeric).map((s) => s.size)).toEqual(["XL", "8.5", "65"]);
    expect(modelSizes(material())).toEqual([]);
  });
});

describe("ticking a model", () => {
  test("adds its first size, and removes every size held", () => {
    expect(toggleModelCompare([5], SCORCH)).toEqual([5, 11]);
    expect(modelPicked([5, 12], SCORCH)).toBe(true);
    expect(toggleModelCompare([5, 12, 13], SCORCH)).toEqual([5]);
  });

  test("a full comparison takes no further model", () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, i) => 100 + i);
    expect(toggleModelCompare(full, SCORCH)).toEqual(full);
  });
});
