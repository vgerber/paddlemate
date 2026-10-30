import { describe, expect, test } from "bun:test";
import type { LngLat } from "./geo";
import { routeSection, snapSection, stitchWays } from "./riverSnap";

// A river running east along latitude 47 for about 3 km.
const river: LngLat[] = [
  [10, 47],
  [10.01, 47],
  [10.02, 47],
  [10.03, 47],
  [10.04, 47],
];

describe("stitchWays", () => {
  test("joins touching fragments in either direction", () => {
    const stitched = stitchWays([
      [
        [10.02, 47],
        [10.04, 47],
      ],
      [
        [10.02, 47],
        [10, 47],
      ],
    ]);
    expect(stitched).toEqual([
      [10, 47],
      [10.02, 47],
      [10.04, 47],
    ]);
  });

  test("bridges a gap under 50 m and keeps the longest chain", () => {
    const stitched = stitchWays([
      [
        [10, 47],
        [10.01, 47],
      ],
      [
        [10.0103, 47],
        [10.02, 47],
      ],
      [
        [11, 48],
        [11.0001, 48],
      ],
    ]);
    expect(stitched?.[0]).toEqual([10, 47]);
    expect(stitched?.at(-1)).toEqual([10.02, 47]);
  });

  test("is null for none", () => {
    expect(stitchWays([])).toBeNull();
  });
});

describe("snapSection", () => {
  test("cuts the river between the points, put-in first", () => {
    const section = snapSection(
      river,
      { lat: 47.0002, lon: 10.005 },
      { lat: 46.9998, lon: 10.025 },
    );
    expect(section?.[0][0]).toBeCloseTo(10.005, 4);
    expect(section?.at(-1)?.[0]).toBeCloseTo(10.025, 4);
    expect(section).toHaveLength(4);
  });

  test("runs against the river's direction when the take-out is upstream", () => {
    const section = snapSection(
      river,
      { lat: 47, lon: 10.03 },
      { lat: 47, lon: 10.01 },
    );
    expect(section?.[0][0]).toBeCloseTo(10.03, 4);
    expect(section?.at(-1)?.[0]).toBeCloseTo(10.01, 4);
  });

  test("is null when both points land on the same spot", () => {
    expect(
      snapSection(river, { lat: 47, lon: 10.02 }, { lat: 47.001, lon: 10.02 }),
    ).toBeNull();
  });

  test("clamps points beyond the ends to the ends", () => {
    const section = snapSection(
      river,
      { lat: 47, lon: 9.9 },
      { lat: 47, lon: 10.5 },
    );
    expect(section?.[0]).toEqual([10, 47]);
    expect(section?.at(-1)).toEqual([10.04, 47]);
  });
});

describe("routeSection", () => {
  test("routes across a confluence", () => {
    const tributary: LngLat[] = [
      [10.02, 47.01],
      [10.02, 47],
    ];
    const path = routeSection(
      [river, tributary],
      { lat: 47.01, lon: 10.02 },
      { lat: 47, lon: 10.04 },
    );
    expect(path?.[0]).toEqual([10.02, 47.01]);
    expect(path?.at(-1)?.[0]).toBeCloseTo(10.04, 5);
    expect(path).toContainEqual([10.02, 47]);
  });

  test("is null when a point is more than 300 m from every way", () => {
    expect(
      routeSection(
        [river],
        { lat: 47.01, lon: 10.02 },
        { lat: 47, lon: 10.04 },
      ),
    ).toBeNull();
  });

  test("is null without ways", () => {
    expect(
      routeSection([], { lat: 47, lon: 10 }, { lat: 47, lon: 10.01 }),
    ).toBeNull();
  });
});
