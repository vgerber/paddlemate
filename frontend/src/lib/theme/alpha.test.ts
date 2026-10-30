import { describe, expect, test } from "bun:test";
import { alphas, withAlpha } from "./alpha";

describe("withAlpha", () => {
  test("each step is its old hex byte as a percentage", () => {
    expect(withAlpha("#0e7490", "tint")).toBe(
      "color-mix(in srgb, #0e7490 5.1%, transparent)",
    );
    expect(withAlpha("#0e7490", "wash")).toContain(" 7.84%");
    expect(withAlpha("#0e7490", "hover")).toContain(" 12.16%");
    expect(withAlpha("#0e7490", "strong")).toContain(" 18.04%");
    expect(withAlpha("#0e7490", "hairline")).toContain(" 33.33%");
    expect(withAlpha("#0e7490", "border")).toContain(" 60%");
    expect(withAlpha("#0e7490", "scrim")).toContain(" 80%");
  });

  test("covers every step of the table", () => {
    for (const step of Object.keys(alphas) as (keyof typeof alphas)[]) {
      expect(withAlpha("#000000", step)).toMatch(
        /^color-mix\(in srgb, #000000 [\d.]+%, transparent\)$/,
      );
    }
  });

  test("a number is a percentage", () => {
    expect(withAlpha("#fff", 50.2)).toBe(
      "color-mix(in srgb, #fff 50.2%, transparent)",
    );
    expect(withAlpha("#fff", 100)).toContain(" 100%");
    expect(withAlpha("#fff", 0)).toContain(" 0%");
  });

  test("takes a variable or rgb() as the colour", () => {
    expect(withAlpha("var(--pm-primary)", "hover")).toBe(
      "color-mix(in srgb, var(--pm-primary) 12.16%, transparent)",
    );
    expect(withAlpha("rgb(1, 2, 3)", "wash")).toContain("rgb(1, 2, 3) 7.84%");
  });
});
