import { describe, expect, test } from "bun:test";
import type { Descent, SectionWithFeatures } from "@/lib/api";
import { descentRivers, descentTitle, endpointName } from "./descents";

const log = (
  name: string | null,
  sections: { waterway_name?: string; section_name?: string }[],
) =>
  ({
    name,
    sections: sections.map((s, i) => ({ ...s, sort_order: i })),
  }) as unknown as Pick<Descent, "name" | "sections">;

describe("descentTitle", () => {
  test("its own name wins", () => {
    expect(descentTitle(log("Evening lap", [{ waterway_name: "Isar" }]))).toBe(
      "Evening lap",
    );
  });

  test("then the rivers, each once", () => {
    const d = log(null, [
      { waterway_name: "Isar", section_name: "Upper" },
      { waterway_name: "Isar", section_name: "Lower" },
      { waterway_name: "Loisach" },
    ]);
    expect(descentRivers(d)).toEqual(["Isar", "Loisach"]);
    expect(descentTitle(d)).toBe("Isar / Loisach");
  });

  test("then the sections, then a plain word", () => {
    expect(
      descentTitle(log(null, [{ section_name: "A" }, { section_name: "B" }])),
    ).toBe("A, B");
    expect(descentTitle(log(null, []))).toBe("Descent");
  });
});

describe("endpointName", () => {
  const sec = (id: number, features: { t: string; n: string }[]) =>
    ({
      id,
      features: features.map((f) => ({
        feature_type: f.t,
        names: [{ name: f.n, lang_code: "en" }],
      })),
    }) as unknown as SectionWithFeatures;
  const sections = [
    sec(1, [
      { t: "rapid", n: "Big Hole" },
      { t: "put_in", n: "Camp site" },
    ]),
    sec(2, [{ t: "take_out", n: "Bridge" }]),
  ];

  test("put-in comes from the first section, take-out from the last", () => {
    expect(endpointName([1, 2], sections, "put_in")).toBe("Camp site");
    expect(endpointName([1, 2], sections, "take_out")).toBe("Bridge");
  });

  test("no such feature gives nothing", () => {
    expect(endpointName([2, 1], sections, "put_in")).toBeUndefined();
    expect(endpointName([], sections, "put_in")).toBeUndefined();
  });
});
