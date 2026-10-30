import { describe, expect, test } from "bun:test";
import {
  areaCircleCollection,
  mapCursor,
  ringTargetFor,
  selectedSectionCollection,
} from "./mapSelection";

const fc = (ids: number[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: ids.map((id) => ({
    type: "Feature",
    id,
    properties: {},
    geometry: { type: "Point", coordinates: [0, 0] },
  })),
});

describe("selectedSectionCollection", () => {
  test("keeps only the selected id", () => {
    expect(selectedSectionCollection(fc([1, 2, 3]), 2).features).toHaveLength(
      1,
    );
  });
  test("is empty without a selection", () => {
    expect(selectedSectionCollection(fc([1]), null).features).toHaveLength(0);
  });
});

describe("ringTargetFor", () => {
  test("is null with nothing selected", () => {
    expect(ringTargetFor(undefined, null, undefined, null)).toBeNull();
  });
});

describe("areaCircleCollection", () => {
  test("is empty without a circle", () => {
    expect(areaCircleCollection(null).features).toHaveLength(0);
  });
  test("draws a polygon for a circle", () => {
    expect(
      areaCircleCollection({ lat: 47, lon: 13, radiusKm: 5 }).features.length,
    ).toBeGreaterThan(0);
  });
});

describe("mapCursor", () => {
  test("crosshair for any placing mode", () => {
    expect(mapCursor({ area: false, feature: true, pick: false })).toBe(
      "crosshair",
    );
  });
  test("default otherwise", () => {
    expect(mapCursor({ area: false, feature: false, pick: false })).toBe(
      undefined,
    );
  });
});
