import { describe, expect, test } from "bun:test";
import {
  bboxArea,
  bboxContains,
  type DrawableRegion,
  labelPoint,
  partOf,
  rangesHiddenByNesting,
  regionSubtitle,
  visibleRegions,
} from "./regionGeometry";

describe("regionSubtitle", () => {
  test("names the country and the level", () => {
    expect(regionSubtitle("AT", "range")).toBe("AT · Mountain ranges");
  });

  test("leaves out a missing country", () => {
    expect(regionSubtitle(null, "valley")).toBe("Valleys");
  });
});

function region(
  id: number,
  kind: string,
  w: number,
  s: number,
  e: number,
  n: number,
): DrawableRegion {
  return {
    id,
    kind,
    bbox: [w, s, e, n],
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    },
  };
}

const VIEW = [0, 0, 10, 10] as const;

describe("bboxContains and bboxArea", () => {
  test("containment includes shared edges and rejects overlap", () => {
    expect(bboxContains([0, 0, 10, 10], [0, 0, 5, 5])).toBe(true);
    expect(bboxContains([0, 0, 10, 10], [5, 5, 11, 8])).toBe(false);
  });

  test("area of a degenerate box is zero", () => {
    expect(bboxArea([1, 1, 1, 5])).toBe(0);
    expect(bboxArea([0, 0, 2, 3])).toBe(6);
  });
});

describe("visibleRegions", () => {
  const big = region(1, "range", 0, 0, 9, 9);
  const a = region(2, "range", 1, 1, 3, 3);
  const b = region(3, "range", 5, 5, 8, 8);

  test("a range holding two other ranges is dropped", () => {
    const ids = visibleRegions([big, a, b], VIEW).map((r) => r.id);
    expect(ids).toEqual([2, 3]);
  });

  test("a range holding only one other range stays", () => {
    const ids = visibleRegions([big, a], VIEW).map((r) => r.id);
    expect(ids).toEqual([1, 2]);
  });

  test("only ranges count as nested", () => {
    const district = region(4, "district", 6, 6, 7, 7);
    const ids = visibleRegions([big, a, district], VIEW).map((r) => r.id);
    expect(ids).toContain(1);
  });

  test("the picked region is never hidden", () => {
    const ids = visibleRegions([big, a, b], VIEW, 1).map((r) => r.id);
    expect(ids).toEqual([1, 2, 3]);
  });

  test("a region under 0.3% of the view waits for a closer zoom", () => {
    const speck = region(5, "district", 1, 1, 1.5, 1.5);
    const fair = region(6, "district", 1, 1, 2, 2);
    const ids = visibleRegions([speck, fair], VIEW).map((r) => r.id);
    expect(ids).toEqual([6]);
  });

  test("a picked speck still shows", () => {
    const speck = region(5, "district", 1, 1, 1.5, 1.5);
    expect(visibleRegions([speck], VIEW, 5)).toHaveLength(1);
  });

  test("without a view nothing is dropped for size", () => {
    const speck = region(5, "district", 1, 1, 1.01, 1.01);
    expect(visibleRegions([speck], null)).toHaveLength(1);
  });
});

describe("labelPoint", () => {
  test("a rectangle is labelled at its middle", () => {
    const p = labelPoint(region(1, "range", 0, 0, 4, 2).geometry);
    expect(p?.[0]).toBeCloseTo(2, 0);
    expect(p?.[1]).toBeCloseTo(1, 0);
  });

  test("a C shape is labelled on the shape, not in its bay", () => {
    const c: GeoJSON.Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 3],
          [3, 3],
          [3, 7],
          [10, 7],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    };
    const p = labelPoint(c);
    expect(p).not.toBeNull();
    const [x, y] = p as [number, number];
    const inBay = x > 3 && y > 3 && y < 7;
    expect(inBay).toBe(false);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(10);
  });

  test("a multipolygon is labelled once, in its biggest part", () => {
    const geometry: GeoJSON.Geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [10, 10],
            [20, 10],
            [20, 20],
            [10, 20],
            [10, 10],
          ],
        ],
      ],
    };
    const p = labelPoint(geometry);
    expect(p?.[0]).toBeGreaterThan(10);
    expect(p?.[1]).toBeGreaterThan(10);
  });

  test("a line is labelled at its middle", () => {
    const p = labelPoint({
      type: "LineString",
      coordinates: [
        [0, 0],
        [4, 0],
        [4, 4],
      ],
    });
    expect(p).toEqual([4, 0]);
  });

  test("an empty line has no label", () => {
    expect(labelPoint({ type: "LineString", coordinates: [] })).toBeNull();
  });
});

describe("rangesHiddenByNesting", () => {
  const big = region(1, "range", 0, 0, 10, 10);
  const a = region(2, "range", 1, 1, 3, 3);
  const b = region(3, "range", 5, 5, 8, 8);

  test("lists a range that holds two others", () => {
    expect(rangesHiddenByNesting([big, a, b]).map((r) => r.id)).toEqual([1]);
  });

  test("agrees with visibleRegions about what is left out", () => {
    const shown = visibleRegions([big, a, b], VIEW).map((r) => r.id);
    const hidden = rangesHiddenByNesting([big, a, b]).map((r) => r.id);
    expect(shown.some((id) => hidden.includes(id))).toBe(false);
  });

  test("never lists the picked range", () => {
    expect(rangesHiddenByNesting([big, a, b], 1)).toHaveLength(0);
  });

  test("ignores districts", () => {
    expect(
      rangesHiddenByNesting([region(4, "district", 0, 0, 10, 10), a, b]),
    ).toHaveLength(0);
  });
});

describe("partOf", () => {
  const state = region(1, "state", 0, 0, 10, 10);
  const district = region(2, "district", 1, 1, 6, 6);
  const valley = region(3, "valley", 2, 2, 3, 3);
  const aside = region(4, "range", 7, 7, 9, 9);

  test("lists the regions around the picked one, nearest first", () => {
    const parents = partOf([state, district, valley, aside], valley);
    expect(parents.map((r) => r.id)).toEqual([2, 1]);
  });

  test("leaves out the picked region and its neighbours", () => {
    expect(partOf([valley, aside], valley)).toHaveLength(0);
  });
});
