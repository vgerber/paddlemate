import { describe, expect, test } from "bun:test";
import { bboxToBounds, boundsOf, circleBounds, mergeBounds } from "./geo";

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
