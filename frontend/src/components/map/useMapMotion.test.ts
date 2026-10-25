import { describe, expect, test } from "bun:test";
import {
  cubicBezier,
  drawGradient,
  drawProgress,
  FLOW_FRAMES,
  flowFrames,
  parseBezier,
  shiftedDash,
} from "./useMapMotion";

const total = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("flow frames", () => {
  test("there are twelve and each keeps the pattern length", () => {
    const frames = flowFrames();
    expect(frames).toHaveLength(FLOW_FRAMES);
    for (const f of frames) expect(total(f)).toBeCloseTo(5, 6);
  });

  test("the first frame is the unshifted pattern", () => {
    expect(shiftedDash(2, 3, 0)).toEqual([0, 0, 2, 3]);
  });

  test("a shift past the gap moves into the dash", () => {
    expect(shiftedDash(2, 3, 4)).toEqual([1, 3, 1, 0]);
  });
});

describe("draw-in", () => {
  test("the bezier parser reads css control points", () => {
    expect(parseBezier("cubic-bezier(0.4, 0, 0.2, 1)")).toEqual([
      0.4, 0, 0.2, 1,
    ]);
    expect(parseBezier("linear")).toEqual([0, 0, 1, 1]);
  });

  test("in-out easing is symmetric and slow at both ends", () => {
    const e = cubicBezier([0.4, 0, 0.2, 1]);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    expect(e(0.1)).toBeLessThan(0.1);
    expect(e(0.9)).toBeGreaterThan(0.9);
  });

  test("progress is clamped and finishes at the duration", () => {
    expect(drawProgress(-5)).toBe(0);
    expect(drawProgress(360)).toBe(1);
    expect(drawProgress(9999)).toBe(1);
    expect(drawProgress(100, 0)).toBe(1);
  });

  test("the gradient shows the colour up to the head", () => {
    expect(drawGradient("#123456", 0.25)).toEqual([
      "step",
      ["line-progress"],
      "#123456",
      0.25,
      "transparent",
    ]);
  });
});
