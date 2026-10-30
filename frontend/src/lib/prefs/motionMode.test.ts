import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MOTION_KEY, parseMotionMode, resolveMotion } from "./motionMode";

describe("resolveMotion", () => {
  test("System follows the device", () => {
    expect(resolveMotion("system", true)).toBe("reduced");
    expect(resolveMotion("system", false)).toBe("full");
  });

  test("an explicit choice beats the device", () => {
    expect(resolveMotion("full", true)).toBe("full");
    expect(resolveMotion("reduced", false)).toBe("reduced");
  });
});

describe("parseMotionMode", () => {
  test("unknown or missing values are Full", () => {
    expect(parseMotionMode(null)).toBe("full");
    expect(parseMotionMode("bogus")).toBe("full");
    expect(parseMotionMode("system")).toBe("system");
    expect(parseMotionMode("reduced")).toBe("reduced");
    expect(parseMotionMode("full")).toBe("full");
  });
});

describe("index.html pre-paint script", () => {
  test("reads the same key and sets data-motion", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain(`getItem("${MOTION_KEY}")`);
    expect(html).toContain('"data-motion"');
  });
});
