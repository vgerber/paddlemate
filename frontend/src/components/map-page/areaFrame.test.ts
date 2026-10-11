import { describe, expect, test } from "bun:test";
import { circleBounds, defaultAreaCircle } from "./areaFrame";

const view = { south: 46, west: 10, north: 48, east: 12 };

describe("defaultAreaCircle", () => {
  test("lands on the middle of the view with the slider's radius", () => {
    expect(defaultAreaCircle(view, 25)).toEqual({
      lat: 47,
      lon: 11,
      radiusKm: 25,
    });
  });

  test("starts at 10 km when no radius is given", () => {
    expect(defaultAreaCircle(view).radiusKm).toBe(10);
  });

  test("moves up to the middle of what a bottom sheet leaves visible", () => {
    const circle = defaultAreaCircle(view, 10, 0.5);
    expect(circle.lat).toBeCloseTo(47.5, 6);
    expect(circle.lon).toBe(11);
  });

  test("a sheet covering nearly everything cannot push the centre off the top", () => {
    expect(defaultAreaCircle(view, 10, 5).lat).toBeLessThanOrEqual(48);
    expect(defaultAreaCircle(view, 10, 5).lat).toBeGreaterThan(47.8);
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
});
