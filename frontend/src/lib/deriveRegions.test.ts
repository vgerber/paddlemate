import { describe, expect, it } from "bun:test";
import {
  classifyElements,
  mergeRegions,
  type PointRegions,
  samplePoints,
} from "./deriveRegions";

function regions(
  valleys: string[],
  districts: string[] = [],
  states: string[] = [],
  ranges: string[] = [],
): PointRegions {
  return { valleys, districts, states, ranges };
}

describe("samplePoints", () => {
  it("takes start, middle and end", () => {
    const points = samplePoints([
      [10.9, 47.1],
      [10.95, 47.15],
      [11.0, 47.2],
    ]);
    expect(points).toEqual([
      [10.9, 47.1],
      [10.95, 47.15],
      [11.0, 47.2],
    ]);
  });

  it("dedupes a degenerate line", () => {
    expect(
      samplePoints([
        [10.9, 47.1],
        [10.9, 47.1],
      ]),
    ).toEqual([[10.9, 47.1]]);
  });

  it("handles an empty line", () => {
    expect(samplePoints([])).toEqual([]);
  });
});

describe("classifyElements", () => {
  it("splits areas by admin level and keeps valleys", () => {
    const out = classifyElements([
      { type: "area", tags: { name: "Tirol", admin_level: "4" } },
      { type: "area", tags: { name: "Bezirk Imst", admin_level: "6" } },
      {
        type: "area",
        tags: { name: "Ötztaler Alpen", place: "region" },
      },
      { type: "way", tags: { name: "Ötztal", natural: "valley" } },
      { type: "way", tags: { natural: "valley" } },
    ]);
    expect(out.states).toEqual(["Tirol"]);
    expect(out.districts).toEqual(["Bezirk Imst"]);
    expect(out.ranges).toEqual(["Ötztaler Alpen"]);
    expect(out.valleys).toEqual(["Ötztal"]);
  });
});

describe("mergeRegions", () => {
  it("keeps the majority valley and orders admin after", () => {
    const merged = mergeRegions([
      regions(["Ötztal", "Sulztal"], ["Bezirk Imst"], ["Tirol"]),
      regions(["Ötztal"], ["Bezirk Imst"], ["Tirol"]),
      regions(["Ötztal"], [], ["Tirol"]),
    ]);
    expect(merged).toEqual(["Ötztal", "Bezirk Imst", "Tirol"]);
  });

  it("keeps tied valleys (Engadin and Oberengadin)", () => {
    const merged = mergeRegions([
      regions(["Engadin", "Oberengadin"], ["Maloja"], ["Graubünden"]),
      regions(["Engadin", "Oberengadin"], ["Maloja"], ["Graubünden"]),
    ]);
    expect(merged).toEqual(["Engadin", "Oberengadin", "Maloja", "Graubünden"]);
  });

  it("returns admin regions when no valley exists", () => {
    const merged = mergeRegions([regions([], ["Seljord"], ["Telemark"])]);
    expect(merged).toEqual(["Seljord", "Telemark"]);
  });

  it("is empty for no samples", () => {
    expect(mergeRegions([])).toEqual([]);
  });
});
