import { describe, expect, test } from "bun:test";
import type { Material, MaterialModel } from "@/lib/api";
import { IMPERIAL, METRIC } from "@/lib/prefs/units";
import {
  materialFieldLabel,
  materialFieldValue,
  materialTitle,
  modelFigures,
  modelSizes,
  modelTitle,
  paddleFacts,
  paddleLengthLabel,
  paddlerRangeLabel,
  sinceLabel,
  sourceLinks,
  yearsLabel,
} from "./facts";
import { CATEGORY_LABELS } from "./specs";

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
    expect(facts.Weight).toBe("900 g");
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
  availability: "unknown",
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
      "Length 191, 194 cm  ·  Weight 870 g",
    );
  });

  test("a model still built reads since", () => {
    expect(sinceLabel(SCORCH)).toBe("since 2021");
    expect(sinceLabel({ ...SCORCH, year_approximate: true })).toBe(
      "about 2021",
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

describe("materialFieldLabel and materialFieldValue", () => {
  test("labels come from the form's wording", () => {
    expect(materialFieldLabel("length_cm")).toBe("Length");
    expect(materialFieldLabel("blade_area_cm2")).toBe("Blade area");
    expect(materialFieldLabel("year_from")).toBe("First year");
    expect(materialFieldLabel("some_new_field")).toBe("Some new field");
  });

  test("measurements follow the reader's units", () => {
    expect(materialFieldValue("length_cm", 254, METRIC)).toBe("254 cm");
    expect(materialFieldValue("length_cm", 254, IMPERIAL)).toBe("100 in");
    expect(materialFieldValue("weight_kg", 20, IMPERIAL)).toBe("44.1 lb");
    expect(materialFieldValue("lengths_cm", [194, 197], METRIC)).toBe(
      "194 cm, 197 cm",
    );
  });

  test("enums, flags and empty values read as words", () => {
    expect(materialFieldValue("discipline", "river_runner", METRIC)).toBe(
      "River runner",
    );
    expect(materialFieldValue("category", "paddle", METRIC)).toBe(
      CATEGORY_LABELS.paddle,
    );
    expect(materialFieldValue("year_approximate", true, METRIC)).toBe("yes");
    expect(materialFieldValue("colors", ["Red", "Blue"], METRIC)).toBe(
      "Red, Blue",
    );
    expect(materialFieldValue("notes", null, METRIC)).toBe("none");
    expect(materialFieldValue("colors", [], METRIC)).toBe("none");
  });
});
