import { describe, expect, test } from "bun:test";
import {
  bboxToBounds,
  boundsOf,
  circleBounds,
  circleGeoJSON,
  distanceAlongLineM,
  distanceKm,
  distanceM,
  mergeBounds,
  nearestOnLine,
} from "./geo";

describe("boundsOf", () => {
  test("is the box holding every coordinate", () => {
    expect(
      boundsOf([
        [10, 50],
        [12, 49],
        [11, 51],
      ]),
    ).toEqual([
      [10, 49],
      [12, 51],
    ]);
  });

  test("is null for none", () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe("mergeBounds", () => {
  test("holds both boxes and skips a missing one", () => {
    const a: ReturnType<typeof bboxToBounds> = [
      [0, 0],
      [1, 1],
    ];
    const b: ReturnType<typeof bboxToBounds> = [
      [-1, 0.5],
      [0.5, 3],
    ];
    expect(mergeBounds(a, b)).toEqual([
      [-1, 0],
      [1, 3],
    ]);
    expect(mergeBounds(a, null)).toBe(a);
    expect(mergeBounds(null, null)).toBeNull();
  });
});

describe("bboxToBounds", () => {
  test("keeps west, south, east, north", () => {
    expect(bboxToBounds([1, 2, 3, 4])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe("circleBounds", () => {
  test("is centred on the circle and grows with the radius", () => {
    const small = circleBounds({ lat: 47, lon: 11, radiusKm: 10 });
    const large = circleBounds({ lat: 47, lon: 11, radiusKm: 20 });
    expect((small[0][1] + small[1][1]) / 2).toBeCloseTo(47, 6);
    expect((small[0][0] + small[1][0]) / 2).toBeCloseTo(11, 6);
    expect(large[1][1] - large[0][1]).toBeCloseTo(
      2 * (small[1][1] - small[0][1]),
      6,
    );
  });

  test("is wider in degrees of longitude away from the equator", () => {
    const b = circleBounds({ lat: 60, lon: 0, radiusKm: 10 });
    expect(b[1][0] - b[0][0]).toBeGreaterThan(b[1][1] - b[0][1]);
  });

  test("a degree of latitude is 111 km", () => {
    const [[, south], [, north]] = circleBounds({
      lat: 0,
      lon: 0,
      radiusKm: 111,
    });
    expect(south).toBeCloseTo(-1);
    expect(north).toBeCloseTo(1);
  });

  test("longitude widens with latitude", () => {
    const [[west], [east]] = circleBounds({ lat: 60, lon: 10, radiusKm: 111 });
    expect(east - west).toBeCloseTo(4, 1);
  });
});

describe("distanceKm and distanceM", () => {
  test("measure along the ground in the stated unit", () => {
    // One degree of longitude on the equator is about 111.19 km.
    expect(distanceKm([0, 0], [1, 0])).toBeCloseTo(111.19, 1);
    expect(distanceM([0, 0], [1, 0])).toBeCloseTo(111_195, -2);
  });

  test("shrink with latitude", () => {
    expect(distanceKm([10, 60], [11, 60])).toBeCloseTo(55.6, 0);
  });

  test("are zero for the same point", () => {
    expect(distanceM([10, 47], [10, 47])).toBe(0);
  });

  test("go the short way across the antimeridian", () => {
    expect(distanceKm([179.5, 0], [-179.5, 0])).toBeCloseTo(111.19, 1);
  });
});

describe("nearestOnLine", () => {
  const line: [number, number][] = [
    [10, 47],
    [10.01, 47],
    [10.02, 47],
  ];

  test("projects onto the segment and reports distance and arc position", () => {
    const hit = nearestOnLine(line, [10.005, 47.0009]);
    expect(hit.point[0]).toBeCloseTo(10.005, 5);
    expect(hit.point[1]).toBeCloseTo(47, 5);
    expect(hit.distanceM).toBeCloseTo(100, -1);
    expect(hit.arcM).toBeCloseTo(distanceM(line[0], line[1]) / 2, -1);
  });

  test("clamps a point beyond either end to that end", () => {
    const before = nearestOnLine(line, [9.9, 47]);
    expect(before.point).toEqual([10, 47]);
    expect(before.arcM).toBe(0);
    const after = nearestOnLine(line, [10.5, 47]);
    expect(after.point).toEqual([10.02, 47]);
    expect(after.arcM).toBeCloseTo(distanceM(line[0], line[2]), 0);
  });

  test("copes with a zero-length segment", () => {
    const hit = nearestOnLine(
      [
        [10, 47],
        [10, 47],
        [10.01, 47],
      ],
      [10.005, 47],
    );
    expect(hit.point[0]).toBeCloseTo(10.005, 5);
    expect(Number.isFinite(hit.arcM)).toBe(true);
  });

  test("handles a line that is not a line", () => {
    expect(nearestOnLine([], [10, 47]).distanceM).toBe(
      Number.POSITIVE_INFINITY,
    );
    const single = nearestOnLine([[10, 47]], [10.001, 47]);
    expect(single.point).toEqual([10, 47]);
    expect(single.arcM).toBe(0);
  });

  test("finds the closer of two branches of a bent line", () => {
    const bent: [number, number][] = [
      [10, 47],
      [10.01, 47],
      [10.01, 47.01],
    ];
    const hit = nearestOnLine(bent, [10.011, 47.005]);
    expect(hit.point[0]).toBeCloseTo(10.01, 5);
    expect(hit.point[1]).toBeCloseTo(47.005, 3);
  });
});

describe("distanceAlongLineM", () => {
  const line: [number, number][] = [
    [10, 47],
    [10.01, 47],
    [10.02, 47],
  ];

  test("is the arc length to the nearest point", () => {
    expect(distanceAlongLineM([10.02, 47], line)).toBeCloseTo(
      distanceM(line[0], line[2]),
      0,
    );
    expect(distanceAlongLineM([10, 47], line)).toBe(0);
  });

  test("is zero for a line with fewer than two points", () => {
    expect(distanceAlongLineM([10, 47], [[10, 47]])).toBe(0);
  });
});

describe("circleGeoJSON", () => {
  test("is a closed ring whose vertices sit one radius from the centre", () => {
    const ring = circleGeoJSON(47, 10, 10).features[0].geometry;
    if (ring.type !== "Polygon") throw new Error("not a polygon");
    const coords = ring.coordinates[0] as [number, number][];
    expect(coords).toHaveLength(65);
    expect(coords[0]).toEqual(coords[64]);
    for (const c of coords) expect(distanceKm([10, 47], c)).toBeCloseTo(10, 1);
  });

  test("honours the step count", () => {
    const ring = circleGeoJSON(0, 0, 1, 8).features[0].geometry;
    if (ring.type !== "Polygon") throw new Error("not a polygon");
    expect(ring.coordinates[0]).toHaveLength(9);
  });
});
