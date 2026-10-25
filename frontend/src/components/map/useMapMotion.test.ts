import { describe, expect, test } from "bun:test";
import {
  drawGradient,
  drawProgress,
  FLOW_FRAMES,
  flowFrames,
  isSoftwareRenderer,
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

describe("software renderer", () => {
  test("CPU rasterisers are recognised", () => {
    for (const r of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "softpipe",
      "Mesa Software Rasterizer",
      "Microsoft Basic Render Driver",
    ]) {
      expect(isSoftwareRenderer(r)).toBe(true);
    }
  });

  test("GPUs and unknowns are not", () => {
    for (const r of [
      "Adreno (TM) 730",
      "ANGLE (Apple, Apple M2, OpenGL 4.1)",
      "Mali-G710",
      "",
      null,
      undefined,
    ]) {
      expect(isSoftwareRenderer(r)).toBe(false);
    }
  });
});
