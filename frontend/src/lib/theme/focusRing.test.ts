import { describe, expect, test } from "bun:test";
import { focusRing, focusRingSx } from "./focusRing";

describe("focusRing", () => {
  test("is a 2px primary outline at the given offset", () => {
    expect(focusRing().outline).toContain("2px solid");
    expect(focusRing().outlineOffset).toBe(2);
    expect(focusRing(-2).outlineOffset).toBe(-2);
  });

  test("the sx fragment covers :focus-visible and MUI's class", () => {
    const [key] = Object.keys(focusRingSx(0));
    expect(key).toContain(":focus-visible");
    expect(key).toContain(".Mui-focusVisible");
  });
});
