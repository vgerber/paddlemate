import { describe, expect, test } from "bun:test";
import type { SectionNamingValue } from "./SectionNamingForm";
import type { SectionFeatureDraft } from "./SuggestFeatureForm";
import { buildSectionPayload } from "./sectionPayload";

const naming = (overrides: Partial<SectionNamingValue> = {}) => ({
  langCode: "en",
  name: "  Lower Test  ",
  description: "",
  region: " Tyrol ",
  country: "",
  translations: [],
  ...overrides,
});

const LINE: [number, number][] = [
  [11, 47],
  [11.1, 47.1],
];

const draft = (overrides: Partial<SectionFeatureDraft> = {}) =>
  ({
    feature_type: "rapid",
    metadata: { difficulty: "III" },
    location: { type: "Point", coordinates: [11.05, 47.05] },
    name: "Big Hole",
    description: null,
    lang_code: "en",
    water_ranges: null,
    used_section_line: false,
    ...overrides,
  }) as SectionFeatureDraft;

describe("buildSectionPayload", () => {
  test("trims naming fields and nulls the empty ones", () => {
    const body = buildSectionPayload(naming(), LINE, []);
    expect(body.name).toBe("Lower Test");
    expect(body.region).toBe("Tyrol");
    expect(body.country).toBeNull();
    expect(body.description).toBeNull();
    expect(body.location).toEqual({ type: "LineString", coordinates: LINE });
  });

  test("stores the primary naming as a tagged translation too", () => {
    const body = buildSectionPayload(
      naming({ description: " main desc " }),
      LINE,
      [],
    );
    expect(body.translations?.[0]).toEqual({
      lang_code: "en",
      name: "Lower Test",
      description: "main desc",
    });
  });

  test("drops translation rows with neither name nor description", () => {
    const body = buildSectionPayload(
      naming({
        translations: [
          { id: "t1", langCode: "de", name: " Untere Test ", description: "" },
          { id: "t2", langCode: "fr", name: "  ", description: "" },
        ],
      }),
      LINE,
      [],
    );
    expect(body.translations).toHaveLength(2);
    expect(body.translations?.[1]).toEqual({
      lang_code: "de",
      name: "Untere Test",
      description: null,
    });
  });

  test("full-section features get the final line, others keep their geometry", () => {
    const body = buildSectionPayload(naming(), LINE, [
      draft(),
      draft({ feature_type: "whitewater", used_section_line: true }),
    ]);
    expect(body.features?.[0]?.location).toEqual({
      type: "Point",
      coordinates: [11.05, 47.05],
    });
    expect(body.features?.[1]?.location).toEqual({
      type: "LineString",
      coordinates: LINE,
    });
  });
});
