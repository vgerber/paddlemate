import { describe, expect, test } from "bun:test";
import { cameraScreens } from "./cameraMotion";

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
