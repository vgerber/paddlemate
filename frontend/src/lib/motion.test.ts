import { describe, expect, test } from "bun:test";
import {
  cameraMs,
  css,
  durations,
  ms,
  releaseMs,
  stepMs,
  transition,
} from "./motion";

describe("transition", () => {
  test("defaults to the base duration and ease out", () => {
    expect(transition("opacity")).toBe(`opacity ${css.base} ${css.easeOut}`);
  });

  test("joins several properties and takes a token duration", () => {
    expect(
      transition(["color", "background-color"], { duration: "fast" }),
    ).toBe(
      `color ${css.fast} ${css.easeOut}, background-color ${css.fast} ${css.easeOut}`,
    );
  });

  test("a computed time overrides the token and is rounded", () => {
    expect(transition("transform", { ms: 120.4, easing: "easeIn" })).toBe(
      `transform 120ms ${css.easeIn}`,
    );
  });
});

describe("scale helpers", () => {
  test("releaseMs grows with distance and caps at 360", () => {
    expect(releaseMs(0)).toBe(220);
    expect(releaseMs(200)).toBe(270);
    expect(releaseMs(5000)).toBe(360);
  });

  test("stepMs grows per step and caps at 300", () => {
    expect(stepMs(1)).toBe(180);
    expect(stepMs(3)).toBe(220);
    expect(stepMs(20)).toBe(300);
  });

  test("cameraMs picks base, slow or a jump", () => {
    expect(cameraMs(0.3)).toBe(durations.base);
    expect(cameraMs(1.2)).toBe(durations.slow);
    expect(cameraMs(3)).toBe(0);
  });

  test("ms is the token, and settle is exported", () => {
    expect(ms("fast")).toBe(durations.fast);
    expect(css.settle).toContain("cubic-bezier");
  });
});
