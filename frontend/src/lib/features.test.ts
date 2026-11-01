import { describe, expect, test } from "bun:test";
import { flagOn, requireMaterials } from "./features";

describe("flagOn", () => {
  test("is on unless exactly false", () => {
    expect(flagOn(undefined)).toBe(true);
    expect(flagOn("true")).toBe(true);
    expect(flagOn("")).toBe(true);
    expect(flagOn("false")).toBe(false);
  });
});

describe("requireMaterials", () => {
  test("passes when the wiki is on", () => {
    expect(() => requireMaterials(true)).not.toThrow();
  });

  test("redirects to Tools when it is off", () => {
    try {
      requireMaterials(false);
      throw new Error("did not redirect");
    } catch (e) {
      expect((e as { options?: { to?: string } }).options?.to).toBe("/tools");
    }
  });
});
