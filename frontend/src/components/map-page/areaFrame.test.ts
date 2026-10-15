import { describe, expect, test } from "bun:test";
import { defaultAreaCircle } from "./areaFrame";

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
