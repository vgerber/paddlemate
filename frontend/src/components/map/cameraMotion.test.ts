import { describe, expect, test } from "bun:test";
import { cameraScreens, cubicBezier } from "./cameraMotion";

describe("cubicBezier", () => {
  const ease = cubicBezier("cubic-bezier(0.2, 0.8, 0.2, 1)");
  test("fixes the ends and rises monotonically", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const v = ease(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  test("an ease-out is ahead of linear at the start", () => {
    expect(ease(0.2)).toBeGreaterThan(0.4);
  });
  test("matches a known point", () => {
    const sym = cubicBezier("cubic-bezier(0.25, 0.25, 0.75, 0.75)");
    expect(sym(0.3)).toBeCloseTo(0.3, 4);
  });
  test("falls back to linear on garbage", () => {
    expect(cubicBezier("nope")(0.4)).toBe(0.4);
  });
});

describe("cameraScreens", () => {
  const view = { width: 400, height: 800 };
  test("a pan counts on its larger axis", () => {
    expect(
      cameraScreens({ ...view, panX: 120, panY: 0, zoomDelta: 0 }),
    ).toBeCloseTo(0.3);
    expect(
      cameraScreens({ ...view, panX: 0, panY: -800, zoomDelta: 0 }),
    ).toBeCloseTo(1);
  });
  test("zoom adds half a screen per level", () => {
    expect(
      cameraScreens({ ...view, panX: 0, panY: 0, zoomDelta: -3 }),
    ).toBeCloseTo(1.5);
  });
});
