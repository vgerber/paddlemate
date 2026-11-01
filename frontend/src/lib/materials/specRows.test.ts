import { describe, expect, test } from "bun:test";
import type { Material } from "@/lib/api";
import { IMPERIAL, METRIC } from "@/lib/prefs/units";
import { sizeTableRows, specRows } from "./specRows";

function boat(fields: Partial<Material> = {}): Material {
  return {
    id: 1,
    category: "kayak",
    disciplines: ["creek"],
    brand: "Testflow",
    model: "Cascade",
    colors: [],
    siblings: [],
    year_approximate: false,
    availability: "unknown",
    images: [],
    created_by: "u1",
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...fields,
  };
}

describe("specRows", () => {
  test("files a boat's measurements under hull, cockpit and paddler", () => {
    const rows = specRows(
      boat({
        length_cm: 259,
        volume_l: 314.2,
        cockpit_length_cm: 85,
        paddler_weight_min_kg: 70,
        paddler_weight_max_kg: 110,
      }),
      METRIC,
    );
    expect(rows.map((r) => [r.group, r.label, r.value])).toEqual([
      ["Hull", "Length", "259 cm"],
      ["Hull", "Volume", "314.2 l"],
      ["Cockpit", "Cockpit length", "85 cm"],
      ["Paddler", "Body weight", "70-110 kg"],
    ]);
  });

  test("leaves out what the entry does not state", () => {
    expect(specRows(boat(), METRIC)).toEqual([]);
  });

  test("a paddle reads its own specs", () => {
    const rows = specRows(
      boat({ category: "paddle", blade_area_cm2: 645, pieces: 2 }),
      IMPERIAL,
    );
    expect(rows.every((r) => r.group === "Paddle")).toBe(true);
    expect(rows.map((r) => r.label)).toEqual(["Blade area", "Pieces"]);
  });
});

describe("sizeTableRows", () => {
  test("lines the sizes up, one row per measurement", () => {
    const rows = sizeTableRows(
      [
        boat({ id: 1, size: "M", length_cm: 259, volume_l: 314 }),
        boat({ id: 2, size: "L", length_cm: 269 }),
      ],
      METRIC,
    );
    expect(rows.map((r) => [r.label, r.values])).toEqual([
      ["Length", ["259 cm", "269 cm"]],
      ["Volume", ["314 l", ""]],
    ]);
  });

  test("keeps a block together when a later size adds to it", () => {
    const rows = sizeTableRows(
      [
        boat({ id: 1, size: "M", length_cm: 259 }),
        boat({
          id: 2,
          size: "L",
          length_cm: 269,
          paddler_weight_min_kg: 80,
          cockpit_length_cm: 88,
        }),
      ],
      METRIC,
    );
    expect(rows.map((r) => r.group)).toEqual(["Hull", "Cockpit", "Paddler"]);
  });
});
