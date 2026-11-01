import { describe, expect, test } from "bun:test";
import type { MaterialModel } from "@/lib/api";
import { IMPERIAL, METRIC } from "@/lib/prefs/units";
import { cardName, cardSpecs, modelCardFacts, sizeTags } from "./card";

const SCORCH: MaterialModel = {
  category: "kayak",
  brand: "Pyranha",
  model: "Scorch",
  variant: "PRO",
  disciplines: ["creek", "river_runner"],
  construction: "plastic",
  year_from: 2021,
  year_approximate: false,
  availability: "current",
  sizes: [
    { id: 11, size: "S", length_cm: 259, volume_l: 265, weight_kg: 21 },
    { id: 12, size: "M", length_cm: 267, volume_l: 310, weight_kg: 23 },
    { id: 13, size: "L", length_cm: 279, volume_l: 340, weight_kg: 24.5 },
  ],
};

const PADDLE: MaterialModel = {
  ...SCORCH,
  category: "paddle",
  disciplines: ["whitewater"],
  construction: null,
  sizes: [{ id: 1, lengths_cm: [191, 194], weight_kg: 0.87 }],
};

describe("cardSpecs", () => {
  test("a boat has length, volume and weight across its sizes", () => {
    expect(cardSpecs(SCORCH, METRIC)).toEqual([
      { label: "Length", value: "259-279 cm" },
      { label: "Volume", value: "265-340 l" },
      { label: "Weight", value: "21-24.5 kg" },
    ]);
  });

  test("units follow the reader", () => {
    expect(cardSpecs(SCORCH, IMPERIAL)[2].value).toBe("46.3-54 lb");
  });

  test("a paddle has length and weight, in grams", () => {
    expect(cardSpecs(PADDLE, METRIC)).toEqual([
      { label: "Length", value: "191, 194 cm" },
      { label: "Weight", value: "870 g" },
    ]);
  });

  test("a figure the model lacks keeps its slot, empty", () => {
    const bare = { ...SCORCH, sizes: [{ id: 1, length_cm: 250 }] };
    expect(cardSpecs(bare, METRIC)).toEqual([
      { label: "Length", value: "250 cm" },
      { label: "Volume", value: "" },
      { label: "Weight", value: "" },
    ]);
  });
});

describe("sizeTags", () => {
  test("lists the stated sizes", () => {
    expect(sizeTags(SCORCH)).toEqual(["S", "M", "L"]);
    expect(sizeTags(PADDLE)).toEqual([]);
  });

  test("folds a long list into a count", () => {
    const sizes = ["XS", "S", "M", "L", "XL", "XXL"].map((size, id) => ({
      id,
      size,
    }));
    expect(sizeTags({ ...SCORCH, sizes })).toEqual(["XS", "S", "M", "+3"]);
  });
});

describe("modelCardFacts", () => {
  test("the meta line is groups, construction and years", () => {
    const facts = modelCardFacts(SCORCH, METRIC, false);
    expect(facts.meta).toBe("Creek · River runner · Plastic · since 2021");
    expect(facts.discontinued).toBeUndefined();
  });

  test("the category leads when the list is not narrowed", () => {
    expect(modelCardFacts(SCORCH, METRIC, true).meta).toStartWith("Kayak ·");
  });

  test("a discontinued model is tagged, not worded into the meta", () => {
    const old = { ...SCORCH, availability: "discontinued" as const };
    const facts = modelCardFacts(old, METRIC, false);
    expect(facts.discontinued).toBe("Discontinued");
    expect(facts.meta).not.toContain("Discontinued");
  });

  test("the name is model and variant", () => {
    expect(cardName(SCORCH)).toBe("Scorch PRO");
    expect(cardName({ model: "Scorch" })).toBe("Scorch");
  });
});
